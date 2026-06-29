from __future__ import annotations

from datetime import datetime

from app.minutes_templates import build_fallback_minutes, normalize_template_id
from app.transcriber import TranscriptResult


def _format_timestamp(seconds: float) -> str:
    total = int(seconds)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _format_transcript_body(result: TranscriptResult, include_timestamps: bool) -> str:
    if not result.segments:
        return "（文字起こし結果がありません）"

    lines: list[str] = []
    for segment in result.segments:
        if include_timestamps:
            stamp = _format_timestamp(segment.start)
            lines.append(f"[{stamp}] {segment.text}")
        else:
            lines.append(segment.text)
    return "\n\n".join(lines)


def _build_meta_block(
    language: str,
    duration_seconds: float = 0.0,
) -> str:
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    duration_min = max(1, round(duration_seconds / 60)) if duration_seconds else None
    meta_lines = [f"- 作成日時: {created_at}", f"- 言語: {language}"]
    if duration_min:
        meta_lines.append(f"- 音声の長さ: 約 {duration_min} 分")
    return "\n".join(meta_lines)


def format_meeting_minutes(
    result: TranscriptResult,
    include_timestamps: bool = True,
    template: str | None = None,
) -> str:
    meta_block = _build_meta_block(result.language, result.duration)
    body = _format_transcript_body(result, include_timestamps)
    return build_fallback_minutes(template, meta_block, body)


def format_meeting_minutes_from_text(
    transcript: str,
    language: str = "ja",
    duration_seconds: float = 0.0,
    template: str | None = None,
) -> str:
    meta_block = _build_meta_block(language, duration_seconds)
    body = transcript.strip() or "（文字起こし結果がありません）"
    return build_fallback_minutes(template, meta_block, body)
