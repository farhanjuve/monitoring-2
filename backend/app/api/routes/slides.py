"""
Slides API Routes
Endpoints untuk:
  - Generate PPTX laporan stok + foto CCTV
  - Kelola preset pilihan gudang
  - Riwayat & download file generated
"""

import json
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import (
    GeneratedSlide, SlidePreset, Warehouse, WarehousePlant,
    StockCalculation, Photo,
)
from app.services.pptx_generator import generate_pptx, SLIDES_DIR

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    tanggal: date
    warehouse_ids: List[int]

class PresetCreate(BaseModel):
    name: str
    warehouse_ids: List[int]


# ── Gudang options (untuk selector di frontend) ──────────────────────────────

@router.get("/gudang-options")
def get_gudang_options(
    tanggal: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Daftar gudang aktif + info apakah punya data stok di tanggal tertentu."""
    warehouses = (
        db.query(Warehouse)
        .filter(Warehouse.is_active == True)
        .order_by(Warehouse.nama_gudang)
        .all()
    )

    results = []
    for w in warehouses:
        has_stok = False
        has_photo = False

        if tanggal:
            has_stok = (
                db.query(StockCalculation.id)
                .filter(
                    StockCalculation.gudang_id == w.id,
                    StockCalculation.tanggal == tanggal,
                )
                .first()
                is not None
            )
            has_photo = (
                db.query(Photo.id)
                .filter(
                    Photo.gudang_id == w.id,
                    Photo.tanggal == tanggal,
                )
                .first()
                is not None
            )

        kode_plants = [p.kode_plant for p in (w.plants or [])]

        results.append({
            "id": w.id,
            "nama_gudang": w.nama_gudang,
            "kota": w.kota,
            "provinsi": w.provinsi,
            "kode_plants": kode_plants,
            "has_stok": has_stok,
            "has_photo": has_photo,
        })

    return results


# ── Generate PPTX ────────────────────────────────────────────────────────────

@router.post("/generate")
def generate_slide(
    req: GenerateRequest,
    db: Session = Depends(get_db),
):
    """Generate file PPTX berdasarkan tanggal + daftar gudang."""
    if not req.warehouse_ids:
        raise HTTPException(status_code=400, detail="Pilih minimal 1 gudang.")
    if len(req.warehouse_ids) > 100:
        raise HTTPException(status_code=400, detail="Maksimal 100 gudang per generate.")

    try:
        filename, file_path, gudang_count, slide_count = generate_pptx(
            db, req.tanggal, req.warehouse_ids
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal generate PPTX: {str(e)}")

    # Simpan record ke DB
    record = GeneratedSlide(
        filename=filename,
        tanggal=req.tanggal,
        warehouse_ids=json.dumps(req.warehouse_ids),
        gudang_count=gudang_count,
        slide_count=slide_count,
        file_path=file_path,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "filename": filename,
        "tanggal": req.tanggal.isoformat(),
        "gudang_count": gudang_count,
        "slide_count": slide_count,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


# ── History ──────────────────────────────────────────────────────────────────

@router.get("/history")
def get_history(
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Daftar file PPTX yang sudah di-generate."""
    records = (
        db.query(GeneratedSlide)
        .order_by(GeneratedSlide.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "tanggal": r.tanggal.isoformat(),
            "gudang_count": r.gudang_count,
            "slide_count": r.slide_count,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


# ── Download ─────────────────────────────────────────────────────────────────

@router.get("/download/{slide_id}")
def download_slide(
    slide_id: int,
    db: Session = Depends(get_db),
):
    """Download file PPTX berdasarkan ID."""
    record = db.query(GeneratedSlide).filter(GeneratedSlide.id == slide_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")

    import os
    if not os.path.isfile(record.file_path):
        raise HTTPException(status_code=404, detail="File PPTX tidak ditemukan di server.")

    return FileResponse(
        path=record.file_path,
        filename=record.filename,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


# ── Presets CRUD ─────────────────────────────────────────────────────────────

@router.get("/presets")
def get_presets(db: Session = Depends(get_db)):
    records = db.query(SlidePreset).order_by(SlidePreset.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "warehouse_ids": json.loads(r.warehouse_ids),
            "created_at": r.created_at.strftime("%Y-%m-%d") if r.created_at else None,
        }
        for r in records
    ]


@router.post("/presets")
def create_preset(
    req: PresetCreate,
    db: Session = Depends(get_db),
):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Nama preset wajib diisi.")
    if not req.warehouse_ids:
        raise HTTPException(status_code=400, detail="Pilih minimal 1 gudang.")

    record = SlidePreset(
        name=req.name.strip(),
        warehouse_ids=json.dumps(req.warehouse_ids),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "name": record.name,
        "warehouse_ids": req.warehouse_ids,
        "created_at": record.created_at.strftime("%Y-%m-%d") if record.created_at else None,
    }


@router.delete("/presets/{preset_id}")
def delete_preset(
    preset_id: int,
    db: Session = Depends(get_db),
):
    record = db.query(SlidePreset).filter(SlidePreset.id == preset_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Preset tidak ditemukan.")
    db.delete(record)
    db.commit()
    return {"message": "Preset berhasil dihapus."}
