"""FastAPI app (spec §4.1). Locally it listens on localhost or the compose network; on Vercel (spec §10) it is a public
function whose every endpoint except /health needs an internal token (or, for /coach/run, the cron secret). Next is its
only user-facing client."""

import asyncio
import hmac
import logging
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Annotated, Literal

import psycopg
from fastapi import Depends, FastAPI, Header, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import BaseModel, Field
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.formparsers import MultiPartParser
from starlette.types import ASGIApp, Receive, Scope, Send

from . import groq_speech, speech
from . import receipt as receipt_mod
from .agent import build_agent
from .api_client import CoinflowClient, InternalClient
from .auth import require_user
from .coach.job import CoachRunner, make_polisher
from .coach.job import start_coach as start_coach_scheduler
from .context import AgentContext
from .llm import make_chat_model, make_vision_model
from .proposals import Uuid
from .settings import Settings, get_settings
from .stream import chat_events

log = logging.getLogger("coinflow.agent")
# Spec §10: Vercel refuses request bodies over 4.5 MB, so both caps are 4 MB (the web proxy checks the same numbers).
MAX_AUDIO_BYTES = 4 * 1024 * 1024
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MULTIPART_OVERHEAD = 64 * 1024
# Starlette spools multipart files to a temp file on disk above 1 MB. Audio is memory-only and receipts are never stored
# (spec §4.5), so keep every allowed upload in memory: the cap is enforced before parsing, below.
MultiPartParser.spool_max_size = MAX_AUDIO_BYTES + MULTIPART_OVERHEAD
TOO_BIG = {
    "/stt": (MAX_AUDIO_BYTES, "audio_too_large", "That recording is too big. Keep voice notes under 30 seconds."),
    "/receipt": (MAX_IMAGE_BYTES, "image_too_large", "That photo is over 4 MB. Try a closer, smaller shot."),
}
AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4"}
ThreadId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
User = Annotated[str, Depends(require_user)]


class _TooBig(Exception):
    pass


class UploadLimit:
    """Refuses oversize uploads before Starlette parses (or spools) the multipart body: by Content-Length, and by counting
    streamed bytes when there is none."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        rule = TOO_BIG.get(scope["path"]) if scope["type"] == "http" and scope["method"] == "POST" else None
        if rule is None:
            await self.app(scope, receive, send)
            return
        limit, code, message = rule
        cap = limit + MULTIPART_OVERHEAD
        declared = Headers(scope=scope).get("content-length", "")
        refuse = err(413, code, message)
        if declared.isdigit() and int(declared) > cap:
            await refuse(scope, receive, send)
            return
        seen = 0
        exceeded = False

        async def counting_receive() -> dict:
            nonlocal seen, exceeded
            message_ = await receive()
            if message_["type"] == "http.request":
                seen += len(message_.get("body", b""))
                if seen > cap:
                    exceeded = True
                    raise _TooBig
            return message_

        async def mute_after_exceeded(message_: dict) -> None:
            if not exceeded:  # FastAPI turns the abort into its own 400; swallow it so the 413 below is what the client sees
                await send(message_)

        try:
            await self.app(scope, counting_receive, mute_after_exceeded)
        except _TooBig:
            pass
        if exceeded:
            await refuse(scope, receive, send)


def err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def thread_key(user_id: str, thread_id: str | None) -> str:
    return f"user:{user_id}:{thread_id or 'main'}"  # threads are namespaced by user: nobody can open someone else's


def with_search_path(url: str) -> str:
    return f"{url}{'&' if '?' in url else '?'}options=-csearch_path%3Dagent"


async def ensure_agent_schema(url: str) -> None:
    async with await psycopg.AsyncConnection.connect(url, autocommit=True) as conn:
        await conn.execute("create schema if not exists agent")


async def open_checkpointer(stack: AsyncExitStack, url: str):  # noqa: ANN201
    """LangGraph's Postgres checkpointer in schema "agent" (spec §4.3). A small pool that checks each connection before
    use, rather than one long-lived connection: on Vercel an instance can outlive a connection (Neon suspends idle
    computes), and a dead connection must not fail the next chat. Works with Neon's direct URL (?sslmode=require)."""
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool

    await ensure_agent_schema(url)
    pool = AsyncConnectionPool(
        with_search_path(url),
        min_size=1,
        max_size=4,
        max_idle=120,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        check=AsyncConnectionPool.check_connection,
        open=False,
    )
    await pool.open(wait=True, timeout=15)
    stack.push_async_callback(pool.close)
    saver = AsyncPostgresSaver(pool)
    await saver.setup()
    return saver


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    s: Settings = app.state.settings
    async with AsyncExitStack() as stack:
        if app.state.agent is None and s.llm_configured:
            saver = await open_checkpointer(stack, s.agent_database_url) if s.checkpointer == "postgres" else InMemorySaver()
            app.state.agent = build_agent(make_chat_model(s), saver, planner_engine=s.planner_engine)
        # Cron mode (Vercel): no in-process scheduler; a daily Vercel Cron calls /coach/run instead (spec §10).
        if app.state.start_coach and s.coach_enabled and s.agent_shared_secret and s.coach_mode == "scheduler":
            scheduler = start_coach_scheduler(s)
            stack.callback(scheduler.shutdown, wait=False)
        yield


def stt_ready(s: Settings) -> bool:
    return groq_speech.configured(s) if s.stt_provider == "groq" else speech.stt_available()


def tts_ready(s: Settings) -> bool:
    return groq_speech.configured(s) if s.tts_provider == "groq" else speech.tts_available()


def cron_authorized(s: Settings, authorization: str | None) -> bool:
    if not s.cron_secret or not authorization:
        return False  # no secret configured: the endpoint can't be called at all
    return hmac.compare_digest(authorization.encode(), f"Bearer {s.cron_secret}".encode())


class ChatContext(BaseModel):
    route: str = Field(default="/home", max_length=200)
    groupId: Uuid | None = None


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    threadId: ThreadId | None = None
    context: ChatContext = ChatContext()
    source: Literal["chat", "voice", "scan"] = "chat"


class OutcomeIn(BaseModel):
    threadId: ThreadId | None = None
    proposalId: str = Field(max_length=64)
    outcome: Literal["approved", "dismissed", "edited"]
    summary: str = Field(max_length=300)


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


def create_app(
    settings: Settings | None = None,
    *,
    agent=None,  # noqa: ANN001
    api_transport=None,  # noqa: ANN001
    speech_transport=None,  # noqa: ANN001
    start_coach: bool = True,
) -> FastAPI:
    app = FastAPI(title="Coinflow agent", lifespan=lifespan)
    app.state.settings = settings or get_settings()
    app.state.agent = agent
    app.state.api_transport = api_transport
    app.state.speech_transport = speech_transport
    app.state.start_coach = start_coach
    app.add_middleware(UploadLimit)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
        return JSONResponse({"error": detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def invalid(_req: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {"msg": "Please check your input."}
        return err(422, "invalid", str(first.get("msg")))

    @app.get("/health")
    async def health(request: Request) -> dict:
        s: Settings = request.app.state.settings
        return {
            "ok": True,
            "capabilities": {
                "chat": request.app.state.agent is not None,
                "vision": s.vision_configured,
                "stt": stt_ready(s),
                "tts": tts_ready(s),
            },
        }

    @app.post("/chat")
    async def chat(body: ChatIn, request: Request, user_id: User) -> Response:
        agent = request.app.state.agent
        if agent is None:
            return err(503, "llm_unavailable", "The assistant isn’t set up yet.")
        s: Settings = request.app.state.settings
        api = CoinflowClient(s.coinflow_api_url, s.agent_shared_secret, user_id, transport=request.app.state.api_transport)
        ctx = AgentContext(user_id=user_id, api=api, route=body.context.route, group_id=body.context.groupId, source=body.source)

        async def events():  # noqa: ANN202
            try:
                async for chunk in chat_events(
                    agent,
                    body.message,
                    thread_key(user_id, body.threadId),
                    ctx,
                    timeout_s=s.llm_timeout_s,
                    client_thread=body.threadId or "main",
                ):
                    yield chunk
            finally:
                await api.aclose()

        return StreamingResponse(
            events(), media_type="text/event-stream", headers={"cache-control": "no-cache", "x-accel-buffering": "no"}
        )

    @app.post("/chat/outcome", status_code=204)
    async def outcome(body: OutcomeIn, request: Request, user_id: User) -> Response:
        agent = request.app.state.agent
        if agent is not None:
            verb = {"approved": "approved, and Coinflow saved it", "dismissed": "dismissed", "edited": "opened to edit"}[
                body.outcome
            ]
            note = HumanMessage(content=f"(Coinflow note, not from the user: the user {verb}: the proposal “{body.summary}”.)")
            await agent.aupdate_state({"configurable": {"thread_id": thread_key(user_id, body.threadId)}}, {"messages": [note]})
        return Response(status_code=204)

    @app.post("/stt")
    async def stt(file: UploadFile, request: Request, user_id: User) -> Response:
        s: Settings = request.app.state.settings
        if not stt_ready(s):
            return err(503, "stt_unavailable", "Voice isn’t installed on the assistant.")
        content_type = (file.content_type or "").split(";")[0].strip()
        if content_type not in AUDIO_TYPES:
            return err(415, "audio_type", "Send a webm, ogg, mp4 or wav recording.")
        data = await file.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            return err(413, "audio_too_large", "That recording is too big. Keep voice notes under 30 seconds.")
        try:
            if s.stt_provider == "groq":
                name = file.filename or "voice.webm"
                text = await groq_speech.transcribe(data, name, content_type, s, transport=request.app.state.speech_transport)
            else:
                text = await run_in_threadpool(speech.transcribe_bytes, data, s)
        except speech.AudioTooLong:
            return err(413, "audio_too_long", "Keep voice notes under 30 seconds.")
        except groq_speech.SpeechTimeout:
            return err(504, "stt_timeout", "Transcribing took too long. Try again, or type it.")
        except groq_speech.SpeechUpstreamError as exc:
            log.warning("stt provider error %s", exc.status)
            if exc.client_error:
                return err(422, "audio_unreadable", "I couldn’t make that out. Try again, or type it.")
            return err(503, "stt_unavailable", "Voice is busy right now. Try again in a moment, or type it.")
        except Exception:
            log.exception("stt failed")
            return err(422, "audio_unreadable", "I couldn’t make that out. Try again, or type it.")
        finally:
            del data  # audio is never kept (spec §4.5)
        return JSONResponse({"text": text})

    @app.post("/tts")
    async def tts(body: TtsIn, request: Request, user_id: User) -> Response:
        s: Settings = request.app.state.settings
        if not tts_ready(s):
            return err(503, "tts_unavailable", "Read-aloud isn’t installed on the assistant.")
        try:
            if s.tts_provider == "groq":
                wav = await groq_speech.synthesize(body.text, s, transport=request.app.state.speech_transport)
            else:
                wav = await run_in_threadpool(speech.synthesize_wav, body.text, s)
        except groq_speech.SpeechTimeout:
            return err(504, "tts_timeout", "Reading that aloud took too long.")
        except Exception:
            log.exception("tts failed")
            return err(502, "tts_failed", "Couldn’t read that aloud.")
        return Response(wav, media_type="audio/wav")

    @app.post("/receipt")
    async def scan(file: UploadFile, request: Request, user_id: User) -> Response:
        s: Settings = request.app.state.settings
        if not s.vision_configured:
            return err(503, "vision_unavailable", "Receipt scanning needs a vision model (LLM_VISION_MODEL).")
        data = await file.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            return err(413, "image_too_large", "That photo is over 4 MB. Try a closer, smaller shot.")
        mime = receipt_mod.sniff_image(data)
        if not mime:
            return err(415, "image_type", "Send a PNG, JPEG or WebP photo of the receipt.")
        try:
            raw = await asyncio.wait_for(
                receipt_mod.read_receipt(make_vision_model(s), data, mime, mode=s.receipt_json_mode), timeout=s.llm_timeout_s
            )
        except TimeoutError:
            return err(504, "llm_timeout", "Reading the receipt took too long. Please try again.")
        except Exception:
            log.exception("receipt failed")
            return err(502, "receipt_unreadable", "I couldn’t read that receipt. Try a sharper, flatter photo.")
        finally:
            del data  # images are never stored
        return JSONResponse(receipt_mod.normalize_receipt(raw).model_dump())

    # Spec §10: the coach in cron mode. Vercel Cron sends GET with "Authorization: Bearer $CRON_SECRET"; POST is accepted
    # too, for a manual run. The server still caps coach notifications at 2 a day and dedupes them.
    @app.api_route("/coach/run", methods=["GET", "POST"])
    async def coach_run(request: Request, authorization: Annotated[str | None, Header()] = None) -> Response:
        s: Settings = request.app.state.settings
        if s.coach_mode != "cron":
            return err(404, "not_found", "Not found.")
        if not cron_authorized(s, authorization):
            return err(401, "unauthorized", "Missing or wrong cron secret.")
        client = InternalClient(s.coinflow_api_url, s.agent_shared_secret, transport=request.app.state.api_transport)
        try:
            summary = await CoachRunner(client, polish=make_polisher(s)).run_all()
        except Exception:
            log.exception("coach run failed")
            return err(502, "coach_failed", "The coach couldn’t reach Coinflow.")
        finally:
            await client.aclose()
        log.info("coach run %s", summary)
        return JSONResponse(summary)

    return app


app = create_app()
