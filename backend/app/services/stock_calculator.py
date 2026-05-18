"""
Stock Calculator Service
Menghitung metrik stok berdasarkan data mentah SAP yang sudah di-parse.
Rumus sesuai PRD:
  - Stok Fisik       = SUM(unrestricted) dari MB52
  - Outstanding SO    = SUM(outstanding_qty) dari ZSD_SODO
  - Admin Tanpa Intransit = Stok Fisik - Outstanding SO
  - Intransit         = (dari data intransit, jika ada)
  - Stok Admin        = Admin Tanpa Intransit + Intransit
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, delete
from datetime import date
from typing import List, Dict, Any

from app.models.models import SAPStock, SAPOutstandingDO, StockCalculation, WarehousePlant


def calculate_daily_stock(db: Session, tanggal: date, gudang_id: int, jenis_pupuk: str) -> Dict[str, Any]:
    """Hitung stok untuk satu gudang dan satu jenis pupuk pada tanggal tertentu."""
    
    # Stok Fisik = total unrestricted dari MB52
    fisik = db.query(func.coalesce(func.sum(SAPStock.unrestricted), 0.0)).join(
        WarehousePlant, WarehousePlant.kode_plant == SAPStock.kode_plant
    ).filter(
        SAPStock.tanggal == tanggal,
        WarehousePlant.gudang_id == gudang_id,
        SAPStock.jenis_pupuk == jenis_pupuk,
    ).scalar()
    fisik = float(fisik)

    # Outstanding SO = total outstanding dari ZSD_SODO
    outstanding_so = db.query(func.coalesce(func.sum(SAPOutstandingDO.outstanding_qty), 0.0)).join(
        WarehousePlant, WarehousePlant.kode_plant == SAPOutstandingDO.kode_plant
    ).filter(
        SAPOutstandingDO.tanggal == tanggal,
        WarehousePlant.gudang_id == gudang_id,
        SAPOutstandingDO.jenis_pupuk == jenis_pupuk,
    ).scalar()
    outstanding_so = float(outstanding_so)

    # Intransit = Stock in Transit dari MB52
    intransit = db.query(func.coalesce(func.sum(SAPStock.intransit), 0.0)).join(
        WarehousePlant, WarehousePlant.kode_plant == SAPStock.kode_plant
    ).filter(
        SAPStock.tanggal == tanggal,
        WarehousePlant.gudang_id == gudang_id,
        SAPStock.jenis_pupuk == jenis_pupuk,
    ).scalar()
    intransit = float(intransit)

    # Rumus kalkulasi
    stok_admin_tanpa_intransit = fisik - outstanding_so
    stok_admin = stok_admin_tanpa_intransit + intransit

    return {
        "stok_fisik": round(fisik, 2),
        "outstanding_so": round(outstanding_so, 2),
        "stok_admin_tanpa_intransit": round(stok_admin_tanpa_intransit, 2),
        "intransit": round(intransit, 2),
        "stok_admin": round(stok_admin, 2),
    }


def update_stock_calculation(db: Session, tanggal: date, gudang_id: int, jenis_pupuk: str) -> StockCalculation:
    """Hitung dan simpan/update hasil kalkulasi stok ke database."""
    
    calc_data = calculate_daily_stock(db, tanggal, gudang_id, jenis_pupuk)

    # Cek apakah sudah ada record
    record = db.query(StockCalculation).filter(
        StockCalculation.tanggal == tanggal,
        StockCalculation.gudang_id == gudang_id,
        StockCalculation.tipe_pupuk == jenis_pupuk,
    ).first()

    if record:
        record.stok_fisik = calc_data["stok_fisik"]
        record.outstanding_so = calc_data["outstanding_so"]
        record.stok_admin_tanpa_intransit = calc_data["stok_admin_tanpa_intransit"]
        record.intransit = calc_data["intransit"]
        record.stok_admin = calc_data["stok_admin"]
    else:
        record = StockCalculation(
            tanggal=tanggal,
            gudang_id=gudang_id,
            tipe_pupuk=jenis_pupuk,
            **calc_data,
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return record


def recalculate_all_for_date(db: Session, tanggal: date) -> List[Dict[str, Any]]:
    """
    Hitung ulang stok untuk SEMUA gudang dan jenis pupuk pada tanggal tertentu.
    Dipanggil setelah upload file baru.
    """
    # Cari semua kombinasi unik (gudang_id, jenis_pupuk) yang ada di data SAP hari itu
    mb52_combos = db.query(WarehousePlant.gudang_id, SAPStock.jenis_pupuk).join(
        SAPStock, WarehousePlant.kode_plant == SAPStock.kode_plant
    ).filter(
        SAPStock.tanggal == tanggal
    ).distinct().all()
    
    do_combos = db.query(WarehousePlant.gudang_id, SAPOutstandingDO.jenis_pupuk).join(
        SAPOutstandingDO, WarehousePlant.kode_plant == SAPOutstandingDO.kode_plant
    ).filter(
        SAPOutstandingDO.tanggal == tanggal
    ).distinct().all()
    
    # Gabungkan semua kombinasi unik
    combos = set()
    for row in mb52_combos:
        combos.add((row[0], row[1]))
    for row in do_combos:
        combos.add((row[0], row[1]))
    
    results = []
    for gudang_id, jenis_pupuk in combos:
        record = update_stock_calculation(db, tanggal, gudang_id, jenis_pupuk)
        results.append({
            "gudang_id": gudang_id,
            "tipe_pupuk": jenis_pupuk,
            "stok_fisik": record.stok_fisik,
            "outstanding_so": record.outstanding_so,
            "stok_admin_tanpa_intransit": record.stok_admin_tanpa_intransit,
            "intransit": record.intransit,
            "stok_admin": record.stok_admin,
        })
    
    return results


def save_mb52_data(db: Session, tanggal: date, rows: List[Dict[str, Any]]) -> int:
    """
    Simpan data parsing MB52 ke tabel sap_stock.
    Hapus data lama untuk tanggal yang sama sebelum insert (replace strategy).
    """
    db.execute(delete(SAPStock).where(SAPStock.tanggal == tanggal))
    
    count = 0
    for row in rows:
        record = SAPStock(**row)
        db.add(record)
        count += 1
    
    db.commit()
    return count


def save_zsd_sodo_data(db: Session, tanggal: date, rows: List[Dict[str, Any]]) -> int:
    """
    Simpan data parsing ZSD_SODO ke tabel sap_outstanding_do.
    Hapus data lama untuk tanggal yang sama sebelum insert (replace strategy).
    """
    db.execute(delete(SAPOutstandingDO).where(SAPOutstandingDO.tanggal == tanggal))
    
    count = 0
    for row in rows:
        record = SAPOutstandingDO(**row)
        db.add(record)
        count += 1
    
    db.commit()
    return count
