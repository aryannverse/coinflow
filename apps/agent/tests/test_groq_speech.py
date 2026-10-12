"""Groq-hosted speech (spec §10): STT via /audio/transcriptions, TTS via /audio/speech. Bytes stay in memory; the 30 s
clip limit is checked before anything is sent; upstream failures map to Coinflow's sanitized error shapes."""

import io
import json
import struct
import wave

import httpx
import pytest
from fastapi.testclient import TestClient

from coinflow_agent import audio_probe, groq_speech, speech
from coinflow_agent.main import create_app
from coinflow_agent.settings import Settings
from tests.test_api import bearer


def wav_bytes(seconds: float, rate: int = 8000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x01" * int(seconds * rate))
    return buf.getvalue()


@pytest.fixture
def groq(settings: Settings) -> Settings:
    return settings.model_copy(
        update={
            "llm_base_url": "https://groq.test/openai/v1",
            "llm_api_key": "gsk_test",
            "stt_provider": "groq",
            "tts_provider": "groq",
        }
    )


class Recorder:
    def __init__(self, respond):  # noqa: ANN001
        self.requests: list[httpx.Request] = []
        self.respond = respond

    def transport(self) -> httpx.MockTransport:
        def handler(req: httpx.Request) -> httpx.Response:
            self.requests.append(req)
            return self.respond(req)

        return httpx.MockTransport(handler)


# ---- settings -------------------------------------------------------------------------------------------------------


def test_speech_providers_default_to_local():
    s = Settings(_env_file=None)
    assert (s.stt_provider, s.tts_provider) == ("local", "local")
    assert s.tts_voice_name == "af_heart"  # Kokoro's voice when local
    assert s.model_copy(update={"tts_provider": "groq"}).tts_voice_name == "hannah"  # Orpheus's voice when on Groq
    assert s.model_copy(update={"tts_provider": "groq", "tts_voice": "troy"}).tts_voice_name == "troy"


def test_groq_speech_is_usable_only_with_a_key_and_base_url(groq):
    assert groq_speech.configured(groq)
    assert not groq_speech.configured(groq.model_copy(update={"llm_api_key": ""}))
    assert not groq_speech.configured(groq.model_copy(update={"llm_base_url": ""}))


# ---- STT ------------------------------------------------------------------------------------------------------------


async def test_groq_transcribes_in_memory_with_whisper_turbo(groq):
    rec = Recorder(lambda req: httpx.Response(200, json={"text": " two fifty for lunch "}))
    clip = wav_bytes(3)
    text = await groq_speech.transcribe(
        clip, "voice.wav", "audio/wav", groq.model_copy(update={"stt_language": "en"}), transport=rec.transport()
    )
    assert text == "two fifty for lunch"
    [req] = rec.requests
    assert str(req.url) == "https://groq.test/openai/v1/audio/transcriptions"
    assert req.headers["authorization"] == "Bearer gsk_test"
    body = req.content
    assert b'name="model"\r\n\r\nwhisper-large-v3-turbo' in body
    assert b'name="response_format"\r\n\r\njson' in body
    assert b'name="language"\r\n\r\nen' in body
    assert b'filename="voice.wav"' in body and clip in body


async def test_groq_refuses_a_long_clip_before_sending_anything(groq):
    rec = Recorder(lambda req: httpx.Response(200, json={"text": "never"}))
    with pytest.raises(speech.AudioTooLong):
        await groq_speech.transcribe(wav_bytes(31), "voice.wav", "audio/wav", groq, transport=rec.transport())
    assert rec.requests == []


async def test_an_unprobeable_clip_asks_groq_for_its_duration_and_still_enforces_30_s(groq, monkeypatch):
    monkeypatch.setattr(speech, "probe_seconds", lambda data: None)
    rec = Recorder(lambda req: httpx.Response(200, json={"text": "long", "duration": 42.0}))
    with pytest.raises(speech.AudioTooLong):
        await groq_speech.transcribe(b"\x1aE\xdf\xa3", "voice.webm", "audio/webm", groq, transport=rec.transport())
    assert b'name="response_format"\r\n\r\nverbose_json' in rec.requests[0].content
    ok = Recorder(lambda req: httpx.Response(200, json={"text": "short", "duration": 4.0}))
    assert await groq_speech.transcribe(b"\x1aE\xdf\xa3", "voice.webm", "audio/webm", groq, transport=ok.transport()) == "short"


@pytest.mark.parametrize(("status", "client_error"), [(400, True), (413, True), (401, False), (429, False), (500, False)])
async def test_groq_http_errors_are_classified(groq, status, client_error):
    rec = Recorder(lambda req: httpx.Response(status, json={"error": {"message": "secret upstream detail"}}))
    with pytest.raises(groq_speech.SpeechUpstreamError) as exc:
        await groq_speech.transcribe(wav_bytes(2), "voice.wav", "audio/wav", groq, transport=rec.transport())
    assert exc.value.status == status and exc.value.client_error is client_error


async def test_groq_timeouts_are_their_own_error(groq):
    def slow(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=req)

    with pytest.raises(groq_speech.SpeechTimeout):
        await groq_speech.transcribe(wav_bytes(2), "voice.wav", "audio/wav", groq, transport=Recorder(slow).transport())


# ---- TTS ------------------------------------------------------------------------------------------------------------


async def test_groq_reads_aloud_with_orpheus_as_wav(groq):
    rec = Recorder(lambda req: httpx.Response(200, content=wav_bytes(1, 24_000), headers={"content-type": "audio/wav"}))
    out = await groq_speech.synthesize("Your Safe-to-Spend is ₹12,345.", groq, transport=rec.transport())
    assert out.startswith(b"RIFF")
    [req] = rec.requests
    assert str(req.url) == "https://groq.test/openai/v1/audio/speech"
    assert json.loads(req.content) == {
        "model": "canopylabs/orpheus-v1-english",
        "voice": "hannah",
        "input": "Your Safe-to-Spend is ₹12,345.",
        "response_format": "wav",
    }


async def test_long_replies_are_read_in_200_character_pieces_and_joined(groq):
    rec = Recorder(lambda req: httpx.Response(200, content=wav_bytes(1, 24_000)))
    text = " ".join(f"Sentence number {i} is here to make this reply long enough." for i in range(12))
    out = await groq_speech.synthesize(text, groq, transport=rec.transport())
    inputs = [json.loads(r.content)["input"] for r in rec.requests]
    assert len(inputs) > 1 and all(len(i) <= 200 for i in inputs)
    assert " ".join(inputs) == text  # nothing dropped or reordered
    with wave.open(io.BytesIO(out)) as w:
        assert w.getframerate() == 24_000 and w.getnframes() == 24_000 * len(inputs)


def test_text_is_split_on_sentences_then_words_never_over_the_limit():
    assert groq_speech.split_for_tts("Hi. There.") == ["Hi. There."]
    long_word = "x" * 450
    pieces = groq_speech.split_for_tts(f"Short one. {long_word} tail")
    assert all(0 < len(p) <= 200 for p in pieces) and "".join(pieces).replace(" ", "") == f"Shortone.{long_word}tail"


async def test_tts_errors_and_timeouts(groq):
    with pytest.raises(groq_speech.SpeechUpstreamError):
        await groq_speech.synthesize("hi", groq, transport=Recorder(lambda req: httpx.Response(503)).transport())

    def slow(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("slow", request=req)

    with pytest.raises(groq_speech.SpeechTimeout):
        await groq_speech.synthesize("hi", groq, transport=Recorder(slow).transport())


# ---- through the API -------------------------------------------------------------------------------------------------


def api(settings: Settings, respond) -> tuple[TestClient, Recorder]:  # noqa: ANN001
    rec = Recorder(respond)
    app = create_app(settings, start_coach=False, speech_transport=rec.transport())
    return TestClient(app), rec


def test_health_reports_speech_from_the_chosen_provider(groq, monkeypatch):
    monkeypatch.setattr(speech, "stt_available", lambda: False)  # no local extra installed (like on Vercel)
    monkeypatch.setattr(speech, "tts_available", lambda: False)
    c, _ = api(groq, lambda req: httpx.Response(200))
    assert c.get("/health").json()["capabilities"] | {"chat": None} == {"chat": None, "vision": False, "stt": True, "tts": True}
    c, _ = api(groq.model_copy(update={"llm_api_key": ""}), lambda req: httpx.Response(200))
    caps = c.get("/health").json()["capabilities"]
    assert (caps["stt"], caps["tts"]) == (False, False)
    c, _ = api(groq.model_copy(update={"stt_provider": "local", "tts_provider": "local"}), lambda req: httpx.Response(200))
    caps = c.get("/health").json()["capabilities"]
    assert (caps["stt"], caps["tts"]) == (False, False)  # local: only when the speech extra is installed


def test_stt_endpoint_uses_groq(groq):
    c, rec = api(groq, lambda req: httpx.Response(200, json={"text": "two fifty for lunch"}))
    r = c.post("/stt", files={"file": ("voice.wav", wav_bytes(2), "audio/wav")}, headers=bearer())
    assert r.json() == {"text": "two fifty for lunch"} and len(rec.requests) == 1


@pytest.mark.parametrize(
    ("respond", "status", "code"),
    [
        (lambda req: httpx.Response(400, json={"error": {"message": "gsk_leak"}}), 422, "audio_unreadable"),
        (lambda req: httpx.Response(429), 503, "stt_unavailable"),
        (lambda req: httpx.Response(500), 503, "stt_unavailable"),
    ],
)
def test_stt_upstream_errors_are_sanitized(groq, respond, status, code):  # noqa: ANN001
    c, _ = api(groq, respond)
    r = c.post("/stt", files={"file": ("voice.wav", wav_bytes(2), "audio/wav")}, headers=bearer())
    assert r.status_code == status and r.json()["error"]["code"] == code and "gsk" not in r.text


def test_stt_timeout_is_a_504(groq):
    def slow(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=req)

    c, _ = api(groq, slow)
    r = c.post("/stt", files={"file": ("voice.wav", wav_bytes(2), "audio/wav")}, headers=bearer())
    assert r.status_code == 504 and r.json()["error"]["code"] == "stt_timeout"


def test_stt_endpoint_refuses_long_clips_without_calling_groq(groq):
    c, rec = api(groq, lambda req: httpx.Response(200, json={"text": "never"}))
    r = c.post("/stt", files={"file": ("voice.wav", wav_bytes(31), "audio/wav")}, headers=bearer())
    assert r.json()["error"]["code"] == "audio_too_long" and rec.requests == []


def test_tts_endpoint_uses_groq_and_sanitizes_errors(groq):
    c, _ = api(groq, lambda req: httpx.Response(200, content=wav_bytes(1, 24_000)))
    r = c.post("/tts", json={"text": "Hello"}, headers=bearer())
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav" and r.content.startswith(b"RIFF")
    c, _ = api(groq, lambda req: httpx.Response(500, text="gsk_leak"))
    r = c.post("/tts", json={"text": "Hello"}, headers=bearer())
    assert r.status_code == 502 and r.json()["error"]["code"] == "tts_failed" and "gsk" not in r.text

    def slow(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=req)

    c, _ = api(groq, slow)
    r = c.post("/tts", json={"text": "Hello"}, headers=bearer())
    assert r.status_code == 504 and r.json()["error"]["code"] == "tts_timeout"


# ---- the light container probe (no PyAV on Vercel) ------------------------------------------------------------------


def test_light_probe_reads_wav_length():
    assert 30.9 < audio_probe.light_seconds(wav_bytes(31)) < 31.1
    assert 4.9 < audio_probe.light_seconds(wav_bytes(5)) < 5.1


def test_light_probe_trusts_the_bytes_over_a_streaming_wav_header():
    clip = bytearray(wav_bytes(5))
    data_at = clip.index(b"data")
    clip[data_at + 4 : data_at + 8] = b"\xff\xff\xff\xff"  # "unknown length", as streaming encoders write it
    assert 4.9 < audio_probe.light_seconds(bytes(clip)) < 5.1


UNKNOWN_SIZE = b"\x01\xff\xff\xff\xff\xff\xff\xff"


def ebml(id_: bytes, payload: bytes) -> bytes:
    return id_ + b"\x01" + len(payload).to_bytes(7, "big") + payload


def webm(cluster_starts_ms: list[int], block_offsets_ms: list[int], duration_ms: float | None = None) -> bytes:
    """A MediaRecorder-shaped WebM: unknown-size Segment and Clusters, and (by default) no Duration in Info."""
    header = ebml(b"\x1a\x45\xdf\xa3", ebml(b"\x42\x82", b"webm"))
    info = ebml(b"\x2a\xd7\xb1", (1_000_000).to_bytes(3, "big"))
    if duration_ms is not None:
        info += ebml(b"\x44\x89", struct.pack(">d", duration_ms))
    tracks = ebml(b"\x16\x54\xae\x6b", ebml(b"\xae", ebml(b"\xd7", b"\x01")))
    clusters = b""
    for start in cluster_starts_ms:
        blocks = b"".join(
            ebml(b"\xa3", b"\x81" + off.to_bytes(2, "big", signed=True) + b"\x80" + b"\x00" * 20) for off in block_offsets_ms
        )
        clusters += b"\x1f\x43\xb6\x75" + UNKNOWN_SIZE + ebml(b"\xe7", start.to_bytes(4, "big")) + blocks
    return header + b"\x18\x53\x80\x67" + UNKNOWN_SIZE + ebml(b"\x15\x49\xa9\x66", info) + tracks + clusters


def test_light_probe_adds_up_webm_block_timestamps_when_there_is_no_duration():
    assert 31.0 < audio_probe.light_seconds(webm([0, 10_000, 20_000, 30_000], [0, 500, 1_000, 1_020])) < 31.1
    assert 2.9 < audio_probe.light_seconds(webm([0], [0, 1_000, 2_980])) < 3.0


def test_light_probe_prefers_a_webm_duration_header():
    assert audio_probe.light_seconds(webm([0], [0, 20], duration_ms=45_000.0)) == 45.0


def ogg_page(granule: int, payload: bytes) -> bytes:
    return b"OggS\x00\x00" + granule.to_bytes(8, "little", signed=True) + b"\x00" * 12 + bytes([1, len(payload)]) + payload


def test_light_probe_reads_ogg_opus_from_the_last_granule():
    head = ogg_page(0, b"OpusHead\x01\x01" + (312).to_bytes(2, "little") + (48_000).to_bytes(4, "little") + b"\x00\x00\x00")
    clip = head + ogg_page(48_000 * 12 + 312, b"\x00" * 30)
    assert 11.99 < audio_probe.light_seconds(clip) < 12.01


def mp4_box(kind: bytes, payload: bytes) -> bytes:
    return (8 + len(payload)).to_bytes(4, "big") + kind + payload


def test_light_probe_reads_mp4_movie_header():
    mvhd = mp4_box(b"mvhd", b"\x00\x00\x00\x00" + b"\x00" * 8 + (1_000).to_bytes(4, "big") + (33_500).to_bytes(4, "big"))
    clip = mp4_box(b"ftyp", b"M4A \x00\x00\x00\x00") + mp4_box(b"moov", mvhd)
    assert audio_probe.light_seconds(clip) == 33.5
    fragmented = mp4_box(b"ftyp", b"iso5\x00\x00\x00\x00") + mp4_box(
        b"moov", mp4_box(b"mvhd", b"\x00\x00\x00\x00" + b"\x00" * 8 + (1_000).to_bytes(4, "big") + b"\x00" * 4)
    )
    assert audio_probe.light_seconds(fragmented) is None  # Safari's fragmented mp4: unknown, so Groq's duration decides


def test_light_probe_gives_up_quietly_on_garbage():
    for junk in (b"", b"garbage", b"RIFF\x00\x00", b"OggS", b"\x1a\x45\xdf\xa3\xff", b"\x00\x00\x00\x08ftyp"):
        assert audio_probe.light_seconds(junk) is None


def test_probe_falls_back_to_the_light_probe_without_pyav(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def no_av(name, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003, ANN202
        if name == "av":
            raise ImportError("no PyAV here")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_av)
    assert 30.9 < speech.probe_seconds(wav_bytes(31)) < 31.1


def test_blank_values_in_the_env_file_mean_the_defaults(tmp_path):
    env = tmp_path / ".env"
    env.write_text("STT_PROVIDER=\nTTS_PROVIDER=\nCOACH_MODE=\nRECEIPT_JSON_MODE=\nPLANNER_ENGINE=\nTTS_VOICE=\n")
    s = Settings(_env_file=env)
    assert (s.stt_provider, s.tts_provider, s.coach_mode, s.receipt_json_mode, s.planner_engine, s.tts_voice_name) == (
        "local",
        "local",
        "scheduler",
        "json_object",
        "light",
        "af_heart",
    )
