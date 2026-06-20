from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.api.routes import auth, stocks, master_data, photos

app = FastAPI(title="Pupuk Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://monitoring-2-dusky.vercel.app"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Pupuk Monitor API"}

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(master_data.router, prefix="/api/master-data", tags=["Master Data"])
app.include_router(photos.router, prefix="/api/photos", tags=["Photos"])

mock_storage_path = os.path.join(os.getcwd(), "storage", "mock-storage")
os.makedirs(mock_storage_path, exist_ok=True)
app.mount("/mock-storage", StaticFiles(directory=mock_storage_path), name="mock-storage")
