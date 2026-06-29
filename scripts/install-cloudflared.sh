#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="$(uname -m | sed 's/x86_64/amd64/;s/arm64/arm64/')"
mkdir -p "$ROOT/bin"
if [[ ! -x "$ROOT/bin/cloudflared" ]]; then
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${ARCH}.tgz" \
    | tar -xzf - -C "$ROOT/bin" cloudflared
  chmod +x "$ROOT/bin/cloudflared"
fi
echo "cloudflared: $($ROOT/bin/cloudflared --version)"
