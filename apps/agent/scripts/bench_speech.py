"""Manual check of spec §4.5: STT ≤ 2.5 s for clips under 15 s on the dev machine.
Synthesises a phrase with Kokoro, warms faster-whisper up once, then times a second transcription.
Needs the speech extra:  uv sync --extra speech && uv run python scripts/bench_speech.py   (first run downloads models)."""

import time

from coinflow_agent import speech
from coinflow_agent.settings import Settings

PHRASE = "I paid two hundred and fifty rupees for lunch with Asha and Ravi at Toit yesterday."


def main() -> None:
    s = Settings(_env_file=None)
    wav = speech.synthesize_wav(PHRASE, s)
    clip_s = (len(wav) - 44) / 2 / 24_000
    speech.transcribe_bytes(wav, s)  # warm-up: loads the model
    t0 = time.perf_counter()
    text = speech.transcribe_bytes(wav, s)
    took = time.perf_counter() - t0
    verdict = "OK" if took <= 2.5 else "SLOW"
    print(f"clip {clip_s:.1f} s · transcribed in {took:.2f} s · {verdict} (target ≤ 2.5 s)\n→ {text}")


if __name__ == "__main__":
    main()
