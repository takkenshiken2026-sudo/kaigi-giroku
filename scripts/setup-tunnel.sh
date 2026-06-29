#!/usr/bin/env bash
# Cloudflare 名前付きトンネル（giroku.ai-master.jp）セットアップ
# 前提: cloudflared tunnel login 済み
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF="$ROOT/bin/cloudflared"
TUNNEL_NAME="${TUNNEL_NAME:-giroku}"
HOSTNAME="${HOSTNAME:-giroku.ai-master.jp}"

"$CF" tunnel create "$TUNNEL_NAME" 2>/dev/null || true
TUNNEL_ID="$("$CF" tunnel list | awk -v n="$TUNNEL_NAME" '$0 ~ n {print $1; exit}')"
if [[ -z "$TUNNEL_ID" ]]; then
  echo "トンネル $TUNNEL_NAME の作成に失敗しました" >&2
  exit 1
fi

mkdir -p "$HOME/.cloudflared"
cat > "$HOME/.cloudflared/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $HOSTNAME
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF

echo "=== ムームードメインに追加する CNAME ==="
echo "名前: giroku"
echo "値:   ${TUNNEL_ID}.cfargotunnel.com"
echo ""
echo "DNS 反映後: $CF tunnel run $TUNNEL_NAME"
