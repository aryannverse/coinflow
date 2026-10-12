"""Clip length from container headers alone, with the standard library only (spec §4.5/§10: clips up to 30 s are
checked before audio leaves the process). Used when PyAV isn't installed, as on Vercel. Covers what browsers record:
WAV, Ogg (Opus/Vorbis), WebM/Matroska (MediaRecorder writes no Duration, so block timestamps are added up) and MP4.
Returns None whenever the length can't be told; the caller then relies on another check."""

import struct


def light_seconds(data: bytes) -> float | None:
    try:
        if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
            return _wav(data)
        if data[:4] == b"OggS":
            return _ogg(data)
        if data[:4] == b"\x1a\x45\xdf\xa3":
            return _matroska(data)
        if data[4:8] == b"ftyp":
            return _mp4(data)
    except (IndexError, ValueError, struct.error, ZeroDivisionError):
        return None
    return None


def _wav(data: bytes) -> float | None:
    pos, byte_rate = 12, 0
    while pos + 8 <= len(data):
        kind, size = data[pos : pos + 4], int.from_bytes(data[pos + 4 : pos + 8], "little")
        body = pos + 8
        if kind == b"fmt ":
            byte_rate = int.from_bytes(data[body + 8 : body + 12], "little")
        elif kind == b"data":
            if not byte_rate:
                return None
            available = len(data) - body  # streaming encoders write a bogus size (0 or 0xFFFFFFFF): trust the bytes
            length = available if size in (0, 0xFFFFFFFF) else min(size, available)
            return length / byte_rate
        pos = body + size + (size & 1)
    return None


def _ogg(data: bytes) -> float | None:
    last = data.rfind(b"OggS")
    granule = int.from_bytes(data[last + 6 : last + 14], "little", signed=True)
    if granule <= 0:
        return None
    opus = data.find(b"OpusHead")
    if opus != -1:
        pre_skip = int.from_bytes(data[opus + 10 : opus + 12], "little")
        return max(0, granule - pre_skip) / 48_000  # Opus granules always count 48 kHz samples
    vorbis = data.find(b"\x01vorbis")
    if vorbis != -1:
        rate = int.from_bytes(data[vorbis + 12 : vorbis + 16], "little")
        return granule / rate if rate else None
    return None


# Matroska element ids (with their length-marker bits, as written on disk).
_EBML, _SEGMENT, _CLUSTER, _INFO, _BLOCK_GROUP = 0x1A45DFA3, 0x18538067, 0x1F43B675, 0x1549A966, 0xA0
_TIMECODE_SCALE, _DURATION, _CLUSTER_TIMECODE, _SIMPLE_BLOCK, _BLOCK = 0x2AD7B1, 0x4489, 0xE7, 0xA3, 0xA1
_DESCEND = {_SEGMENT, _CLUSTER, _INFO, _BLOCK_GROUP}  # masters whose children we read in place (MediaRecorder: unknown size)


def _vint(data: bytes, pos: int, *, keep_marker: bool) -> tuple[int, int, bool]:
    first = data[pos]
    if first == 0:
        raise ValueError("invalid EBML variable-length integer")
    length = 8 - first.bit_length() + 1
    raw = int.from_bytes(data[pos : pos + length], "big")
    if len(data) < pos + length:
        raise ValueError("truncated")
    value_bits = 7 * length
    value = raw & ((1 << value_bits) - 1)
    return (raw if keep_marker else value), length, value == (1 << value_bits) - 1


def _matroska(data: bytes) -> float | None:
    pos, scale, duration, cluster_tc, last = 0, 1_000_000, None, 0, None
    while pos < len(data):
        element, n, _ = _vint(data, pos, keep_marker=True)
        pos += n
        size, n, unknown = _vint(data, pos, keep_marker=False)
        pos += n
        if element in _DESCEND:
            continue
        if unknown:
            return None
        body, pos = data[pos : pos + size], pos + size
        if element == _EBML:
            continue
        if element == _TIMECODE_SCALE:
            scale = int.from_bytes(body, "big")
        elif element == _DURATION:
            duration = struct.unpack(">d" if len(body) == 8 else ">f", body)[0]
        elif element == _CLUSTER_TIMECODE:
            cluster_tc = int.from_bytes(body, "big")
        elif element in (_SIMPLE_BLOCK, _BLOCK) and len(body) >= 4:
            _track, n, _ = _vint(body, 0, keep_marker=False)
            relative = int.from_bytes(body[n : n + 2], "big", signed=True)
            last = max(last or 0, cluster_tc + relative)
    if duration:
        return duration * scale / 1e9
    if last is not None:
        return last * scale / 1e9
    return None


def _boxes(data: bytes, start: int, end: int):  # noqa: ANN202
    pos = start
    while pos + 8 <= end:
        size, kind, header = int.from_bytes(data[pos : pos + 4], "big"), data[pos + 4 : pos + 8], 8
        if size == 1:
            size, header = int.from_bytes(data[pos + 8 : pos + 16], "big"), 16
        elif size == 0:
            size = end - pos
        if size < header:
            return
        yield kind, pos + header, min(pos + size, end)
        pos += size


def _mp4(data: bytes) -> float | None:
    for kind, start, end in _boxes(data, 0, len(data)):
        if kind != b"moov":
            continue
        for inner, body, _end in _boxes(data, start, end):
            if inner != b"mvhd":
                continue
            if data[body] == 1:
                timescale = int.from_bytes(data[body + 20 : body + 24], "big")
                duration = int.from_bytes(data[body + 24 : body + 32], "big")
            else:
                timescale = int.from_bytes(data[body + 12 : body + 16], "big")
                duration = int.from_bytes(data[body + 16 : body + 20], "big")
            if not timescale or not duration or duration in (0xFFFFFFFF, 0xFFFFFFFFFFFFFFFF):
                return None  # fragmented MP4 (Safari's MediaRecorder): the length lives in the fragments
            return duration / timescale
    return None
