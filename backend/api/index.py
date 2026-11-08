from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import os
from app.api.routes import auth, stocks, master_data, photos, slides, indigo, safety_stock
from app.core.database import engine

app = FastAPI(title="Pupuk Monitor API")

# Origin produksi selalu diizinkan. Saat bukan produksi (lokal/preview), semua
# port localhost diizinkan supaya `next dev` bisa jalan di port apa pun tanpa
# mengubah kode -- dulu hanya localhost:3000 yang diizinkan sehingga dev di 3001
# gagal dengan "No 'Access-Control-Allow-Origin' header".
PRODUCTION_ORIGINS = ["https://monitoring-2-dusky.vercel.app"]
LOCAL_ORIGIN_REGEX = r"http://(localhost|127\.0\.0\.1)(:\d+)?"

_is_production = os.getenv("VERCEL_ENV", "development") == "production"

app.add_middleware(
    CORSMiddleware,
    allow_origins=PRODUCTION_ORIGINS + ([] if _is_production else ["http://localhost:3000"]),
    allow_origin_regex=None if _is_production else LOCAL_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Pupuk Monitor API"}


@app.get("/health")
def health():
    """Liveness: aplikasi hidup. Sengaja tidak menyentuh database agar cepat."""
    return {"status": "ok"}


@app.get("/health/db")
def health_db():
    """Readiness: aplikasi + database siap melayani. 503 bila database tidak terjangkau."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - apa pun penyebabnya, statusnya "belum siap"
        return JSONResponse(
            status_code=503,
            content={"status": "belum siap", "database": "error", "detail": str(exc)[:200]},
        )
    return {"status": "ok", "database": "ok"}

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(master_data.router, prefix="/api/master-data", tags=["Master Data"])
app.include_router(photos.router, prefix="/api/photos", tags=["Photos"])
app.include_router(slides.router, prefix="/api/slides", tags=["Slides"])
app.include_router(indigo.router, prefix="/api/indigo", tags=["INDIGO"])
app.include_router(safety_stock.router, prefix="/api/safety-stock", tags=["Safety Stock"])

mock_storage_path = os.path.join(os.getcwd(), "storage", "mock-storage")
os.makedirs(mock_storage_path, exist_ok=True)
app.mount("/mock-storage", StaticFiles(directory=mock_storage_path), name="mock-storage")
