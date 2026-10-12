import io
import wave

import pytest

from coinflow_agent import speech


def wav_bytes(seconds: float, rate: int = 8000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(1)
        w.setframerate(rate)
        w.writeframes(b"\x80" * int(seconds * rate))
    return buf.getvalue()


def test_a_long_clip_is_refused_before_anything_is_decoded(settings, monkeypatch):
    monkeypatch.setattr(speech, "probe_seconds", lambda data: 45.0)
    with pytest.raises(speech.AudioTooLong):
        speech.transcribe_bytes(b"not decoded", settings)


def test_the_probe_reads_the_container_duration_from_a_real_wav():
    pytest.importorskip("av")
    assert 30.9 < speech.probe_seconds(wav_bytes(31)) < 31.1
    assert 4.9 < speech.probe_seconds(wav_bytes(5)) < 5.1
    assert speech.probe_seconds(b"garbage") is None
