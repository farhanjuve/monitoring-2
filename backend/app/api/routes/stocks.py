"""
Stock API Routes
Endpoints untuk:
  - Upload file MB52 & ZSD_SODO dari SAP
  - Query hasil kalkulasi stok
  - Preview perhitungan stok
  - Recalculate stok
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import case, func
from datetime import date
from typing import List, Optional
from collections import defaultdict
import io
from openpyxl import Workbook
from openpyxl.formatting.rule import DataBarRule
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.core.database import get_db
from app.core.kapasitas import load_kapasitas
from app.core.time import to_utc_iso
from app.models.models import StockCalculation, SAPStock, SAPUpload, Warehouse, WarehousePlant
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
    query = query.options(
        joinedload(StockCalculation.warehouse).selectinload(Warehouse.plants)
    )
    
    return query.all()


@router.get("/coverage")
def get_coverage(
    tanggal: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Ringkasan cakupan monitoring untuk satu tanggal:
      - jumlah gudang & kode plant yang dipetakan
      - stok yang sudah masuk gudang (dari stock_calculations)
      - "stok pabrik" = stok MB52 pada plant yang belum punya gudang (di luar master)

    Gudang + pabrik = total MB52, sehingga selisih rekonsiliasi bisa dilihat langsung.
    """
    if not tanggal:
        tanggal = db.query(func.max(SAPStock.tanggal)).scalar()
    if not tanggal:
        raise HTTPException(status_code=404, detail="Belum ada data stok SAP.")

    mapped = WarehousePlant.kode_plant.isnot(None)
    unmapped = WarehousePlant.kode_plant.is_(None)

    per_komoditas = (
        db.query(
            SAPStock.jenis_pupuk,
            func.coalesce(func.sum(case((mapped, SAPStock.unrestricted), else_=0.0)), 0.0),
            func.coalesce(func.sum(case((mapped, SAPStock.intransit), else_=0.0)), 0.0),
            func.coalesce(func.sum(case((unmapped, SAPStock.unrestricted), else_=0.0)), 0.0),
            func.coalesce(func.sum(case((unmapped, SAPStock.intransit), else_=0.0)), 0.0),
        )
        .select_from(SAPStock)
        .outerjoin(WarehousePlant, WarehousePlant.kode_plant == SAPStock.kode_plant)
        .filter(SAPStock.tanggal == tanggal)
        .group_by(SAPStock.jenis_pupuk)
        .order_by(SAPStock.jenis_pupuk)
        .all()
    )

    plant_counts = (
        db.query(
            func.count(
                func.distinct(
                    case((mapped, SAPStock.kode_plant), else_=None)
                )
            ),
            func.count(
                func.distinct(
                    case((unmapped, SAPStock.kode_plant), else_=None)
                )
            ),
            func.count(func.distinct(SAPStock.kode_plant)),
        )
        .select_from(SAPStock)
        .outerjoin(WarehousePlant, WarehousePlant.kode_plant == SAPStock.kode_plant)
        .filter(SAPStock.tanggal == tanggal)
        .one()
    )

    stok_gudang = (
        db.query(
            func.coalesce(func.sum(StockCalculation.stok_fisik), 0.0),
            func.coalesce(func.sum(StockCalculation.stok_admin), 0.0),
            func.coalesce(func.sum(StockCalculation.intransit), 0.0),
        )
        .filter(StockCalculation.tanggal == tanggal)
        .one()
    )

    gudang_total = db.query(func.count(Warehouse.id)).scalar() or 0
    gudang_aktif = (
        db.query(func.count(Warehouse.id)).filter(Warehouse.is_active == True).scalar() or 0
    )
    gudang_berstok = (
        db.query(func.count(func.distinct(StockCalculation.gudang_id)))
        .filter(StockCalculation.tanggal == tanggal)
        .scalar()
        or 0
    )
    kode_plant = db.query(func.count(WarehousePlant.kode_plant)).scalar() or 0

    komoditas = [
        {
            "tipe_pupuk": row[0],
            "gudang_fisik": round(float(row[1] or 0), 2),
            "gudang_intransit": round(float(row[2] or 0), 2),
            "pabrik_fisik": round(float(row[3] or 0), 2),
            "pabrik_intransit": round(float(row[4] or 0), 2),
            "total_fisik": round(float(row[1] or 0) + float(row[3] or 0), 2),
        }
        for row in per_komoditas
    ]

    pabrik_fisik = sum(item["pabrik_fisik"] for item in komoditas)
    pabrik_intransit = sum(item["pabrik_intransit"] for item in komoditas)
    total_fisik = sum(item["total_fisik"] for item in komoditas)

    return {
        "tanggal": tanggal.isoformat(),
        "gudang": {
            "total": gudang_total,
            "aktif": gudang_aktif,
            "dengan_stok": gudang_berstok,
            "kode_plant": kode_plant,
            "plant_terpetakan": plant_counts[0] or 0,
            "plant_pabrik": plant_counts[1] or 0,
            "plant_sap": plant_counts[2] or 0,
        },
        "stok_gudang": {
            "fisik": round(float(stok_gudang[0] or 0), 2),
            "admin": round(float(stok_gudang[1] or 0), 2),
            "intransit": round(float(stok_gudang[2] or 0), 2),
        },
        "pabrik": {
            "fisik": round(pabrik_fisik, 2),
            "intransit": round(pabrik_intransit, 2),
            "plant": plant_counts[1] or 0,
        },
        "total_sap": {
            "fisik": round(total_fisik, 2),
            "intransit": round(
                sum(item["gudang_intransit"] for item in komoditas) + pabrik_intransit, 2
            ),
        },
        "komoditas": komoditas,
    }


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


PROVINCE_MAPPING = {
    # Sumatera (termasuk Lampung)
    "aceh": "Sumatera",
    "sumatera utara": "Sumatera",
    "sumatera barat": "Sumatera",
    "riau": "Sumatera",
    "kepulauan riau": "Sumatera",
    "jambi": "Sumatera",
    "bengkulu": "Sumatera",
    "sumatera selatan": "Sumatera",
    "kepulauan bangka belitung": "Sumatera",
    "bangka belitung": "Sumatera",
    "lampung": "Sumatera",
    
    # Jawa
    "banten": "Jawa",
    "dki jakarta": "Jawa",
    "dki": "Jawa",
    "jakarta": "Jawa",
    "jawa barat": "Jawa",
    "jawa tengah": "Jawa",
    "di yogyakarta": "Jawa",
    "yogyakarta": "Jawa",
    "jawa timur": "Jawa",
    
    # Bali & Nusa Tenggara
    "bali": "Bali & NT",
    "nusa tenggara barat": "Bali & NT",
    "ntb": "Bali & NT",
    "nusa tenggara timur": "Bali & NT",
    "ntt": "Bali & NT",
    
    # Kalimantan
    "kalimantan barat": "Kalimantan",
    "kalimantan tengah": "Kalimantan",
    "kalimantan selatan": "Kalimantan",
    "kalimantan timur": "Kalimantan",
    "kalimantan utara": "Kalimantan",
}

def get_area_for_province(province: str) -> str:
    if not province:
        return "Sulamapa"
    prov_lower = province.strip().lower()
    for key, area in PROVINCE_MAPPING.items():
        if key in prov_lower:
            return area
    return "Sulamapa"

@router.get("/export-excel")
def export_excel(
    tanggal: date,
    db: Session = Depends(get_db),
):
    # Fetch all active warehouses
    warehouses = db.query(Warehouse).filter(Warehouse.is_active == True).all()
    
    # Fetch all calculations for the target date
    calcs = db.query(StockCalculation).filter(StockCalculation.tanggal == tanggal).all()
    
    # Map calculations for fast lookup: (gudang_id, tipe_pupuk) -> calculation
    calc_map = {}
    for c in calcs:
        calc_map[(c.gudang_id, c.tipe_pupuk)] = c

    # Areas defined by user
    areas = ["Sumatera", "Jawa", "Bali & NT", "Kalimantan", "Sulamapa"]
    fertilizers = ["Urea", "NPK"]

    wb = Workbook()
    
    # Remove default sheet
    default_sheet = wb.active
    if default_sheet:
        wb.remove(default_sheet)

    # Styles
    header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    bold_font = Font(name="Calibri", size=11, bold=True)
    regular_font = Font(name="Calibri", size=11)
    
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),
        bottom=Side(style='thin', color='D9D9D9')
    )
    
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align = Alignment(horizontal="left", vertical="center")
    right_align = Alignment(horizontal="right", vertical="center")
    center_align = Alignment(horizontal="center", vertical="center")

    headers = [
        "Kabupaten / Kota",
        "Kode Plant",
        "Nama Gudang",
        "Stok Fisik",
        "Outstanding SO",
        "Stok Admin (Tanpa Intransit)",
        "Intransit",
        "Stok Admin"
    ]

    for area in areas:
        for fert in fertilizers:
            # Filter warehouses in this area
            area_warehouses = []
            for w in warehouses:
                w_area = get_area_for_province(w.provinsi)
                if w_area == area:
                    area_warehouses.append(w)
            
            # Group by province -> city/kabupaten
            prov_groups = {}
            for w in area_warehouses:
                prov = (w.provinsi or "TIDAK DIKETAHUI").strip().upper()
                city = (w.kota or "TIDAK DIKETAHUI").strip().upper()
                if prov not in prov_groups:
                    prov_groups[prov] = {}
                if city not in prov_groups[prov]:
                    prov_groups[prov][city] = []
                prov_groups[prov][city].append(w)

            # Sort provinces by minimum province code (first 2 digits of kode_kab)
            def get_province_sort_key(prov_name):
                all_w = []
                for city in prov_groups[prov_name].values():
                    all_w.extend(city)
                codes = []
                for w in all_w:
                    if w.kode_kab:
                        try:
                            codes.append(int(w.kode_kab) // 100)
                        except (ValueError, TypeError):
                            pass
                return min(codes) if codes else 99

            sorted_provinces = sorted(prov_groups.keys(), key=lambda p: (get_province_sort_key(p), p))

            # Sheet name
            sheet_title = f"{area} - {fert}"
            ws = wb.create_sheet(title=sheet_title)
            
            # Show grid lines
            ws.views.sheetView[0].showGridLines = True

            # Write Title
            ws.cell(row=1, column=1, value=f"LAPORAN HARIAN STOK {fert.upper()} - WILAYAH {area.upper()}").font = Font(name="Calibri", size=14, bold=True)
            ws.cell(row=2, column=1, value=f"Tanggal: {tanggal.strftime('%d %B %Y')}").font = Font(name="Calibri", size=11, italic=True)
            
            # Write Headers
            for col_idx, h in enumerate(headers, 1):
                cell = ws.cell(row=4, column=col_idx, value=h)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_align
                cell.border = thin_border
            
            ws.row_dimensions[4].height = 28
            
            current_row = 5
            total_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
            total_font = Font(name="Calibri", size=11, bold=True)

            for prov in sorted_provinces:
                # Accumulators for province totals
                prov_stok_fisik = 0.0
                prov_outstanding_so = 0.0
                prov_stok_admin_tanpa_intransit = 0.0
                prov_intransit = 0.0
                prov_stok_admin = 0.0

                sorted_cities = sorted(prov_groups[prov].keys())
                for city in sorted_cities:
                    gudangs = sorted(prov_groups[prov][city], key=lambda x: (x.nama_gudang or "").lower())
                    start_row = current_row
                    
                    for w in gudangs:
                        # Fetch calculation
                        calc = calc_map.get((w.id, fert))
                        stok_fisik = calc.stok_fisik if calc else 0.0
                        outstanding_so = calc.outstanding_so if calc else 0.0
                        stok_admin_tanpa_intransit = calc.stok_admin_tanpa_intransit if calc else 0.0
                        intransit = calc.intransit if calc else 0.0
                        stok_admin = calc.stok_admin if calc else 0.0
                        
                        # Add to province totals
                        prov_stok_fisik += stok_fisik
                        prov_outstanding_so += outstanding_so
                        prov_stok_admin_tanpa_intransit += stok_admin_tanpa_intransit
                        prov_intransit += intransit
                        prov_stok_admin += stok_admin

                        kode_plants = "/".join(sorted([p.kode_plant for p in w.plants]))
                        
                        ws.cell(row=current_row, column=1, value=city).alignment = center_align
                        ws.cell(row=current_row, column=2, value=kode_plants).alignment = center_align
                        ws.cell(row=current_row, column=3, value=w.nama_gudang).alignment = left_align
                        
                        # Numeric values
                        for col_idx, val in enumerate([stok_fisik, outstanding_so, stok_admin_tanpa_intransit, intransit, stok_admin], 4):
                            cell = ws.cell(row=current_row, column=col_idx, value=val)
                            cell.alignment = right_align
                            cell.number_format = '#,##0.00'
                        
                        # Apply font & border to row
                        for col_idx in range(1, 9):
                            cell = ws.cell(row=current_row, column=col_idx)
                            cell.font = regular_font
                            cell.border = thin_border
                        
                        current_row += 1
                    
                    end_row = current_row - 1
                    if end_row >= start_row:
                        if end_row > start_row:
                            ws.merge_cells(start_row=start_row, start_column=1, end_row=end_row, end_column=1)
                        # Force center alignment on merged area
                        ws.cell(row=start_row, column=1).alignment = center_align

                # Write Province Total Row
                ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=3)
                total_label_cell = ws.cell(row=current_row, column=1, value=f"Total Stok Provinsi {prov.title()}")
                total_label_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
                
                # Write sums
                ws.cell(row=current_row, column=4, value=prov_stok_fisik)
                ws.cell(row=current_row, column=5, value=prov_outstanding_so)
                ws.cell(row=current_row, column=6, value=prov_stok_admin_tanpa_intransit)
                ws.cell(row=current_row, column=7, value=prov_intransit)
                ws.cell(row=current_row, column=8, value=prov_stok_admin)

                # Format total row
                ws.row_dimensions[current_row].height = 22
                for col_idx in range(1, 9):
                    cell = ws.cell(row=current_row, column=col_idx)
                    cell.font = total_font
                    cell.fill = total_fill
                    cell.border = thin_border
                    if col_idx >= 4:
                        cell.alignment = right_align
                        cell.number_format = '#,##0.00'
                
                current_row += 1

            # Auto-fit columns
            for col in ws.columns:
                max_len = 0
                col_letter = col[0].column_letter
                for cell in col:
                    if cell.row < 4:
                        continue  # Skip title row lengths
                    val_str = str(cell.value or "")
                    if len(val_str) > max_len:
                        max_len = len(val_str)
                ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Save to IO stream
    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)
    
    filename = f"Laporan_Stok_{tanggal.isoformat()}.xlsx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== Laporan Keterisian Gudang ====================

_BULAN_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

_AREA_ORDER = ["Sumatera", "Jawa", "Bali & NT", "Kalimantan", "Sulamapa"]
_FERTILIZER_ORDER = ["Urea", "NPK", "ZA", "SP-36", "Organik", "NPK Kakao"]

_OCCUPANCY_STATUS_LABEL = {
    "ok": "Lega",
    "warn": "Waspada",
    "low": "Kritis",
    "full": "Penuh",
    "na": "Tanpa kapasitas",
    "none": "Belum ada data",
}

_OCCUPANCY_STATUS_RANK = {"full": 0, "low": 1, "warn": 2, "ok": 3, "na": 4, "none": 5}

_OCCUPANCY_STATUS_STYLE = {
    "ok": ("C6EFCE", "006100"),
    "warn": ("FFEB9C", "9C6500"),
    "low": ("F8CBAD", "9C0006"),
    "full": ("FFC7CE", "9C0006"),
    "na": ("D9D9D9", "404040"),
    "none": ("E7E6E6", "808080"),
}


def _format_tanggal_id(value: date) -> str:
    return f"{value.day} {_BULAN_ID[value.month - 1]} {value.year}"


def _occupancy_status(total_admin: float, kapasitas: float, has_data: bool) -> str:
    if kapasitas <= 0:
        return "na"
    if not has_data:
        return "none"
    ratio = total_admin / kapasitas
    if ratio > 1:
        return "full"
    if ratio >= 0.9:
        return "low"
    if ratio >= 0.7:
        return "warn"
    return "ok"


def _area_index(area: str) -> int:
    try:
        return _AREA_ORDER.index(area)
    except ValueError:
        return len(_AREA_ORDER)


@router.get("/export-occupancy-excel")
def export_occupancy_excel(
    tanggal: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Laporan keterisian gudang per provinsi dalam format Excel.

    Keterisian = stok admin / kapasitas gudang. Kapasitas gudang multi-plant
    dijumlahkan dari seluruh kode plant-nya (kode duplikat sudah bernilai 0
    di peta kapasitas). Hanya gudang aktif yang masuk laporan.
    """
    if not tanggal:
        tanggal = db.query(func.max(StockCalculation.tanggal)).scalar()
    if not tanggal:
        raise HTTPException(status_code=404, detail="Belum ada data stok.")

    kapasitas_map = load_kapasitas()

    warehouses = (
        db.query(Warehouse)
        .filter(Warehouse.is_active == True)
        .options(selectinload(Warehouse.plants))
        .all()
    )
    calcs = (
        db.query(StockCalculation)
        .filter(StockCalculation.tanggal == tanggal)
        .all()
    )
    if not calcs:
        raise HTTPException(
            status_code=404,
            detail=f"Tidak ada data stok untuk tanggal {tanggal.isoformat()}.",
        )

    stock_map: dict[int, dict[str, tuple[float, float]]] = {}
    present_ferts: set[str] = set()
    for calc in calcs:
        present_ferts.add(calc.tipe_pupuk)
        stock_map.setdefault(calc.gudang_id, {})[calc.tipe_pupuk] = (
            float(calc.stok_admin or 0.0),
            float(calc.stok_fisik or 0.0),
        )

    ferts = [f for f in _FERTILIZER_ORDER if f in present_ferts]
    ferts += sorted(present_ferts - set(ferts))
    if not ferts:
        ferts = ["Urea", "NPK"]

    rows = []
    for warehouse in warehouses:
        plants = sorted(
            [p for p in warehouse.plants if p.kode_plant],
            key=lambda p: p.kode_plant,
        )
        kode_plants = "/".join(p.kode_plant for p in plants)
        kapasitas = sum(kapasitas_map.get(p.kode_plant, 0.0) for p in plants)

        admin_by_fert = {}
        fisik_by_fert = {}
        for fert in ferts:
            admin, fisik = stock_map.get(warehouse.id, {}).get(fert, (0.0, 0.0))
            admin_by_fert[fert] = admin
            fisik_by_fert[fert] = fisik

        total_admin = sum(admin_by_fert.values())
        total_fisik = sum(fisik_by_fert.values())
        has_data = warehouse.id in stock_map
        status = _occupancy_status(total_admin, kapasitas, has_data)
        ratio = (total_admin / kapasitas) if (kapasitas > 0 and has_data) else None
        sisa = (kapasitas - total_admin) if (kapasitas > 0 and has_data) else None

        rows.append(
            {
                "area": get_area_for_province(warehouse.provinsi),
                "provinsi": (warehouse.provinsi or "TIDAK DIKETAHUI").strip().upper(),
                "kabupaten": (warehouse.kota or "TIDAK DIKETAHUI").strip().upper(),
                "kode_plants": kode_plants,
                "nama": warehouse.nama_gudang or f"Gudang {warehouse.id}",
                "jumlah_plant": len(plants),
                "kapasitas": float(kapasitas),
                "admin_by_fert": admin_by_fert,
                "fisik_by_fert": fisik_by_fert,
                "total_admin": total_admin,
                "total_fisik": total_fisik,
                "ratio": ratio,
                "status": status,
                "sisa": sisa,
                "has_data": has_data,
            }
        )

    rows.sort(
        key=lambda row: (
            _area_index(row["area"]),
            row["provinsi"],
            _OCCUPANCY_STATUS_RANK.get(row["status"], 9),
            -(row["ratio"] if row["ratio"] is not None else -1.0),
            row["nama"].lower(),
        )
    )

    # Rekap per provinsi.
    provinsi_map: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = (row["area"], row["provinsi"])
        agg = provinsi_map.setdefault(
            key,
            {
                "gudang": 0,
                "dengan_data": 0,
                "kapasitas": 0.0,
                "admin": 0.0,
                "fisik": 0.0,
                "status": defaultdict(int),
            },
        )
        agg["gudang"] += 1
        agg["dengan_data"] += 1 if row["has_data"] else 0
        agg["kapasitas"] += row["kapasitas"]
        agg["admin"] += row["total_admin"]
        agg["fisik"] += row["total_fisik"]
        agg["status"][row["status"]] += 1

    # ==================== Styles ====================
    navy = "1F4E78"
    navy_soft = "D9E2F3"
    border_color = "D9D9D9"
    thin = Side(style="thin", color=border_color)
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill("solid", fgColor=navy)
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=15, bold=True, color=navy)
    subtitle_font = Font(name="Calibri", size=10, italic=True, color="404040")
    note_font = Font(name="Calibri", size=9, italic=True, color="595959")
    body_font = Font(name="Calibri", size=10, color="000000")
    bold_font = Font(name="Calibri", size=10, bold=True, color="000000")
    total_font = Font(name="Calibri", size=10, bold=True, color=navy)

    wb = Workbook()

    # ==================== Sheet 1: Ringkasan Provinsi ====================
    ws = wb.active
    ws.title = "Ringkasan Provinsi"
    ws.sheet_properties.tabColor = navy
    last_col = 14

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_col)
    cell = ws.cell(row=1, column=1, value="LAPORAN KETERISIAN GUDANG PER PROVINSI")
    cell.font = title_font
    cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 24

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_col)
    cell = ws.cell(
        row=2,
        column=1,
        value=(
            f"Tanggal data: {_format_tanggal_id(tanggal)}  |  "
            "Dasar keterisian: stok admin ÷ kapasitas gudang  |  Hanya gudang aktif"
        ),
    )
    cell.font = subtitle_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_col)
    cell = ws.cell(
        row=3,
        column=1,
        value=(
            "Angka dalam ton. Keterisian dihitung dari total gabungan seluruh jenis pupuk. "
            "Kapasitas 0 ditampilkan sebagai “Tanpa kapasitas”."
        ),
    )
    cell.font = note_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    summary_headers = [
        "Wilayah",
        "Provinsi",
        "Jumlah Gudang",
        "Kapasitas (t)",
        "Stok Admin (t)",
        "Stok Fisik (t)",
        "Keterisian",
        "Sisa Ruang (t)",
        "Lega",
        "Waspada",
        "Kritis",
        "Penuh",
        "Tanpa Kapasitas",
        "Belum Ada Data",
    ]
    header_row = 5
    for col, label in enumerate(summary_headers, start=1):
        cell = ws.cell(row=header_row, column=col, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    ws.row_dimensions[header_row].height = 34

    def write_summary_row(
        values: list,
        row_index: int,
        *,
        fill_hex: str | None = None,
        font: Font = body_font,
        merge_label: bool = False,
        status: str | None = None,
    ) -> None:
        # Nilai wajib ditulis SEBELUM merge. Setelah merge, kolom 2 menjadi
        # MergedCell yang read-only, sehingga menulis nilai ke sana melempar
        # AttributeError dan seluruh laporan gagal dibuat.
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row_index, column=col, value=value)
            cell.font = font
            cell.border = border
            if fill_hex:
                cell.fill = PatternFill("solid", fgColor=fill_hex)

            if col in (1, 2):
                cell.alignment = Alignment(
                    horizontal="center" if col == 1 else "left", vertical="center"
                )
            elif col == 3:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.number_format = "0"
            elif col in (4, 5, 6, 8):
                cell.alignment = Alignment(horizontal="right", vertical="center")
                if isinstance(value, (int, float)):
                    cell.number_format = "#,##0.0"
                if col == 8 and isinstance(value, (int, float)) and value < 0:
                    cell.font = Font(name="Calibri", size=10, bold=True, color="9C0006")
            elif col == 7:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if isinstance(value, (int, float)):
                    cell.number_format = "0.0%"
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.number_format = "0"

        if merge_label:
            ws.merge_cells(
                start_row=row_index, start_column=1, end_row=row_index, end_column=2
            )
            # Rapikan border/fill pada area merge (MergedCell hanya read-only
            # untuk nilai, atribut gaya masih boleh diubah).
            for col in (1, 2):
                merged_cell = ws.cell(row=row_index, column=col)
                merged_cell.border = border
                if fill_hex:
                    merged_cell.fill = PatternFill("solid", fgColor=fill_hex)

        if status:
            fill_hex_status, font_hex_status = _OCCUPANCY_STATUS_STYLE[status]
            cell = ws.cell(row=row_index, column=7)
            cell.fill = PatternFill("solid", fgColor=fill_hex_status)
            cell.font = Font(name="Calibri", size=10, bold=True, color=font_hex_status)

    row_index = header_row + 1
    grand = {
        "gudang": 0,
        "dengan_data": 0,
        "kapasitas": 0.0,
        "admin": 0.0,
        "fisik": 0.0,
        "status": defaultdict(int),
    }

    for area in _AREA_ORDER:
        area_keys = sorted(
            [key for key in provinsi_map if key[0] == area],
            key=lambda key: key[1],
        )
        if not area_keys:
            continue

        area_total = {
            "gudang": 0,
            "dengan_data": 0,
            "kapasitas": 0.0,
            "admin": 0.0,
            "fisik": 0.0,
            "status": defaultdict(int),
        }

        for key in area_keys:
            agg = provinsi_map[key]
            kapasitas = agg["kapasitas"]
            # "Belum ada data" hanya boleh muncul bila memang tidak ada satu pun
            # gudang di provinsi itu yang punya baris stok pada tanggal tersebut.
            has_data = agg["dengan_data"] > 0
            ratio = (agg["admin"] / kapasitas) if (kapasitas > 0 and has_data) else None
            sisa = (kapasitas - agg["admin"]) if (kapasitas > 0 and has_data) else None
            status = _occupancy_status(agg["admin"], kapasitas, has_data)

            write_summary_row(
                [
                    key[0],
                    key[1],
                    agg["gudang"],
                    kapasitas,
                    agg["admin"],
                    agg["fisik"],
                    ratio if ratio is not None else "—",
                    sisa if sisa is not None else "—",
                    agg["status"].get("ok", 0),
                    agg["status"].get("warn", 0),
                    agg["status"].get("low", 0),
                    agg["status"].get("full", 0),
                    agg["status"].get("na", 0),
                    agg["status"].get("none", 0),
                ],
                row_index,
                status=status,
            )
            row_index += 1

            area_total["gudang"] += agg["gudang"]
            area_total["dengan_data"] += agg["dengan_data"]
            area_total["kapasitas"] += kapasitas
            area_total["admin"] += agg["admin"]
            area_total["fisik"] += agg["fisik"]
            for status_key, count in agg["status"].items():
                area_total["status"][status_key] += count

        area_has_data = area_total["dengan_data"] > 0
        area_ratio = (
            (area_total["admin"] / area_total["kapasitas"])
            if (area_total["kapasitas"] > 0 and area_has_data)
            else None
        )
        area_sisa = (
            (area_total["kapasitas"] - area_total["admin"])
            if (area_total["kapasitas"] > 0 and area_has_data)
            else None
        )
        area_status = _occupancy_status(
            area_total["admin"], area_total["kapasitas"], area_has_data
        )
        write_summary_row(
            [
                f"Total {area}",
                "",
                area_total["gudang"],
                area_total["kapasitas"],
                area_total["admin"],
                area_total["fisik"],
                area_ratio if area_ratio is not None else "—",
                area_sisa if area_sisa is not None else "—",
                area_total["status"].get("ok", 0),
                area_total["status"].get("warn", 0),
                area_total["status"].get("low", 0),
                area_total["status"].get("full", 0),
                area_total["status"].get("na", 0),
                area_total["status"].get("none", 0),
            ],
            row_index,
            fill_hex=navy_soft,
            font=total_font,
            merge_label=True,
        )
        row_index += 1

        grand["gudang"] += area_total["gudang"]
        grand["dengan_data"] += area_total["dengan_data"]
        grand["kapasitas"] += area_total["kapasitas"]
        grand["admin"] += area_total["admin"]
        grand["fisik"] += area_total["fisik"]
        for status_key, count in area_total["status"].items():
            grand["status"][status_key] += count

    grand_has_data = grand["dengan_data"] > 0
    grand_ratio = (
        (grand["admin"] / grand["kapasitas"])
        if (grand["kapasitas"] > 0 and grand_has_data)
        else None
    )
    grand_sisa = (
        (grand["kapasitas"] - grand["admin"])
        if (grand["kapasitas"] > 0 and grand_has_data)
        else None
    )
    write_summary_row(
        [
            "TOTAL NASIONAL",
            "",
            grand["gudang"],
            grand["kapasitas"],
            grand["admin"],
            grand["fisik"],
            grand_ratio if grand_ratio is not None else "—",
            grand_sisa if grand_sisa is not None else "—",
            grand["status"].get("ok", 0),
            grand["status"].get("warn", 0),
            grand["status"].get("low", 0),
            grand["status"].get("full", 0),
            grand["status"].get("na", 0),
            grand["status"].get("none", 0),
        ],
        row_index,
        fill_hex=navy,
        font=Font(name="Calibri", size=10, bold=True, color="FFFFFF"),
        merge_label=True,
    )

    summary_widths = {
        "A": 13,
        "B": 20,
        "C": 10,
        "D": 14,
        "E": 14,
        "F": 14,
        "G": 10,
        "H": 14,
        "I": 8,
        "J": 9,
        "K": 7,
        "L": 7,
        "M": 12,
        "N": 12,
    }
    for col, width in summary_widths.items():
        ws.column_dimensions[col].width = width

    ws.freeze_panes = "A6"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{header_row}:{header_row}"

    # ==================== Sheet 2: Detail Gudang ====================
    ws = wb.create_sheet("Detail Gudang")
    ws.sheet_properties.tabColor = "00B0B9"

    fert_count = len(ferts)
    base_col_count = 8
    admin_start = base_col_count + 1
    fisik_total_col = admin_start + fert_count
    fisik_start = fisik_total_col + 1
    p_col = fisik_start + fert_count
    status_col = p_col + 1
    sisa_col = status_col + 1
    last_col = sisa_col

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_col)
    cell = ws.cell(row=1, column=1, value="DETAIL KETERISIAN GUDANG")
    cell.font = title_font
    cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 24

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_col)
    cell = ws.cell(
        row=2,
        column=1,
        value=(
            f"Tanggal data: {_format_tanggal_id(tanggal)}  |  "
            "Keterisian = stok admin ÷ kapasitas  |  Stok admin = (stok fisik − outstanding SO) + intransit"
        ),
    )
    cell.font = subtitle_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_col)
    cell = ws.cell(
        row=3,
        column=1,
        value=(
            "Gudang tanpa kapasitas tetap ditampilkan dan diurutkan paling bawah pada setiap provinsi. "
            "Kode plant yang sudah digabung ke gudang fisik yang sama bernilai kapasitas 0 agar tidak dihitung dua kali."
        ),
    )
    cell.font = note_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    detail_headers = [
        "Wilayah",
        "Provinsi",
        "Kabupaten/Kota",
        "Kode Plant",
        "Nama Gudang",
        "Jumlah Plant",
        "Kapasitas\n(t)",
        "Stok Admin\nTotal (t)",
    ]
    detail_headers += [f"Stok Admin\n{fert}\n(t)" for fert in ferts]
    detail_headers += ["Stok Fisik\nTotal (t)"]
    detail_headers += [f"Stok Fisik\n{fert}\n(t)" for fert in ferts]
    detail_headers += ["Keterisian", "Status", "Sisa Ruang\n(t)"]

    header_row = 5
    for col, label in enumerate(detail_headers, start=1):
        cell = ws.cell(row=header_row, column=col, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    ws.row_dimensions[header_row].height = 52

    zebra_fill = PatternFill("solid", fgColor="F7F9FC")
    prev_provinsi = None
    zebra = False

    for offset, row in enumerate(rows):
        row_index = header_row + 1 + offset
        if row["provinsi"] != prev_provinsi:
            prev_provinsi = row["provinsi"]
            zebra = not zebra
        row_fill = zebra_fill if zebra else None

        values = [
            row["area"],
            row["provinsi"],
            row["kabupaten"],
            row["kode_plants"],
            row["nama"],
            row["jumlah_plant"],
            row["kapasitas"],
            row["total_admin"],
        ]
        values += [row["admin_by_fert"][fert] for fert in ferts]
        values += [row["total_fisik"]]
        values += [row["fisik_by_fert"][fert] for fert in ferts]
        values += [
            row["ratio"] if row["ratio"] is not None else "—",
            _OCCUPANCY_STATUS_LABEL[row["status"]],
            row["sisa"] if row["sisa"] is not None else "—",
        ]

        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row_index, column=col, value=value)
            cell.border = border
            cell.font = body_font
            if row_fill:
                cell.fill = row_fill

            if col in (1, 4, 6):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col in (2, 3, 5):
                cell.alignment = Alignment(horizontal="left", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="right", vertical="center")

            if col == 6:
                cell.number_format = "0"
            elif col in (7, 8, fisik_total_col) or (
                admin_start <= col < admin_start + fert_count
            ) or (fisik_start <= col < fisik_start + fert_count) or col == sisa_col:
                if isinstance(value, (int, float)):
                    cell.number_format = "#,##0.0"
                if col == sisa_col and isinstance(value, (int, float)) and value < 0:
                    cell.font = Font(name="Calibri", size=10, bold=True, color="9C0006")
            elif col == p_col:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if isinstance(value, (int, float)):
                    cell.number_format = "0.0%"

        # Warna status.
        fill_hex_status, font_hex_status = _OCCUPANCY_STATUS_STYLE[row["status"]]
        status_cell = ws.cell(row=row_index, column=status_col)
        status_cell.fill = PatternFill("solid", fgColor=fill_hex_status)
        status_cell.font = Font(
            name="Calibri", size=10, bold=True, color=font_hex_status
        )
        status_cell.alignment = Alignment(horizontal="center", vertical="center")

        # Sel keterisian tanpa angka dibuat netral.
        if row["ratio"] is None:
            p_cell = ws.cell(row=row_index, column=p_col)
            p_cell.fill = PatternFill("solid", fgColor="F2F2F2")
            p_cell.font = Font(name="Calibri", size=10, color="808080")

    last_row = header_row + len(rows)
    if rows:
        ws.auto_filter.ref = f"A{header_row}:{get_column_letter(last_col)}{last_row}"
        ws.conditional_formatting.add(
            f"{get_column_letter(p_col)}{header_row + 1}:"
            f"{get_column_letter(p_col)}{last_row}",
            DataBarRule(
                start_type="num",
                start_value=0,
                end_type="num",
                end_value=1.2,
                color="5B9BD5",
                showValue=True,
            ),
        )

    detail_widths = {
        "A": 12,
        "B": 20,
        "C": 20,
        "D": 16,
        "E": 34,
        "F": 10,
        "G": 12,
    }
    for col in range(1, last_col + 1):
        letter = get_column_letter(col)
        ws.column_dimensions[letter].width = detail_widths.get(letter, 13)
    ws.column_dimensions[get_column_letter(p_col)].width = 11
    ws.column_dimensions[get_column_letter(status_col)].width = 16
    ws.column_dimensions[get_column_letter(sisa_col)].width = 14

    ws.freeze_panes = "G6"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{header_row}:{header_row}"

    # ==================== Sheet 3: Metodologi ====================
    ws = wb.create_sheet("Metodologi")
    ws.sheet_properties.tabColor = "808080"
    ws.column_dimensions["A"].width = 118

    ws.merge_cells("A1:A1")
    cell = ws.cell(row=1, column=1, value="METODOLOGI & DEFINISI")
    cell.font = title_font
    ws.row_dimensions[1].height = 24

    notes = [
        f"Tanggal data: {_format_tanggal_id(tanggal)}.",
        "Keterisian = stok admin ÷ kapasitas gudang. Nilai >100% berarti stok melebihi kapasitas.",
        "Stok admin = (stok fisik − outstanding SO) + intransit.",
        "Kapasitas gudang multi-plant = jumlah kapasitas seluruh kode plant-nya. Kode plant kedua yang merujuk gudang fisik yang sama diberi kapasitas 0 agar tidak double count.",
        "Hanya gudang aktif yang masuk laporan. Gudang nonaktif tidak dihitung.",
        "Gudang dengan kapasitas 0 tetap ditampilkan dengan status “Tanpa kapasitas” dan diurutkan paling bawah.",
        "Gudang dengan kapasitas >0 tetapi belum punya baris stok pada tanggal tersebut berstatus “Belum ada data”.",
        "Stok admin digunakan sebagai dasar utama keterisian; stok fisik ditampilkan sebagai pembanding.",
        "",
        "Ambang status:",
        "  ≤ 70%          : Lega",
        "  70% – <90%     : Waspada",
        "  90% – 100%     : Kritis",
        "  > 100%         : Penuh",
        "  Kapasitas 0    : Tanpa kapasitas",
        "  Belum ada data : Belum ada baris stok pada tanggal tersebut",
        "",
        "Sumber data: hasil kalkulasi stok harian (StockCalculation), master gudang, dan peta kapasitas plant.",
    ]
    for idx, text in enumerate(notes, start=3):
        cell = ws.cell(row=idx, column=1, value=text)
        cell.font = bold_font if text.endswith(":") else body_font
        cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        ws.row_dimensions[idx].height = 20 if text else 12

    # Tabel definisi status dengan warna. Ditempatkan di kolom B/C karena kolom A
    # dipakai catatan panjang (lebar 118), agar label tidak menjadi bar warna raksasa.
    status_row = len(notes) + 4
    ws.cell(row=status_row, column=2, value="Status").font = bold_font
    ws.cell(row=status_row, column=3, value="Arti").font = bold_font
    status_defs = [
        ("Lega", "Terisi ≤ 70% kapasitas", "ok"),
        ("Waspada", "Terisi 70% – <90% kapasitas", "warn"),
        ("Kritis", "Terisi 90% – 100% kapasitas", "low"),
        ("Penuh", "Terisi > 100% kapasitas", "full"),
        ("Tanpa kapasitas", "Kapasitas gudang belum ada di master", "na"),
        ("Belum ada data", "Belum ada baris stok pada tanggal tersebut", "none"),
    ]
    for idx, (label, meaning, status_key) in enumerate(status_defs, start=status_row + 1):
        fill_hex_status, font_hex_status = _OCCUPANCY_STATUS_STYLE[status_key]
        cell_status = ws.cell(row=idx, column=2, value=label)
        cell_status.fill = PatternFill("solid", fgColor=fill_hex_status)
        cell_status.font = Font(name="Calibri", size=10, bold=True, color=font_hex_status)
        cell_status.alignment = Alignment(horizontal="center", vertical="center")
        cell_meaning = ws.cell(row=idx, column=3, value=meaning)
        cell_meaning.font = body_font
        cell_meaning.alignment = Alignment(horizontal="left", vertical="center")
    ws.column_dimensions["B"].width = 20
    ws.column_dimensions["C"].width = 52

    # ==================== Simpan ====================
    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    filename = f"Laporan_Keterisian_Gudang_{tanggal.isoformat()}.xlsx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )

