"""Groq-hosted speech (spec §10), on the same OpenAI-compatible base URL and key as the chat model.

- **STT** uses whisper-large-v3-turbo via /audio/transcriptions.
- **TTS** uses Orpheus via /audio/speech, which takes at most 200 characters per request. Longer replies are read in
  pieces, at most two at a time, and their WAV bytes are joined.
- **Audio** stays in memory and is never stored.
- **The 30 s limit** (spec §4.5) is checked twice: a clip over 30 s is refused before it is sent, and again on the
  duration Groq reports.
- **Errors:** upstream details never reach the client; callers map these errors to Coinflow's sanitized shapes. Only
  Groq's error *code* (like `model_terms_required`) is kept, for the logs."""

import asyncio
import re
import struct

import httpx

from . import speech
from .settings import Settings

STT_MODEL = "whisper-large-v3-turbo"
TTS_MODEL = "canopylabs/orpheus-v1-english"
TTS_MAX_CHARS = 200  # Orpheus's per-request input limit (Groq docs, 2026-10)
TTS_CONCURRENCY = 2  # a 1000-character reply is ~6 pieces: two at a time keeps it inside the web's 30 s TTS timeout
RETRY_WAIT_S = 1.0  # one retry on a 429; Groq asks for 0.4–2.7 s
MAX_RETRY_WAIT_S = 3.0
# The upstream rejected the audio itself (bad or empty file): the user should re-record. Anything else (auth, rate
# limit, outage) means voice is unavailable right now.
_CLIENT_ERRORS = {400, 413, 415, 422}
_SAFE_CODE = re.compile(r"[a-z0-9_]{1,64}")
# Groq infers the audio format from the file name, so it follows the content type rather than the browser's name.
_AUDIO_NAMES = {
    "audio/webm": "voice.webm",
    "audio/ogg": "voice.ogg",
    "audio/mp4": "voice.mp4",
    "audio/wav": "voice.wav",
    "audio/x-wav": "voice.wav",
    "audio/wave": "voice.wav",
}


class SpeechTimeout(Exception):
    pass


class SpeechUpstreamError(Exception):
    def __init__(self, status: int | None, code: str | None = None) -> None:
        super().__init__(f"speech provider error {status} {code or ''}".strip())
        self.status = status
        self.code = code  # Groq's machine-readable error code only (never its message or body)

    @property
    def client_error(self) -> bool:
        return self.status in _CLIENT_ERRORS

    @property
    def terms_required(self) -> bool:
        return self.code == "model_terms_required"


def configured(settings: Settings) -> bool:
    return bool(settings.llm_base_url and settings.llm_api_key)


def _client(settings: Settings, transport: httpx.AsyncBaseTransport | None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.llm_base_url.rstrip("/"),
        headers={"authorization": f"Bearer {settings.llm_api_key}"},
        timeout=settings.speech_timeout_s,
        transport=transport,
    )


def _error_code(res: httpx.Response) -> str | None:
    try:
        error = res.json().get("error")
        code = error.get("code") if isinstance(error, dict) else None
    except (ValueError, AttributeError):
        return None
    return code if isinstance(code, str) and _SAFE_CODE.fullmatch(code) else None


async def _post(client: httpx.AsyncClient, path: str, **kwargs) -> httpx.Response:  # noqa: ANN003
    try:
        res = await client.post(path, **kwargs)
    except httpx.TimeoutException as exc:
        raise SpeechTimeout() from exc
    except httpx.HTTPError as exc:
        raise SpeechUpstreamError(None) from exc
    if res.status_code >= 400:
        raise SpeechUpstreamError(res.status_code, _error_code(res))
    return res


async def transcribe(
    data: bytes, filename: str, content_type: str, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None
) -> str:
    seconds = speech.probe_seconds(data)
    if seconds is not None and seconds > speech.MAX_SECONDS:
        raise speech.AudioTooLong()  # refused before a single byte leaves the process
    # verbose_json always: Groq's measured duration is a second check, for containers the probe misreads or can't read.
    form = {"model": STT_MODEL, "response_format": "verbose_json", "temperature": "0"}
    if settings.stt_language:
        form["language"] = settings.stt_language
    name = _AUDIO_NAMES.get(content_type, filename or "voice.webm")
    async with _client(settings, transport) as client:
        res = await _post(client, "/audio/transcriptions", data=form, files={"file": (name, data, content_type)})
    try:
        body = res.json()
        duration = float(body.get("duration") or 0)
    except (ValueError, TypeError, AttributeError) as exc:
        raise SpeechUpstreamError(res.status_code) from exc
    if duration > speech.MAX_SECONDS:
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


def _wav_chunks(data: bytes) -> tuple[bytes, bytes]:
    """(fmt chunk body, audio bytes) by walking the RIFF chunks and trusting the bytes, like audio_probe._wav. A streaming
    header's data size of 0 or 0xFFFFFFFF means "to the end". Any sample format (PCM, IEEE float) passes through
    untouched."""
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise SpeechUpstreamError(None)
    pos, fmt = 12, None
    while pos + 8 <= len(data):
        kind, size = data[pos : pos + 4], int.from_bytes(data[pos + 4 : pos + 8], "little")
        body = pos + 8
        if kind == b"fmt ":
            fmt = data[body : body + size]
        elif kind == b"data":
            if fmt is None or len(fmt) < 16:
                break
            end = len(data) if size in (0, 0xFFFFFFFF) else min(body + size, len(data))
            return fmt, data[body:end]
        pos = body + size + (size & 1)
    raise SpeechUpstreamError(None)


def join_wavs(parts: list[bytes]) -> bytes:
    """One WAV from several with the same format: the audio bytes concatenated under a rebuilt header (finite sizes, the
    first part's fmt chunk, plus the fact chunk that non-PCM formats need)."""
    chunks = [_wav_chunks(p) for p in parts]
    fmt = chunks[0][0]
    if any(f[:16] != fmt[:16] for f, _ in chunks):
        raise SpeechUpstreamError(None)  # different sample formats can't be joined byte-wise
    audio = b"".join(a for _, a in chunks)
    tag, block_align = struct.unpack("<H", fmt[:2])[0], struct.unpack("<H", fmt[12:14])[0]
    fact = b""
    if tag != 1 and block_align:  # IEEE float and other non-PCM formats carry a sample count
        fact = b"fact" + struct.pack("<II", 4, len(audio) // block_align)
    padded_fmt = fmt + (b"\x00" if len(fmt) & 1 else b"")
    body = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + padded_fmt + fact + b"data" + struct.pack("<I", len(audio)) + audio
    if len(audio) & 1:
        body += b"\x00"
    return b"RIFF" + struct.pack("<I", len(body)) + body


async def synthesize(text: str, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None) -> bytes:
    pieces = split_for_tts(text)
    if not pieces:
        raise SpeechUpstreamError(None)
    gate = asyncio.Semaphore(TTS_CONCURRENCY)

    async def speak(client: httpx.AsyncClient, piece: str) -> bytes:
        payload = {"model": TTS_MODEL, "voice": settings.tts_voice_name, "input": piece, "response_format": "wav"}
        async with gate:
            try:
                return (await _post(client, "/audio/speech", json=payload)).content
            except SpeechUpstreamError as exc:
                if exc.status != 429:
                    raise
            await asyncio.sleep(min(RETRY_WAIT_S, MAX_RETRY_WAIT_S))  # one retry for a rate-limited piece
            return (await _post(client, "/audio/speech", json=payload)).content

    async with _client(settings, transport) as client:
        parts = await asyncio.gather(*(speak(client, p) for p in pieces))
    return join_wavs(list(parts))
