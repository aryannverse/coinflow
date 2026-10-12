import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import InMemorySaver

from coinflow_agent import receipt, speech
from coinflow_agent.agent import build_agent
from coinflow_agent.auth import AUD_SERVICE, SERVICE_SUB, sign_token
from coinflow_agent.main import create_app
from tests.conftest import SECRET
from tests.fake_llm import ScriptedChatModel, call, say

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def bearer(sub: str = "user_1", **kw) -> dict[str, str]:  # noqa: ANN003
    return {"authorization": f"Bearer {sign_token(SECRET, sub, **kw)}"}


def client(settings, *, script=None, fake_api=None) -> TestClient:  # noqa: ANN001
    agent = None
    model = None
    if script is not None:
        model = ScriptedChatModel(script=script)
        agent = build_agent(model, InMemorySaver(), planner_model=ScriptedChatModel(script=[]))
    app = create_app(settings, agent=agent, api_transport=fake_api.transport() if fake_api else None, start_coach=False)
    c = TestClient(app)
    c.model = model  # type: ignore[attr-defined]
    return c


def test_health_reports_capabilities(settings):
    r = client(settings).get("/health")
    assert r.json() == {
        "ok": True,
        "capabilities": {"chat": False, "vision": False, "stt": speech.stt_available(), "tts": speech.tts_available()},
    }


def test_chat_needs_a_valid_user_token(settings):
    c = client(settings, script=[say("hi")])
    assert c.post("/chat", json={"message": "hi"}).json() == {"error": {"code": "unauthorized", "message": "Missing token."}}
    assert c.post("/chat", json={"message": "hi"}, headers=bearer(SERVICE_SUB, aud=AUD_SERVICE)).status_code == 401
    assert c.post("/chat", json={"message": "hi"}, headers=bearer(now=1_000_000)).status_code == 401  # long expired


def test_chat_without_an_llm_is_llm_unavailable(settings):
    r = client(settings).post("/chat", json={"message": "hi"}, headers=bearer())
    assert r.status_code == 503 and r.json()["error"]["code"] == "llm_unavailable"


def test_chat_streams_sse_end_to_end(settings, fake_api):
    c = client(
        settings,
        script=[call("propose_expense", {"amount_rupees": "250", "category": "Food & Dining"}), say("Drafted.")],
        fake_api=fake_api,
    )
    r = c.post("/chat", json={"message": "250 lunch", "context": {"route": "/home"}, "source": "voice"}, headers=bearer())
    assert r.headers["content-type"].startswith("text/event-stream")
    assert "event: proposal" in r.text and '"source": "voice"' in r.text and r.text.rstrip().endswith('{"threadId": "main"}')


def test_threads_are_per_user_and_outcomes_are_logged(settings, fake_api):
    c = client(settings, script=[say("a"), say("b"), say("c")], fake_api=fake_api)
    c.post("/chat", json={"message": "secret plans"}, headers=bearer("user_1"))
    c.post("/chat", json={"message": "hello"}, headers=bearer("user_2"))
    assert all("secret plans" not in str(m.content) for m in c.model.seen[1])  # user_2 never sees user_1's thread
    r = c.post(
        "/chat/outcome", json={"proposalId": "p1", "outcome": "approved", "summary": "Expense ₹250"}, headers=bearer("user_1")
    )
    assert r.status_code == 204
    c.post("/chat", json={"message": "and now?"}, headers=bearer("user_1"))
    assert any("approved" in str(m.content) and "Expense ₹250" in str(m.content) for m in c.model.seen[2])


def test_stt_transcribes_with_a_mocked_whisper(settings, monkeypatch):
    monkeypatch.setattr(speech, "stt_available", lambda: True)
    monkeypatch.setattr(speech, "transcribe_bytes", lambda data, s: "two fifty for lunch")
    r = client(settings).post("/stt", files={"file": ("a.webm", b"\x1aE\xdf\xa3", "audio/webm;codecs=opus")}, headers=bearer())
    assert r.json() == {"text": "two fifty for lunch"}


def test_stt_refuses_long_or_odd_audio(settings, monkeypatch):
    monkeypatch.setattr(speech, "stt_available", lambda: True)

    def too_long(data, s):  # noqa: ANN001, ANN202
        raise speech.AudioTooLong()

    monkeypatch.setattr(speech, "transcribe_bytes", too_long)
    c = client(settings)
    assert (
        c.post("/stt", files={"file": ("a.wav", b"RIFF", "audio/wav")}, headers=bearer()).json()["error"]["code"]
        == "audio_too_long"
    )
    assert c.post("/stt", files={"file": ("a.txt", b"hi", "text/plain")}, headers=bearer()).status_code == 415


def test_tts_returns_wav(settings, monkeypatch):
    monkeypatch.setattr(speech, "tts_available", lambda: True)
    monkeypatch.setattr(speech, "synthesize_wav", lambda text, s: b"RIFF0000WAVEfmt ")
    r = client(settings).post("/tts", json={"text": "Your Safe-to-Spend is ₹12,345."}, headers=bearer())
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav" and r.content.startswith(b"RIFF")


def test_receipt_needs_a_vision_model(settings):
    r = client(settings).post("/receipt", files={"file": ("r.png", PNG, "image/png")}, headers=bearer())
    assert r.status_code == 503 and r.json()["error"]["code"] == "vision_unavailable"


def test_receipt_parses_with_a_fake_vision_model(settings, monkeypatch):
    vision = settings.model_copy(update={"llm_base_url": "http://llm.test/v1", "llm_vision_model": "vision"})

    async def fake_read(model, data, mime, *, mode):  # noqa: ANN001, ANN202
        assert mime == "image/png" and mode == "json_object"
        return receipt.RawReceipt(
            merchant="Toit",
            date=None,
            items=[receipt.RawItem(name="Thali", amount="250")],
            tax=None,
            tip=None,
            discount=None,
            total="250",
            confidence=0.8,
        )

    monkeypatch.setattr(receipt, "read_receipt", fake_read)
    r = client(vision).post("/receipt", files={"file": ("r.png", PNG, "image/png")}, headers=bearer())
    assert r.json()["items"] == [{"name": "Thali", "amountPaise": 25_000}] and r.json()["mismatch"] is False


def test_uploads_are_capped_at_4_mb_under_vercels_body_limit():
    from coinflow_agent import main

    assert main.MAX_AUDIO_BYTES == main.MAX_IMAGE_BYTES == 4 * 1024 * 1024  # Vercel refuses request bodies over 4.5 MB


def test_an_unreadable_vision_reply_is_receipt_unreadable(settings, monkeypatch):
    from coinflow_agent import main

    vision = settings.model_copy(update={"llm_base_url": "http://llm.test/v1", "llm_vision_model": "vision"})
    monkeypatch.setattr(main, "make_vision_model", lambda s: ScriptedChatModel(script=[say("```json\n{not json\n```")]))
    r = client(vision).post("/receipt", files={"file": ("r.png", PNG, "image/png")}, headers=bearer())
    assert r.status_code == 502 and r.json()["error"]["code"] == "receipt_unreadable"


@pytest.mark.parametrize(
    ("body", "status"), [(b"hello", 415), (PNG + b"0" * (4 * 1024 * 1024), 413), (PNG + b"0" * (5 * 1024 * 1024), 413)]
)
def test_receipt_refuses_non_images_and_big_files(settings, body, status):
    vision = settings.model_copy(update={"llm_base_url": "http://llm.test/v1", "llm_vision_model": "vision"})
    assert client(vision).post("/receipt", files={"file": ("r.png", body, "image/png")}, headers=bearer()).status_code == status


def test_oversize_content_length_is_refused_before_the_body_is_parsed(settings, monkeypatch):
    vision = settings.model_copy(update={"llm_base_url": "http://llm.test/v1", "llm_vision_model": "vision"})

    def never(*_a, **_k):  # noqa: ANN002, ANN003, ANN202
        raise AssertionError("the multipart body must not be parsed")

    monkeypatch.setattr("starlette.requests.Request._get_form", never)
    c = client(vision)
    r = c.post(
        "/receipt",
        content=b"x" * 64,
        headers={
            **bearer(),
            "content-type": "multipart/form-data; boundary=x",
            "content-length": str(4 * 1024 * 1024 + 70 * 1024),
        },
    )
    assert r.status_code == 413 and r.json() == {
        "error": {"code": "image_too_large", "message": "That photo is over 4 MB. Try a closer, smaller shot."}
    }
    r = c.post(
        "/stt",
        content=b"x" * 64,
        headers={
            **bearer(),
            "content-type": "multipart/form-data; boundary=x",
            "content-length": str(4 * 1024 * 1024 + 70 * 1024),
        },
    )
    assert r.status_code == 413 and r.json()["error"]["code"] == "audio_too_large"


def test_uploads_stay_in_memory_and_never_spill_to_disk(settings, monkeypatch):
    from tempfile import SpooledTemporaryFile

    def no_disk(self):  # noqa: ANN001, ANN202
        raise AssertionError("an upload was spooled to disk")

    monkeypatch.setattr(SpooledTemporaryFile, "rollover", no_disk)
    monkeypatch.setattr(speech, "stt_available", lambda: True)
    monkeypatch.setattr(speech, "transcribe_bytes", lambda data, s: str(len(data)))
    big = b"\x1aE\xdf\xa3" + b"0" * (3 * 1024 * 1024)
    r = client(settings).post("/stt", files={"file": ("a.webm", big, "audio/webm")}, headers=bearer())
    assert r.json() == {"text": str(len(big))}


def test_streamed_bodies_without_a_length_are_cut_off_at_the_cap(settings):
    def chunks():  # noqa: ANN202
        yield b'--x\r\nContent-Disposition: form-data; name="file"; filename="r.png"\r\nContent-Type: image/png\r\n\r\n'
        for _ in range(5):
            yield b"0" * (1024 * 1024)
        yield b"\r\n--x--\r\n"

    vision = settings.model_copy(update={"llm_base_url": "http://llm.test/v1", "llm_vision_model": "vision"})
    r = client(vision).post("/receipt", content=chunks(), headers={**bearer(), "content-type": "multipart/form-data; boundary=x"})
    assert r.status_code == 413 and r.json()["error"]["code"] == "image_too_large"


def test_the_vercel_entrypoint_serves_the_same_app():
    import index
    from coinflow_agent import main

    assert index.app is main.app
