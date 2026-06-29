#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

export SITE_URL="${SITE_URL:-https://giroku.ai-master.jp}"
export WHISPER_MODEL="${WHISPER_MODEL:-large-v3}"
export WHISPER_DEVICE="${WHISPER_DEVICE:-cpu}"
export WHISPER_COMPUTE_TYPE="${WHISPER_COMPUTE_TYPE:-int8}"
export OLLAMA_WARMUP="${OLLAMA_WARMUP:-1}"

exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080
