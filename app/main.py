import os
import shutil
import tempfile
import uuid
from datetime import date
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from app.docx_exporter import minutes_to_docx
from app.formatter import format_meeting_minutes, format_meeting_minutes_from_text
from app.minutes_templates import list_templates, normalize_template_id
from app.ollama_formatter import OllamaError, format_minutes_with_ollama, get_ollama_status, warmup_ollama_model
from app.sample_data import get_sample_audio_path, load_sample_output
from app.transcriber import QUALITY_MODELS, transcribe_audio

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
STATIC_DIR = PROJECT_DIR / "static"

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac", ".mp4", ".mpeg", ".mpga"}
DEFAULT_SITE_URL = "http://127.0.0.1:8000"


def get_site_url() -> str:
    return os.getenv("SITE_URL", DEFAULT_SITE_URL).rstrip("/")


def render_index_html() -> str:
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not found")
    return index_path.read_text(encoding="utf-8").replace("%SITE_URL%", get_site_url())

app = FastAPI(
    title="AI議事録作成ツール",
    description="完全無料・登録不要。会議音声の文字起こしと議事録作成。安全に使えるWebツール。",
)

SAMPLES_DIR = PROJECT_DIR / "samples"

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if SAMPLES_DIR.exists():
    app.mount("/samples", StaticFiles(directory=SAMPLES_DIR), name="sample-files")


@app.on_event("startup")
async def startup_warmup() -> None:
    if os.getenv("OLLAMA_WARMUP", "1") != "0":
        warmup_ollama_model()


@app.get("/")
async def index():
    return HTMLResponse(render_index_html())


@app.get("/robots.txt", response_class=Response)
async def robots_txt():
    site_url = get_site_url()
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        f"Sitemap: {site_url}/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain; charset=utf-8")


@app.get("/sitemap.xml", response_class=Response)
async def sitemap_xml():
    site_url = get_site_url()
    body = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
        f"  <url><loc>{site_url}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n"
        "</urlset>\n"
    )
    return Response(content=body, media_type="application/xml; charset=utf-8")


@app.get("/api/ollama/status")
async def ollama_status():
    return get_ollama_status()


@app.get("/api/sample")
async def sample_output():
    return load_sample_output()


@app.get("/api/sample/audio")
async def sample_audio():
    return FileResponse(get_sample_audio_path(), media_type="audio/mpeg", filename="sample-shohin-shokai.mp3")


@app.get("/api/templates")
async def templates():
    return {"templates": list_templates()}


@app.post("/api/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    include_timestamps: bool = Form(True),
    quality: str = Form("high"),
    use_ollama: bool = Form(True),
    template: str = Form("standard"),
):
    if not audio.filename:
        raise HTTPException(status_code=400, detail="音声ファイルを選択してください")

    suffix = Path(audio.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"対応形式: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    if quality not in QUALITY_MODELS:
        quality = "high"

    template_id = normalize_template_id(template)

    temp_dir = Path(tempfile.mkdtemp(prefix="kaigi-giroku-"))
    temp_path = temp_dir / f"{uuid.uuid4().hex}{suffix}"

    try:
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)

        result = transcribe_audio(temp_path, quality=quality)
        formatter = "template"
        ollama_error = None

        if use_ollama:
            try:
                minutes = format_minutes_with_ollama(
                    transcript=result.full_text,
                    language=result.language,
                    duration_seconds=result.duration,
                    template=template_id,
                )
                formatter = "ollama"
            except OllamaError as exc:
                ollama_error = str(exc)
                minutes = format_meeting_minutes(
                    result=result,
                    include_timestamps=include_timestamps,
                    template=template_id,
                )
        else:
            minutes = format_meeting_minutes(
                result=result,
                include_timestamps=include_timestamps,
                template=template_id,
            )

        return {
            "minutes": minutes,
            "transcript": result.full_text,
            "language": result.language,
            "duration_seconds": result.duration,
            "segment_count": len(result.segments),
            "model": result.model,
            "formatter": formatter,
            "template": template_id,
            "ollama_error": ollama_error,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"文字起こしに失敗しました: {exc}") from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/api/format")
async def format_minutes(
    transcript: str = Form(...),
    language: str = Form("ja"),
    duration_seconds: float = Form(0),
    template: str = Form("standard"),
):
    text = transcript.strip()
    if not text:
        raise HTTPException(status_code=400, detail="文字起こしテキストが空です")

    template_id = normalize_template_id(template)
    ollama_error = None
    try:
        minutes = format_minutes_with_ollama(
            transcript=text,
            language=language,
            duration_seconds=duration_seconds,
            template=template_id,
        )
        formatter = "ollama"
    except OllamaError as exc:
        ollama_error = str(exc)
        minutes = format_meeting_minutes_from_text(
            transcript=text,
            language=language,
            duration_seconds=duration_seconds,
            template=template_id,
        )
        formatter = "template"

    return {
        "minutes": minutes,
        "formatter": formatter,
        "template": template_id,
        "ollama_error": ollama_error,
    }


@app.post("/api/export/docx")
async def export_docx(minutes: str = Form(...)):
    text = minutes.strip()
    if not text:
        raise HTTPException(status_code=400, detail="議事録が空です")

    try:
        docx_bytes = minutes_to_docx(text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Word ファイルの作成に失敗しました: {exc}") from exc

    filename = f"議事録-{date.today().isoformat()}.docx"
    headers = {
        "Content-Disposition": (
            f"attachment; filename=\"minutes.docx\"; filename*=UTF-8''{quote(filename)}"
        )
    }
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}
