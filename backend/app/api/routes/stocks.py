"""
Stock API Routes
Endpoints untuk:
  - Upload file MB52 & ZSD_SODO dari SAP
  - Query hasil kalkulasi stok
  - Preview perhitungan stok
  - Recalculate stok
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import List, Optional

from app.core.database import get_db
from app.core.time import to_utc_iso
from app.models.models import StockCalculation, SAPUpload
from app.schemas.schemas import StockCalculationOut, StockPreview, SAPUploadOut, UploadResponse
from app.services.sap_parser import parse_mb52, parse_zsd_sodo, preview_mb52, preview_zsd_sodo
from app.services.stock_calculator import (
    calculate_daily_stock,
    update_stock_calculation,
    recalculate_all_for_date,
    save_mb52_data,
    save_zsd_sodo_data,
)

router = APIRouter()


# ==================== Upload Endpoints ====================

@router.post("/upload/mb52", response_model=UploadResponse)
async def upload_mb52(
    file: UploadFile = File(...),
    tanggal: date = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upload file MB52 dari SAP.
    File akan di-parse, data stok mentah disimpan ke tabel sap_stock,
    lalu kalkulasi stok otomatis dijalankan untuk semua plant pada tanggal tersebut.
    """
    fname = (file.filename or "").lower()
    if not fname.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail=f"File harus berformat .xlsx atau .xls (diterima: {file.filename})")

    upload_record = SAPUpload(
        jenis_file="MB52",
        tanggal_data=tanggal,
        filename=file.filename,
        status="processing",
    )
    db.add(upload_record)
    db.commit()
    db.refresh(upload_record)

    try:
        file_bytes = await file.read()
        rows = parse_mb52(file_bytes, tanggal)
        
        if not rows:
            raise ValueError("Tidak ada data valid yang ditemukan dalam file MB52.")
        
        count = save_mb52_data(db, tanggal, rows)
        calc_results = recalculate_all_for_date(db, tanggal)
        
        upload_record.jumlah_baris = count
        upload_record.status = "success"
        db.commit()
        db.refresh(upload_record)
        
        return UploadResponse(
            message=f"File MB52 berhasil diproses. {count} baris data stok disimpan.",
            upload=SAPUploadOut.model_validate(upload_record),
            rows_processed=count,
            calculations_updated=len(calc_results),
        )

    except Exception as e:
        upload_record.status = "failed"
        upload_record.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Gagal memproses file MB52: {str(e)}")


@router.post("/upload/zsd-sodo", response_model=UploadResponse)
async def upload_zsd_sodo(
    file: UploadFile = File(...),
    tanggal: date = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upload file ZSD_SODO dari SAP.
    File akan di-parse, data outstanding DO disimpan ke tabel sap_outstanding_do,
    lalu kalkulasi stok otomatis dijalankan untuk semua plant pada tanggal tersebut.
    """
    fname = (file.filename or "").lower()
    if not fname.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail=f"File harus berformat .xlsx atau .xls (diterima: {file.filename})")

    upload_record = SAPUpload(
        jenis_file="ZSD_SODO",
        tanggal_data=tanggal,
        filename=file.filename,
        status="processing",
    )
    db.add(upload_record)
    db.commit()
    db.refresh(upload_record)

    try:
        file_bytes = await file.read()
        rows = parse_zsd_sodo(file_bytes, tanggal)
        
        if not rows:
            raise ValueError("Tidak ada data valid yang ditemukan dalam file ZSD_SODO.")
        
        count = save_zsd_sodo_data(db, tanggal, rows)
        calc_results = recalculate_all_for_date(db, tanggal)
        
        upload_record.jumlah_baris = count
        upload_record.status = "success"
        db.commit()
        db.refresh(upload_record)
        
        return UploadResponse(
            message=f"File ZSD_SODO berhasil diproses. {count} baris outstanding DO disimpan.",
            upload=SAPUploadOut.model_validate(upload_record),
            rows_processed=count,
            calculations_updated=len(calc_results),
        )

    except Exception as e:
        upload_record.status = "failed"
        upload_record.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Gagal memproses file ZSD_SODO: {str(e)}")


@router.post("/upload/mb52/dry-run")
async def dry_run_mb52(
    file: UploadFile = File(...),
    tanggal: date = Form(...),
):
    fname = (file.filename or "").lower()
    if not fname.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail=f"File harus berformat .xlsx atau .xls (diterima: {file.filename})")
    file_bytes = await file.read()
    try:
        return preview_mb52(file_bytes, tanggal)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dry-run MB52 gagal: {str(e)}")


@router.post("/upload/zsd-sodo/dry-run")
async def dry_run_zsd_sodo(
    file: UploadFile = File(...),
    tanggal: date = Form(...),
):
    fname = (file.filename or "").lower()
    if not fname.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail=f"File harus berformat .xlsx atau .xls (diterima: {file.filename})")
    file_bytes = await file.read()
    try:
        return preview_zsd_sodo(file_bytes, tanggal)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dry-run ZSD_SODO gagal: {str(e)}")


# ==================== Query Endpoints ====================

@router.get("/", response_model=List[StockCalculationOut])
def get_stocks(
    db: Session = Depends(get_db),
    tanggal: Optional[date] = None,
    gudang_id: Optional[int] = None,
    tipe_pupuk: Optional[str] = None,
):
    """Ambil daftar hasil kalkulasi stok dengan filter opsional."""
    query = db.query(StockCalculation)
    
    if not tanggal:
        # Get the latest date available in the database
        latest_date = db.query(func.max(StockCalculation.tanggal)).scalar()
        tanggal = latest_date

    if tanggal:
        query = query.filter(StockCalculation.tanggal == tanggal)
    if gudang_id:
        query = query.filter(StockCalculation.gudang_id == gudang_id)
    if tipe_pupuk:
        query = query.filter(StockCalculation.tipe_pupuk == tipe_pupuk)
    
    query = query.order_by(StockCalculation.gudang_id, StockCalculation.tipe_pupuk)
    
    return query.all()


@router.get("/intransit-range")
def get_intransit_range(
    gudang_id: int,
    tanggal_awal: date,
    tanggal_akhir: date,
    db: Session = Depends(get_db),
):
    """Ambil data intransit per gudang dan rentang tanggal."""
    if tanggal_akhir < tanggal_awal:
        raise HTTPException(status_code=400, detail="Tanggal akhir tidak boleh lebih awal dari tanggal awal.")

    rows = (
        db.query(StockCalculation)
        .filter(
            StockCalculation.gudang_id == gudang_id,
            StockCalculation.tanggal.between(tanggal_awal, tanggal_akhir),
        )
        .order_by(StockCalculation.tipe_pupuk, StockCalculation.tanggal)
        .all()
    )

    return [
        {
            "tanggal": row.tanggal.isoformat(),
            "gudang_id": row.gudang_id,
            "nama_gudang": row.nama_gudang,
            "kode_plants": row.kode_plants,
            "kota": row.kota,
            "provinsi": row.provinsi,
            "tipe_pupuk": row.tipe_pupuk,
            "intransit": row.intransit,
        }
        for row in rows
    ]


@router.get("/preview", response_model=StockPreview)
def preview_calculation(
    tanggal: date,
    gudang_id: int,
    tipe_pupuk: str,
    db: Session = Depends(get_db),
):
    """Preview hasil hitungan tanpa menyimpan ke database."""
    try:
        calc_data = calculate_daily_stock(db, tanggal, gudang_id, tipe_pupuk)
        return calc_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recalculate")
def recalculate_stocks(
    tanggal: date = Form(...),
    db: Session = Depends(get_db),
):
    """Hitung ulang semua stok untuk tanggal tertentu."""
    try:
        results = recalculate_all_for_date(db, tanggal)
        return {
            "message": f"Berhasil menghitung ulang stok untuk {len(results)} kombinasi gudang/pupuk.",
            "tanggal": tanggal.isoformat(),
            "calculations": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Upload History ====================

def _upload_status_payload(upload: Optional[SAPUpload]):
    return {
        "uploaded": upload is not None,
        "latest_upload_at": to_utc_iso(upload.created_at) if upload and upload.created_at else None,
        "filename": upload.filename if upload else None,
        "rows": upload.jumlah_baris if upload else 0,
    }


@router.get("/upload-status")
def get_upload_status(
    tanggal: date,
    db: Session = Depends(get_db),
):
    """Cek kelengkapan upload MB52 dan ZSD_SODO untuk satu tanggal data."""
    uploads = (
        db.query(SAPUpload)
        .filter(
            SAPUpload.tanggal_data == tanggal,
            SAPUpload.status == "success",
            SAPUpload.jenis_file.in_(["MB52", "ZSD_SODO"]),
        )
        .order_by(SAPUpload.created_at.desc())
        .all()
    )

    latest_by_type: dict[str, SAPUpload] = {}
    for upload in uploads:
        if upload.jenis_file not in latest_by_type:
            latest_by_type[upload.jenis_file] = upload

    mb52 = latest_by_type.get("MB52")
    zsd_sodo = latest_by_type.get("ZSD_SODO")
    missing = []
    if not mb52:
        missing.append("MB52")
    if not zsd_sodo:
        missing.append("ZSD_SODO")

    if not missing:
        message = "Data lengkap: MB52 dan ZSD_SODO sudah diupload."
    elif len(missing) == 2:
        message = "Belum ada upload MB52 dan ZSD_SODO untuk tanggal ini."
    else:
        message = f"Data belum lengkap: {missing[0]} belum diupload."

    return {
        "tanggal": tanggal.isoformat(),
        "complete": len(missing) == 0,
        "mb52": _upload_status_payload(mb52),
        "zsd_sodo": _upload_status_payload(zsd_sodo),
        "missing": missing,
        "message": message,
    }


@router.get("/uploads", response_model=List[SAPUploadOut])
def get_upload_history(
    db: Session = Depends(get_db),
    jenis_file: Optional[str] = None,
    limit: int = 20,
):
    """Ambil riwayat upload file SAP."""
    query = db.query(SAPUpload).order_by(SAPUpload.created_at.desc()).limit(limit)
    
    if jenis_file:
        query = query.filter(SAPUpload.jenis_file == jenis_file)
    
    return query.all()
