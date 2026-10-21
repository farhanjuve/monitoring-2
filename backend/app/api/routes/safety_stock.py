"""
Safety Stock API Routes
Endpoints untuk import & agregasi data safety stock per kabupaten/bulan.
"""

import io
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import SafetyStock
from app.services.safety_stock_service import import_safety_stock, parse_safety_stock_excel

router = APIRouter()

PRODUK_KOLOM = [
    "ss_urea",
    "ss_npk",
    "ss_npk_kakao",
    "ss_za",
    "ss_sp36",
    "ss_organik",
]


class BulanTersedia(BaseModel):
    tahun: int
    bulan: int


class ProvinsiSafety(BaseModel):
    provinsi: str
    ss_urea: float
    ss_npk: float
    ss_npk_kakao: float
    ss_za: float
    ss_sp36: float
    ss_organik: float


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_safety_stock(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload file Excel safety stock (kolom: kodekab, bulan, ton, tahun, id_produk2)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File wajib diupload.")

    ext = (file.filename or "").lower()
    if not ext.endswith(".xlsx") and not ext.endswith(".xls"):
        raise HTTPException(status_code=400, detail="Format file harus .xlsx / .xls.")

    try:
        content = await file.read()
        records = parse_safety_stock_excel(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not records:
        raise HTTPException(status_code=400, detail="Tidak ada baris data valid di file.")

    rows, total = import_safety_stock(db, records)
    db.commit()

    kab = len({(r["kode_kab"], r["bulan"], r["tahun"]) for r in records})
    tahun_set = sorted({r["tahun"] for r in records})
    bulan_set = sorted({r["bulan"] for r in records})
    return {
        "message": f"Safety stock berhasil disimpan: {kab} kabupaten-bulan, {len(records)} baris data.",
        "kabupaten_bulan": kab,
        "rows": rows,
        "records": len(records),
        "tahun": tahun_set,
        "bulan": bulan_set,
    }


# ── Metadata: bulan yang tersedia ────────────────────────────────────────────

@router.get("/bulan-tersedia", response_model=List[BulanTersedia])
def bulan_tersedia(db: Session = Depends(get_db)):
    """Daftar (tahun, bulan) yang punya data safety stock."""
    rows = (
        db.query(SafetyStock.tahun, SafetyStock.bulan)
        .distinct()
        .order_by(SafetyStock.tahun, SafetyStock.bulan)
        .all()
    )
    return [{"tahun": t, "bulan": b} for t, b in rows]


# ── Agregat per provinsi ─────────────────────────────────────────────────────

@router.get("/by-provinsi", response_model=List[ProvinsiSafety])
def safety_by_provinsi(
    tahun: Optional[int] = None,
    bulan: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Agregasi safety stock per provinsi utk (tahun, bulan) tertentu."""
    if bulan is None and tahun is None:
        latest = (
            db.query(SafetyStock.tahun, SafetyStock.bulan)
            .order_by(SafetyStock.tahun.desc(), SafetyStock.bulan.desc())
            .first()
        )
        if not latest:
            return []
        tahun, bulan = latest[0], latest[1]

    q = db.query(
        SafetyStock.provinsi,
        func.sum(func.coalesce(SafetyStock.ss_urea, 0.0)),
        func.sum(func.coalesce(SafetyStock.ss_npk, 0.0)),
        func.sum(func.coalesce(SafetyStock.ss_npk_kakao, 0.0)),
        func.sum(func.coalesce(SafetyStock.ss_za, 0.0)),
        func.sum(func.coalesce(SafetyStock.ss_sp36, 0.0)),
        func.sum(func.coalesce(SafetyStock.ss_organik, 0.0)),
    ).filter(
        SafetyStock.tahun == tahun,
        SafetyStock.bulan == bulan,
    ).group_by(SafetyStock.provinsi).order_by(SafetyStock.provinsi)

    out = []
    for row in q.all():
        out.append({
            "provinsi": row[0],
            "ss_urea": round(row[1] or 0.0, 2),
            "ss_npk": round(row[2] or 0.0, 2),
            "ss_npk_kakao": round(row[3] or 0.0, 2),
            "ss_za": round(row[4] or 0.0, 2),
            "ss_sp36": round(row[5] or 0.0, 2),
            "ss_organik": round(row[6] or 0.0, 2),
        })
    return out


# ── Detail per kabupaten ─────────────────────────────────────────────────────

class KabReturn(BaseModel):
    kode_kab: int
    kabupaten: Optional[str] = None
    provinsi: Optional[str] = None
    ss_urea: float
    ss_npk: float
    ss_npk_kakao: float
    ss_za: float
    ss_sp36: float
    ss_organik: float


@router.get("/detail", response_model=List[KabReturn])
def safety_detail(
    tahun: Optional[int] = None,
    bulan: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Detail safety stock per kabupaten utk (tahun, bulan) tertentu."""
    if bulan is None and tahun is None:
        latest = (
            db.query(SafetyStock.tahun, SafetyStock.bulan)
            .order_by(SafetyStock.tahun.desc(), SafetyStock.bulan.desc())
            .first()
        )
        if not latest:
            return []
        tahun, bulan = latest[0], latest[1]

    rows = db.query(SafetyStock).filter(
        SafetyStock.tahun == tahun,
        SafetyStock.bulan == bulan,
    ).order_by(SafetyStock.kode_kab).all()

    out = []
    for r in rows:
        out.append({
            "kode_kab": r.kode_kab,
            "kabupaten": r.kabupaten,
            "provinsi": r.provinsi,
            "ss_urea": round(r.ss_urea or 0.0, 2),
            "ss_npk": round(r.ss_npk or 0.0, 2),
            "ss_npk_kakao": round(r.ss_npk_kakao or 0.0, 2),
            "ss_za": round(r.ss_za or 0.0, 2),
            "ss_sp36": round(r.ss_sp36 or 0.0, 2),
            "ss_organik": round(r.ss_organik or 0.0, 2),
        })
    return out