# giroku.ai-master.jp 本番デプロイ手順

アプリ本体は GitHub Pages に載せられないため、`https://giroku.ai-master.jp/` で kaigi-giroku を常時起動する。

紹介・SEO 入口: `https://ai-master.jp/tools/ai-giroku/`

リポジトリ: `https://github.com/takkenshiken2026-sudo/kaigi-giroku`

## 方式 A — Fly.io（推奨・設定済み）

`Dockerfile` と `fly.toml` を同梱。GitHub Actions（`.github/workflows/fly-deploy.yml`）でもデプロイ可能。

### 1. Fly.io にログイン

```bash
export PATH="$HOME/.fly/bin:$PATH"
fly auth login
```

### 2. 初回デプロイ

```bash
cd ~/Projects/kaigi-giroku
fly apps create kaigi-giroku   # 未作成の場合
fly deploy
```

### 3. GitHub Actions で自動デプロイ（任意）

```bash
fly tokens create deploy -x 999999h
gh secret set FLY_API_TOKEN --repo takkenshiken2026-sudo/kaigi-giroku
```

`main` への push で自動デプロイされます。

### 4. カスタムドメイン

```bash
fly certs add giroku.ai-master.jp
fly certs show giroku.ai-master.jp
```

表示された DNS 指示に従い、ムームードメインでレコードを追加します。

## 方式 B — 自前 VPS

## 1. DNS

ドメイン `ai-master.jp` の DNS 管理（ムームードメイン）で CNAME を追加:

| 名前 | 種別 | 値 |
|------|------|-----|
| `giroku` | CNAME | Fly.io の場合は `kaigi-giroku.fly.dev` または証明書画面の指示値 |

## 2. サーバー要件

- Python 3.11+
- ffmpeg
- 十分な RAM（Whisper `large-v3` 推奨: 8GB 以上）
- Ollama（議事録整形を使う場合）

## 3. アプリ起動

```bash
git clone <kaigi-giroku-repo> /opt/kaigi-giroku
cd /opt/kaigi-giroku
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export SITE_URL=https://giroku.ai-master.jp
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`SITE_URL` は canonical・OG・sitemap の置換に使われる。

## 4. systemd（例）

`/etc/systemd/system/kaigi-giroku.service`:

```ini
[Unit]
Description=kaigi-giroku FastAPI
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/kaigi-giroku
Environment=SITE_URL=https://giroku.ai-master.jp
ExecStart=/opt/kaigi-giroku/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now kaigi-giroku
```

## 5. リバースプロキシ（nginx 例）

```nginx
server {
    listen 443 ssl http2;
    server_name giroku.ai-master.jp;

    ssl_certificate     /etc/letsencrypt/live/giroku.ai-master.jp/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/giroku.ai-master.jp/privkey.pem;

    client_max_body_size 200M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 600s;
    }
}
```

Let's Encrypt: `certbot --nginx -d giroku.ai-master.jp`

## 6. 動作確認

- `https://giroku.ai-master.jp/` が開く
- ページソースの `canonical` が `https://giroku.ai-master.jp/`
- ai-master 紹介ページの CTA から遷移できる
