from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Dict, List, Optional

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

QUALITY_MODELS = {
    "fast": "small",
    "balanced": "medium",
    "high": "large-v3",
}

DEFAULT_QUALITY = "high"
DEFAULT_INITIAL_PROMPT = (
    "以下は日本語のビジネス会議の文字起こしです。"
    "句読点を適切に入れ、発言内容を正確に書き起こしてください。"
)


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class TranscriptResult:
    segments: List[TranscriptSegment]
    full_text: str
    language: str
    duration: float
    model: str


_models: Dict[str, "WhisperModel"] = {}


def resolve_model_size(quality: Optional[str] = None) -> str:
    env_model = os.getenv("WHISPER_MODEL")
    if env_model:
        return env_model
    if quality and quality in QUALITY_MODELS:
        return QUALITY_MODELS[quality]
    return QUALITY_MODELS[DEFAULT_QUALITY]


def build_initial_prompt() -> str:
    return DEFAULT_INITIAL_PROMPT


def _get_model(model_size: Optional[str] = None) -> "WhisperModel":
    from faster_whisper import WhisperModel

    size = model_size or resolve_model_size()
    if size not in _models:
        device = os.getenv("WHISPER_DEVICE", "cpu")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        _models[size] = WhisperModel(size, device=device, compute_type=compute_type)
    return _models[size]


def transcribe_audio(
    audio_path: Path,
    language: str = "ja",
    quality: str = DEFAULT_QUALITY,
    initial_prompt: str = "",
) -> TranscriptResult:
    model_size = resolve_model_size(quality)
    model = _get_model(model_size)
    prompt = initial_prompt.strip() or build_initial_prompt()

    segments_iter, info = model.transcribe(
        str(audio_path),
        language=language,
        task="transcribe",
        initial_prompt=prompt,
        beam_size=5,
        best_of=1,
        patience=1.0,
        condition_on_previous_text=True,
        vad_filter=True,
        vad_parameters={
            "min_silence_duration_ms": 700,
            "speech_pad_ms": 400,
            "threshold": 0.45,
        },
        temperature=[0.0, 0.2, 0.4, 0.6],
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.5,
    )

    segments: List[TranscriptSegment] = []
    for segment in segments_iter:
        text = segment.text.strip()
        if not text:
            continue
        segments.append(
            TranscriptSegment(
                start=segment.start,
                end=segment.end,
                text=text,
            )
        )

    full_text = "\n".join(segment.text for segment in segments)
    return TranscriptResult(
        segments=segments,
        full_text=full_text,
        language=info.language or language,
        duration=info.duration or 0.0,
        model=model_size,
    )
