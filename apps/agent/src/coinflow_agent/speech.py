"""Speech (spec §4.5). faster-whisper STT and Kokoro TTS load lazily on first use, never at import; tests mock these
functions. Audio stays in memory and is dropped as soon as the request ends."""

import importlib.util
import io
import sys
import threading
import wave

from .settings import Settings

SAMPLE_RATE = 16_000
MAX_SECONDS = 30.5  # spec: clips up to 30 s (slack for encoder padding)
_lock = threading.Lock()
_whisper = None
_kokoro = None


class AudioTooLong(Exception):
    pass


def stt_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


def tts_available() -> bool:
    return importlib.util.find_spec("kokoro") is not None


def _whisper_model(settings: Settings):  # noqa: ANN202
    global _whisper
    with _lock:
        if _whisper is None:
            from faster_whisper import WhisperModel

            _whisper = WhisperModel(settings.stt_model, device="cpu", compute_type=settings.stt_compute_type)
        return _whisper


def transcribe_bytes(data: bytes, settings: Settings) -> str:
    from faster_whisper import decode_audio

    audio = decode_audio(io.BytesIO(data), sampling_rate=SAMPLE_RATE)
    if len(audio) / SAMPLE_RATE > MAX_SECONDS:
        raise AudioTooLong()
    segments, _info = _whisper_model(settings).transcribe(
        audio, beam_size=1, vad_filter=True, language=settings.stt_language or None
    )
    return " ".join(s.text.strip() for s in segments).strip()


def _disable_espeak_fallback() -> None:
    """macOS only: the espeakng-loader 0.2.4 dylib ignores its data path and calls exit() when Kokoro's espeak fallback
    starts, which kills the server. Kokoro catches a failing fallback and just skips out-of-lexicon words, so fail it
    early. The Linux Docker image (the supported speech runtime) keeps the fallback. Verified while writing the plan."""
    from misaki import espeak

    class _NoFallback:
        def __init__(self, *args, **kwargs):  # noqa: ANN002, ANN003
            raise RuntimeError("espeak fallback disabled on macOS")

    espeak.EspeakFallback = _NoFallback  # type: ignore[misc]


def _kokoro_pipeline():  # noqa: ANN202
    global _kokoro
    with _lock:
        if _kokoro is None:
            if sys.platform == "darwin":
                _disable_espeak_fallback()
            from kokoro import KPipeline

            _kokoro = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
        return _kokoro


def synthesize_wav(text: str, settings: Settings) -> bytes:
    import numpy as np

    chunks = []
    for result in _kokoro_pipeline()(text, voice=settings.tts_voice):
        audio = result.audio
        if audio is not None:
            chunks.append(audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio))
    samples = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24_000)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()
