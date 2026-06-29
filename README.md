# AI議事録作成ツール

会議の音声を **ローカル Whisper** で文字起こしし、**Ollama** で議事録を整形する Web アプリです。API キー不要・無料で利用できます。

（リポジトリ名: `kaigi-giroku`）

## 機能

- 音声ファイル（mp3 / wav / m4a / webm など）のアップロード
- **今から録音**（対面会議はマイク、オンライン会議はブラウザの会議タブから録音）
- 日本語向けローカル文字起こし（Whisper `large-v3`）
- **Ollama 連携**で概要・決定事項・アクションアイテムなどを自動整形（未接続時はテンプレートにフォールバック）
- タイムスタンプ付き / なしの切り替え
- コピー・テキストファイル（.txt）でダウンロード

## 必要環境

- Python 3.9+
- [ffmpeg](https://ffmpeg.org/)（音声デコード用）
- [Ollama](https://ollama.com/)（議事録整形用・任意だが推奨）

macOS の場合:

```bash
brew install ffmpeg
```

### Ollama（議事録整形）

```bash
brew install ollama
ollama serve
ollama pull llama3.2
```

Ollama が起動していない場合、文字起こしのみ実行しテンプレート形式で出力します。

## セットアップ

```bash
cd ~/Projects/kaigi-giroku
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 起動

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

ブラウザで http://127.0.0.1:8000 を開いてください。

### ファイルをアップロード

すでにある録音・録画ファイルをそのまま文字起こしします。

### 今から録音

「今から録音」では、次の2種類から選べます。

- **対面（マイク）** … 同じ部屋・会議室（マイクで録音）
- **オンライン（会議タブ）** … Meet / Zoom などブラウザ版（会議タブから録音）

#### オンライン会議の手順

1. **別タブ**で Google Meet / Zoom（ブラウザ版）/ Teams（ブラウザ版）などの会議を開く
2. 「**今から録音**」→「**オンライン（会議タブ）**」を選ぶ
3. 「**会議タブを接続**」→ 会議タブを選び **「タブの音声も共有」** にチェック
4. 「**録音開始**」→ 会議終了後に「**録音停止**」→ 議事録を作成

「自分のマイクも録音に含める」はデフォルトでオンです。タブ音声だけでは自分の発言が入らないことがあるため、オンを推奨します。

**注意:** デスクトップ版 Zoom アプリの音声は取得できません。Safari はタブ音声共有の挙動が異なる場合があります。Chrome / Edge を推奨します。

## 環境変数（任意）

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `WHISPER_MODEL` | `large-v3` | 環境変数で上書きする場合のモデル（未設定時は常に `large-v3`） |
| `WHISPER_DEVICE` | `cpu` | `cpu` または `cuda` |
| `WHISPER_COMPUTE_TYPE` | `int8` | CPU 向け量子化。GPU 利用時は `float16` など |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API の URL |
| `OLLAMA_MODEL` | `llama3.2` | 議事録整形に使うモデル |
| `OLLAMA_TIMEOUT` | `300` | Ollama 応答のタイムアウト（秒） |
| `SITE_URL` | `http://127.0.0.1:8000` | 公開 URL（canonical・OG・sitemap 用。本番では実際のドメインを指定） |

文字起こしは高精度（`large-v3`）で実行されます。

### 精度を上げるコツ

- 録音音量が小さすぎないか確認する（タブ音声・マイクの混音設定）
- 可能なら **wav / 高ビットレートの mp3** をアップロードする

## 出力例

生成される議事録はテキスト形式です（見出しの `#` などはそのまま入りますが、メモアプリや Word に貼り付けて使えます）。以下のセクションが含まれます。

Ollama 利用時は以下のセクションを自動生成します。

- 概要
- 議事内容（トピック整理）
- 決定事項
- アクションアイテム
- 次回予定

Ollama 未使用時はテンプレート形式（議事内容＋追記欄）になります。

## 注意

- 初回実行時、Whisper モデルが Hugging Face からダウンロードされます。
- 長い音声ほど文字起こし・LLM整形に時間がかかります。
