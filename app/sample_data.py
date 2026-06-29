import json
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "samples"
SAMPLE_AUDIO = SAMPLES_DIR / "001-sibutomo.mp3"
SAMPLE_OUTPUT = SAMPLES_DIR / "001-sibutomo.output.json"


def load_sample_output() -> dict:
    if not SAMPLE_OUTPUT.exists():
        raise HTTPException(status_code=404, detail="サンプル出力が見つかりません")
    return json.loads(SAMPLE_OUTPUT.read_text(encoding="utf-8"))


def get_sample_audio_path() -> Path:
    if not SAMPLE_AUDIO.exists():
        raise HTTPException(status_code=404, detail="サンプル音声が見つかりません")
    return SAMPLE_AUDIO
