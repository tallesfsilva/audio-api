# app/transcriber/formatters.py
import json
from typing import Any


def _fmt_time_srt(seconds: float) -> str:
    ms = int((seconds % 1) * 1000)
    s = int(seconds) % 60
    m = (int(seconds) // 60) % 60
    h = int(seconds) // 3600
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _fmt_time_vtt(seconds: float) -> str:
    return _fmt_time_srt(seconds).replace(",", ".")


def to_srt(segments: list[dict[str, Any]]) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{_fmt_time_srt(seg['start'])} --> {_fmt_time_srt(seg['end'])}")
        lines.append(seg["text"].strip())
        lines.append("")
    return "\n".join(lines)


def to_vtt(segments: list[dict[str, Any]]) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        lines.append(f"{_fmt_time_vtt(seg['start'])} --> {_fmt_time_vtt(seg['end'])}")
        lines.append(seg["text"].strip())
        lines.append("")
    return "\n".join(lines)


def to_txt(segments: list[dict[str, Any]]) -> str:
    return "\n".join(seg["text"].strip() for seg in segments)


def to_tsv(segments: list[dict[str, Any]]) -> str:
    rows = ["start\tend\ttext"]
    for seg in segments:
        rows.append(f"{seg['start']:.3f}\t{seg['end']:.3f}\t{seg['text'].strip()}")
    return "\n".join(rows)


def to_json(segments: list[dict[str, Any]], metadata: dict[str, Any]) -> str:
    return json.dumps({"metadata": metadata, "segments": segments}, ensure_ascii=False, indent=2)


def format_output(
    segments: list[dict[str, Any]],
    metadata: dict[str, Any],
    fmt: str,
) -> str:
    match fmt:
        case "srt":
            return to_srt(segments)
        case "vtt":
            return to_vtt(segments)
        case "txt":
            return to_txt(segments)
        case "tsv":
            return to_tsv(segments)
        case _:  # json (default)
            return to_json(segments, metadata)
