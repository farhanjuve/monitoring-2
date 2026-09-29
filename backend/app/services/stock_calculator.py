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


def update_stock_calculation(db: Session, tanggal: date, gudang_id: int, jenis_pupuk: str, commit: bool = True) -> StockCalculation:
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

    if commit:
        db.commit()
        db.refresh(record)
    return record


def _gudang_available_dates(db: Session, gudang_id: int) -> List[date]:
    """Tanggal-tanggal yang punya data SAP (MB52/ZSD_SODO) untuk plant milik gudang ini."""
    plant_codes = [
        r[0] for r in db.query(WarehousePlant.kode_plant)
        .filter(WarehousePlant.gudang_id == gudang_id).all()
    ]
    if not plant_codes:
        return []

    sap_dates = {
        r[0] for r in db.query(SAPStock.tanggal)
        .filter(SAPStock.tanggal != None, SAPStock.kode_plant.in_(plant_codes))
        .distinct().all()
    }
    do_dates = {
        r[0] for r in db.query(SAPOutstandingDO.tanggal)
        .filter(SAPOutstandingDO.tanggal != None, SAPOutstandingDO.kode_plant.in_(plant_codes))
        .distinct().all()
    }
    return sorted(sap_dates | do_dates)


def recalculate_gudang_for_date(db: Session, tanggal: date, gudang_id: int) -> List[Dict[str, Any]]:
    """
    Hitung ulang stok untuk SATU gudang pada satu tanggal.
    Hapus record StockCalculation lama gudang tersebut lalu tulis dari data SAP terbaru.
    """
    plant_codes = [
        r[0] for r in db.query(WarehousePlant.kode_plant)
        .filter(WarehousePlant.gudang_id == gudang_id).all()
    ]
    if not plant_codes:
        return []

    # Data MB52 (stok fisik & intransit) untuk plant gudang ini
    mb52_data = db.query(
        SAPStock.jenis_pupuk,
        func.coalesce(func.sum(SAPStock.unrestricted), 0.0),
        func.coalesce(func.sum(SAPStock.intransit), 0.0),
    ).filter(
        SAPStock.tanggal == tanggal,
        SAPStock.kode_plant.in_(plant_codes),
    ).group_by(SAPStock.jenis_pupuk).all()

    # Data Outstanding DO untuk plant gudang ini
    do_data = db.query(
        SAPOutstandingDO.jenis_pupuk,
        func.coalesce(func.sum(SAPOutstandingDO.outstanding_qty), 0.0),
    ).filter(
        SAPOutstandingDO.tanggal == tanggal,
        SAPOutstandingDO.kode_plant.in_(plant_codes),
    ).group_by(SAPOutstandingDO.jenis_pupuk).all()

    combos: Dict[str, Dict[str, float]] = {}
    for jenis_pupuk, fisik, intransit in mb52_data:
        combos[jenis_pupuk] = {
            "stok_fisik": float(fisik),
            "intransit": float(intransit),
            "outstanding_so": 0.0,
        }
    for jenis_pupuk, outstanding in do_data:
        if jenis_pupuk not in combos:
            combos[jenis_pupuk] = {
                "stok_fisik": 0.0,
                "intransit": 0.0,
                "outstanding_so": float(outstanding),
            }
        else:
            combos[jenis_pupuk]["outstanding_so"] = float(outstanding)

    # Hapus record lama untuk gudang+tanggal ini supaya tidak ada sisa (stale) tipe pupuk
    db.query(StockCalculation).filter(
        StockCalculation.gudang_id == gudang_id,
        StockCalculation.tanggal == tanggal,
    ).delete(synchronize_session=False)

    results = []
    for jenis_pupuk, data in combos.items():
        stok_admin_tanpa_intransit = data["stok_fisik"] - data["outstanding_so"]
        stok_admin = stok_admin_tanpa_intransit + data["intransit"]

        record = StockCalculation(
            tanggal=tanggal,
            gudang_id=gudang_id,
            tipe_pupuk=jenis_pupuk,
            stok_fisik=round(data["stok_fisik"], 2),
            outstanding_so=round(data["outstanding_so"], 2),
            stok_admin_tanpa_intransit=round(stok_admin_tanpa_intransit, 2),
            intransit=round(data["intransit"], 2),
            stok_admin=round(stok_admin, 2),
        )
        db.add(record)
        results.append({"tipe_pupuk": jenis_pupuk, **data, "stok_admin": stok_admin})

    return results


def recalculate_warehouse_range(
    db: Session,
    gudang_id: int,
    tanggal_awal: Optional[str] = None,
    tanggal_akhir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Hitung ulang stok untuk satu gudang pada rentang tanggal.
    - Jika tanggal_awal/akhir kosong, gunakan kelonggaran seluruh tanggal yang punya data SAP.
    Return: total kombinasi terhitung, daftar tanggal yang diproses.
    """
    from datetime import datetime

    dates = _gudang_available_dates(db, gudang_id)
    if not dates:
        return {"processed_count": 0, "calculation_count": 0, "dates": []}

    if tanggal_awal:
        awal = datetime.strptime(tanggal_awal, "%Y-%m-%d").date()
        dates = [d for d in dates if d >= awal]
    if tanggal_akhir:
        akhir = datetime.strptime(tanggal_akhir, "%Y-%m-%d").date()
        dates = [d for d in dates if d <= akhir]

    processed_count = 0
    calculation_count = 0
    for d in dates:
        results = recalculate_gudang_for_date(db, d, gudang_id)
        if results:
            processed_count += 1
            calculation_count += len(results)

    db.commit()
    return {
        "processed_count": processed_count,
        "calculation_count": calculation_count,
        "dates": [d.isoformat() for d in dates],
    }


def recalculate_all_for_date(db: Session, tanggal: date) -> List[Dict[str, Any]]:
    """
    Hitung ulang stok untuk SEMUA gudang dan jenis pupuk pada tanggal tertentu.
    Dipanggil setelah upload file baru.
    """
    # 1. Ambil data MB52 (stok fisik & intransit) dikelompokkan berdasarkan gudang_id dan jenis_pupuk
    mb52_data = db.query(
        WarehousePlant.gudang_id,
        SAPStock.jenis_pupuk,
        func.coalesce(func.sum(SAPStock.unrestricted), 0.0),
        func.coalesce(func.sum(SAPStock.intransit), 0.0)
    ).join(
        SAPStock, WarehousePlant.kode_plant == SAPStock.kode_plant
    ).filter(
        SAPStock.tanggal == tanggal
    ).group_by(
        WarehousePlant.gudang_id,
        SAPStock.jenis_pupuk
    ).all()
    
    # 2. Ambil data Outstanding DO dikelompokkan berdasarkan gudang_id dan jenis_pupuk
    do_data = db.query(
        WarehousePlant.gudang_id,
        SAPOutstandingDO.jenis_pupuk,
        func.coalesce(func.sum(SAPOutstandingDO.outstanding_qty), 0.0)
    ).join(
        SAPOutstandingDO, WarehousePlant.kode_plant == SAPOutstandingDO.kode_plant
    ).filter(
        SAPOutstandingDO.tanggal == tanggal
    ).group_by(
        WarehousePlant.gudang_id,
        SAPOutstandingDO.jenis_pupuk
    ).all()
    
    # 3. Gabungkan hasil di memori python
    combos = {}
    for gudang_id, jenis_pupuk, fisik, intransit in mb52_data:
        combos[(gudang_id, jenis_pupuk)] = {
            "stok_fisik": float(fisik),
            "intransit": float(intransit),
            "outstanding_so": 0.0
        }
        
    for gudang_id, jenis_pupuk, outstanding in do_data:
        if (gudang_id, jenis_pupuk) not in combos:
            combos[(gudang_id, jenis_pupuk)] = {
                "stok_fisik": 0.0,
                "intransit": 0.0,
                "outstanding_so": float(outstanding)
            }
        else:
            combos[(gudang_id, jenis_pupuk)]["outstanding_so"] = float(outstanding)
            
    # 4. Ambil semua data StockCalculation yang sudah ada untuk tanggal ini dalam satu kueri
    existing_records = db.query(StockCalculation).filter(StockCalculation.tanggal == tanggal).all()
    record_map = {(r.gudang_id, r.tipe_pupuk): r for r in existing_records}
    
    results = []
    for (gudang_id, jenis_pupuk), data in combos.items():
        stok_admin_tanpa_intransit = data["stok_fisik"] - data["outstanding_so"]
        stok_admin = stok_admin_tanpa_intransit + data["intransit"]
        
        calc_data = {
            "stok_fisik": round(data["stok_fisik"], 2),
            "outstanding_so": round(data["outstanding_so"], 2),
            "stok_admin_tanpa_intransit": round(stok_admin_tanpa_intransit, 2),
            "intransit": round(data["intransit"], 2),
            "stok_admin": round(stok_admin, 2),
        }
        
        record = record_map.get((gudang_id, jenis_pupuk))
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
                **calc_data
            )
            db.add(record)
            
        results.append({
            "gudang_id": gudang_id,
            "tipe_pupuk": jenis_pupuk,
            **calc_data
        })
        
    db.commit()
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
