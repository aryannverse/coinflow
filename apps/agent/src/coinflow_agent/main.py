"""FastAPI app (spec §4.1). Listens on localhost or the compose network only; Next is its only client."""

import asyncio
import logging
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Annotated, Literal

import psycopg
from fastapi import Depends, FastAPI, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import receipt as receipt_mod
from . import speech
from .agent import build_agent
from .api_client import CoinflowClient
from .auth import require_user
from .coach.job import start_coach as start_coach_scheduler
from .context import AgentContext
from .llm import make_chat_model, make_vision_model
from .proposals import Uuid
from .settings import Settings, get_settings
from .stream import chat_events

log = logging.getLogger("coinflow.agent")
MAX_AUDIO_BYTES = 6 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # spec §4.5
AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4"}
ThreadId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
User = Annotated[str, Depends(require_user)]


def err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def thread_key(user_id: str, thread_id: str | None) -> str:
    return f"user:{user_id}:{thread_id or 'main'}"  # threads are namespaced by user: nobody can open someone else's


def with_search_path(url: str) -> str:
    return f"{url}{'&' if '?' in url else '?'}options=-csearch_path%3Dagent"


async def ensure_agent_schema(url: str) -> None:
    async with await psycopg.AsyncConnection.connect(url, autocommit=True) as conn:
        await conn.execute("create schema if not exists agent")


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    s: Settings = app.state.settings
    async with AsyncExitStack() as stack:
        if app.state.agent is None and s.llm_configured:
            if s.checkpointer == "postgres":
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

                await ensure_agent_schema(s.agent_database_url)
                saver = await stack.enter_async_context(
                    AsyncPostgresSaver.from_conn_string(with_search_path(s.agent_database_url))
                )
                await saver.setup()
            else:
                saver = InMemorySaver()
            app.state.agent = build_agent(make_chat_model(s), saver)
        if app.state.start_coach and s.coach_enabled and s.agent_shared_secret:
            scheduler = start_coach_scheduler(s)
            stack.callback(scheduler.shutdown, wait=False)
        yield


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


def create_app(settings: Settings | None = None, *, agent=None, api_transport=None, start_coach: bool = True) -> FastAPI:  # noqa: ANN001
    app = FastAPI(title="Coinflow agent", lifespan=lifespan)
    app.state.settings = settings or get_settings()
    app.state.agent = agent
    app.state.api_transport = api_transport
    app.state.start_coach = start_coach

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
                "stt": speech.stt_available(),
                "tts": speech.tts_available(),
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
        if not speech.stt_available():
            return err(503, "stt_unavailable", "Voice isn’t installed on the assistant.")
        if (file.content_type or "").split(";")[0].strip() not in AUDIO_TYPES:
            return err(415, "audio_type", "Send a webm, ogg, mp4 or wav recording.")
        data = await file.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            return err(413, "audio_too_large", "That recording is too big. Keep voice notes under 30 seconds.")
        try:
            text = await run_in_threadpool(speech.transcribe_bytes, data, request.app.state.settings)
        except speech.AudioTooLong:
            return err(413, "audio_too_long", "Keep voice notes under 30 seconds.")
        except Exception:
            log.exception("stt failed")
            return err(422, "audio_unreadable", "I couldn’t make that out. Try again, or type it.")
        finally:
            del data  # audio is never kept (spec §4.5)
        return JSONResponse({"text": text})

    @app.post("/tts")
    async def tts(body: TtsIn, request: Request, user_id: User) -> Response:
        if not speech.tts_available():
            return err(503, "tts_unavailable", "Read-aloud isn’t installed on the assistant.")
        try:
            wav = await run_in_threadpool(speech.synthesize_wav, body.text, request.app.state.settings)
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
            return err(413, "image_too_large", "That photo is over 5 MB. Try a closer, smaller shot.")
        mime = receipt_mod.sniff_image(data)
        if not mime:
            return err(415, "image_type", "Send a PNG, JPEG or WebP photo of the receipt.")
        try:
            raw = await asyncio.wait_for(receipt_mod.read_receipt(make_vision_model(s), data, mime), timeout=s.llm_timeout_s)
        except TimeoutError:
            return err(504, "llm_timeout", "Reading the receipt took too long. Please try again.")
        except Exception:
            log.exception("receipt failed")
            return err(502, "receipt_unreadable", "I couldn’t read that receipt. Try a sharper, flatter photo.")
        finally:
            del data  # images are never stored
        return JSONResponse(receipt_mod.normalize_receipt(raw).model_dump())

    return app


app = create_app()
