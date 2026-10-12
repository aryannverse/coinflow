"""Groq-hosted speech (spec §10), on the same OpenAI-compatible base URL and key as the chat model.
STT: whisper-large-v3-turbo via /audio/transcriptions. TTS: Orpheus via /audio/speech, which takes at most 200 characters
per request, so longer replies are read in pieces and the WAVs joined. Audio stays in memory and is never stored; a clip
over 30 s is refused before it is sent (spec §4.5). Upstream details never reach the client: callers map these errors
to Coinflow's sanitized shapes."""

import io
import re
import wave

import httpx

from . import speech
from .settings import Settings

STT_MODEL = "whisper-large-v3-turbo"
TTS_MODEL = "canopylabs/orpheus-v1-english"
TTS_MAX_CHARS = 200  # Orpheus's per-request input limit (Groq docs, 2026-10)
# The upstream rejected the audio itself (bad or empty file): the user should re-record. Anything else (auth, rate
# limit, outage) means voice is unavailable right now.
_CLIENT_ERRORS = {400, 413, 415, 422}


class SpeechTimeout(Exception):
    pass


class SpeechUpstreamError(Exception):
    def __init__(self, status: int | None) -> None:
        super().__init__(f"speech provider error {status}")
        self.status = status

    @property
    def client_error(self) -> bool:
        return self.status in _CLIENT_ERRORS


def configured(settings: Settings) -> bool:
    return bool(settings.llm_base_url and settings.llm_api_key)


def _client(settings: Settings, transport: httpx.AsyncBaseTransport | None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.llm_base_url.rstrip("/"),
        headers={"authorization": f"Bearer {settings.llm_api_key}"},
        timeout=settings.speech_timeout_s,
        transport=transport,
    )


async def _post(client: httpx.AsyncClient, path: str, **kwargs) -> httpx.Response:  # noqa: ANN003
    try:
        res = await client.post(path, **kwargs)
    except httpx.TimeoutException as exc:
        raise SpeechTimeout() from exc
    except httpx.HTTPError as exc:
        raise SpeechUpstreamError(None) from exc
    if res.status_code >= 400:
        raise SpeechUpstreamError(res.status_code)
    return res


async def transcribe(
    data: bytes, filename: str, content_type: str, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None
) -> str:
    seconds = speech.probe_seconds(data)
    if seconds is not None and seconds > speech.MAX_SECONDS:
        raise speech.AudioTooLong()  # refused before a single byte leaves the process
    # When the container can't be read (e.g. Safari's fragmented mp4), ask Groq for the clip's duration and still hold
    # the 30 s line on the answer.
    form = {"model": STT_MODEL, "response_format": "json" if seconds is not None else "verbose_json", "temperature": "0"}
    if settings.stt_language:
        form["language"] = settings.stt_language
    async with _client(settings, transport) as client:
        res = await _post(client, "/audio/transcriptions", data=form, files={"file": (filename, data, content_type)})
    try:
        body = res.json()
    except ValueError as exc:
        raise SpeechUpstreamError(res.status_code) from exc
    if seconds is None and float(body.get("duration") or 0) > speech.MAX_SECONDS:
        raise speech.AudioTooLong()
    return str(body.get("text") or "").strip()


def split_for_tts(text: str, limit: int = TTS_MAX_CHARS) -> list[str]:
    """Pieces of at most `limit` characters: whole sentences where they fit, then whole words, then hard cuts."""
    words: list[str] = []
    for sentence in re.split(r"(?<=[.!?…])\s+", text.strip()):
        if len(sentence) <= limit:
            words.append(sentence)
            continue
        for word in sentence.split():
            words.extend(word[i : i + limit] for i in range(0, len(word), limit))
    pieces: list[str] = []
    for part in words:
        if pieces and len(pieces[-1]) + 1 + len(part) <= limit:
            pieces[-1] = f"{pieces[-1]} {part}"
        else:
            pieces.append(part)
    return [p for p in pieces if p]


def join_wavs(parts: list[bytes]) -> bytes:
    if len(parts) == 1:
        return parts[0]
    frames: list[bytes] = []
    params = None
    for part in parts:
        with wave.open(io.BytesIO(part)) as w:
            params = params or w.getparams()
            frames.append(w.readframes(w.getnframes()))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(params.nchannels)
        out.setsampwidth(params.sampwidth)
        out.setframerate(params.framerate)
        out.writeframes(b"".join(frames))
    return buf.getvalue()


async def synthesize(text: str, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None) -> bytes:
    parts: list[bytes] = []
    async with _client(settings, transport) as client:
        for piece in split_for_tts(text):
            res = await _post(
                client,
                "/audio/speech",
                json={"model": TTS_MODEL, "voice": settings.tts_voice_name, "input": piece, "response_format": "wav"},
            )
            parts.append(res.content)
    if not parts:
        raise SpeechUpstreamError(None)
    try:
        return join_wavs(parts)
    except (wave.Error, EOFError) as exc:
        raise SpeechUpstreamError(None) from exc
