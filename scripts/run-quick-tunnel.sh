#!/usr/bin/env bash
# 一時公開用クイックトンネル（URL は cloudflared 再起動で変わる）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/install-cloudflared.sh"
exec "$ROOT/bin/cloudflared" tunnel --url http://127.0.0.1:8080
