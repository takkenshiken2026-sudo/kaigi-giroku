from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

import requests

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "300"))
OLLAMA_MAX_TRANSCRIPT_CHARS = int(os.getenv("OLLAMA_MAX_TRANSCRIPT_CHARS", "12000"))
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "1536"))
OLLAMA_NUM_CTX_MIN = int(os.getenv("OLLAMA_NUM_CTX_MIN", "2048"))
OLLAMA_NUM_CTX_MAX = int(os.getenv("OLLAMA_NUM_CTX_MAX", "6144"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")

FAST_MODEL_PRIORITY = [
    "phi3:mini",
    "phi3",
    "llama3.2:1b",
    "llama3.2:3b",
    "gemma2:2b",
    "llama3.2",
    "llama3",
]

from app.minutes_templates import get_system_prompt, normalize_template_id


class OllamaError(Exception):
    pass


def _list_installed_models() -> list[str]:
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        if not response.ok:
            return []
        return [item.get("name", "") for item in response.json().get("models", [])]
    except requests.RequestException:
        return []


def _match_model_name(available: list[str], candidate: str) -> Optional[str]:
    for name in available:
        if name == candidate or name.startswith(f"{candidate}:"):
            return name
    return None


def resolve_ollama_model() -> str:
    configured = os.getenv("OLLAMA_MODEL")
    if configured:
        return configured

    available = _list_installed_models()
    for candidate in FAST_MODEL_PRIORITY:
        matched = _match_model_name(available, candidate)
        if matched:
            return matched

    return "llama3.2"


def is_ollama_available() -> bool:
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        return response.ok
    except requests.RequestException:
        return False


def get_ollama_status() -> dict:
    model = resolve_ollama_model()
    available = is_ollama_available()
    status = {
        "available": available,
        "base_url": OLLAMA_BASE_URL,
        "model": model,
    }
    if not available:
        return status

    try:
        models = _list_installed_models()
        status["models"] = models
        status["model_ready"] = any(
            name == model or name.startswith(f"{model}:")
            for name in models
        )
    except requests.RequestException:
        status["available"] = False

    return status


def _estimate_num_ctx(transcript_chars: int) -> int:
    estimated = transcript_chars + 1800
    return min(OLLAMA_NUM_CTX_MAX, max(OLLAMA_NUM_CTX_MIN, estimated))


def _build_user_prompt(
    transcript: str,
    language: str,
    duration_seconds: float,
) -> str:
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    duration_min = max(1, round(duration_seconds / 60)) if duration_seconds else None
    meta_lines = [f"作成日時: {created_at}", f"言語: {language}"]
    if duration_min:
        meta_lines.append(f"音声の長さ: 約 {duration_min} 分")

    body = transcript.strip()
    truncated = False
    if len(body) > OLLAMA_MAX_TRANSCRIPT_CHARS:
        body = body[:OLLAMA_MAX_TRANSCRIPT_CHARS]
        truncated = True

    truncation_note = (
        "\n\n（注: 文字起こしは長いため一部のみ渡しています。全体の要点を反映してください。）"
        if truncated
        else ""
    )

    return (
        "以下の文字起こしを、システムプロンプトのルールに従って議事録にしてください。"
        "文字起こしにない情報は一切追加しないでください。\n\n"
        f"{' / '.join(meta_lines)}\n\n"
        "--- 文字起こし ---\n"
        f"{body}"
        f"{truncation_note}"
    )


def _chat_payload(
    model_name: str,
    user_content: str,
    transcript_chars: int,
    template: str | None = None,
) -> dict:
    return {
        "model": model_name,
        "messages": [
            {"role": "system", "content": get_system_prompt(template)},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": 0.1,
            "num_predict": OLLAMA_NUM_PREDICT,
            "num_ctx": _estimate_num_ctx(transcript_chars),
        },
    }


def warmup_ollama_model() -> None:
    if not is_ollama_available():
        return

    model_name = resolve_ollama_model()
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": "ok"}],
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "num_predict": 1,
            "num_ctx": OLLAMA_NUM_CTX_MIN,
        },
    }
    try:
        requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=120,
        )
    except requests.RequestException:
        return


def format_minutes_with_ollama(
    transcript: str,
    language: str = "ja",
    duration_seconds: float = 0.0,
    model: Optional[str] = None,
    template: str | None = None,
) -> str:
    if not transcript.strip():
        raise OllamaError("文字起こしテキストが空です。")

    model_name = model or resolve_ollama_model()
    template_id = normalize_template_id(template)
    user_content = _build_user_prompt(transcript, language, duration_seconds)
    payload = _chat_payload(model_name, user_content, len(transcript), template_id)

    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=OLLAMA_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise OllamaError(f"Ollama に接続できません: {exc}") from exc

    if not response.ok:
        detail = response.text.strip() or response.reason
        raise OllamaError(f"Ollama エラー ({response.status_code}): {detail}")

    data = response.json()
    content = (data.get("message") or {}).get("content", "").strip()
    if not content:
        raise OllamaError("Ollama から空の応答が返されました。")

    return content
