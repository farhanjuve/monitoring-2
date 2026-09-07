import csv
import io
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import (
    AreaGrouping,
    Photo,
    SAPOutstandingDO,
    SAPStock,
    StockCalculation,
    Warehouse,
    WarehousePlant,
)
from app.services.stock_calculator import recalculate_all_for_date

router = APIRouter()

REQUIRED_COLUMNS = {"Nama Gudang", "Kode1", "Kode2", "Kode3", "Kota", "kodekab", "Provinsi"}
PLANT_COLUMNS = ["Kode1", "Kode2", "Kode3"]


def _normalize_code(value: str | None) -> str:
    return (value or "").strip().upper()


def _resolve_kode_kab(db: Session, kota: str, provinsi: str) -> Optional[int]:
    """
    Cari kode_kab dari nama kabupaten/kota (fallback ke kombinasi kota+provinsi)
    menggunakan tabel warehouses (master gudang) sebagai referensi.
    """
    k = kota.strip().lower()
    p = provinsi.strip().lower()

    ref = (
        db.query(Warehouse)
        .filter(func.lower(func.trim(Warehouse.kota)) == k)
        .first()
    )
    if ref:
        return ref.kode_kab

    ref = (
        db.query(Warehouse)
        .filter(
            func.lower(func.trim(Warehouse.kota)) == k,
            func.lower(func.trim(Warehouse.provinsi)) == p,
        )
        .first()
    )
    if ref:
        return ref.kode_kab

    return None


def _parse_kode_kab(value: str, row_number: int) -> int:
    raw = value.strip()
    if not raw:
        raise ValueError(f"Baris {row_number}: kolom kodekab wajib diisi.")
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Baris {row_number}: kodekab '{raw}' harus berupa angka.") from exc


def _parse_master_csv(text: str) -> List[Dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    headers = set(reader.fieldnames or [])
    missing_columns = sorted(REQUIRED_COLUMNS - headers)
    if missing_columns:
        raise ValueError(f"Kolom wajib tidak ditemukan: {', '.join(missing_columns)}.")

    grouped: Dict[Tuple[str, str, int, str], Dict[str, Any]] = {}
    seen_plants: Dict[str, str] = {}

    for row_number, row in enumerate(reader, start=2):
        nama = (row.get("Nama Gudang") or "").strip()
        kota = (row.get("Kota") or "").strip()
        provinsi = (row.get("Provinsi") or "").strip()

        if not nama:
            raise ValueError(f"Baris {row_number}: Nama Gudang wajib diisi.")
        if not kota:
            raise ValueError(f"Baris {row_number}: Kota wajib diisi.")
        if not provinsi:
            raise ValueError(f"Baris {row_number}: Provinsi wajib diisi.")

        kode_kab = _parse_kode_kab(row.get("kodekab") or "", row_number)
        plants = [_normalize_code(row.get(key)) for key in PLANT_COLUMNS]
        plants = [code for code in plants if code]
        if not plants:
            raise ValueError(f"Baris {row_number}: minimal salah satu Kode1/Kode2/Kode3 wajib diisi.")

        for code in plants:
            if len(code) > 10:
                raise ValueError(f"Baris {row_number}: kode plant '{code}' maksimal 10 karakter.")
            if code in seen_plants:
                raise ValueError(
                    f"Kode plant '{code}' duplikat di CSV: {seen_plants[code]} dan baris {row_number}."
                )
            seen_plants[code] = f"baris {row_number}"

        key = (nama, kota, kode_kab, provinsi)
        if key not in grouped:
            grouped[key] = {
                "nama_gudang": nama,
                "kota": kota,
                "kode_kab": kode_kab,
                "provinsi": provinsi,
                "plants": [],
            }
        grouped[key]["plants"].extend(plants)

    if not grouped:
        raise ValueError("File CSV tidak berisi data gudang yang valid.")

    return list(grouped.values())


def _relation_score(db: Session, warehouse_id: int) -> int:
    photo_count = db.query(func.count(Photo.id)).filter(Photo.gudang_id == warehouse_id).scalar() or 0
    stock_count = db.query(func.count(StockCalculation.id)).filter(StockCalculation.gudang_id == warehouse_id).scalar() or 0
    area_count = db.query(func.count(AreaGrouping.id)).filter(AreaGrouping.gudang_id == warehouse_id).scalar() or 0
    plant_count = db.query(func.count(WarehousePlant.id)).filter(WarehousePlant.gudang_id == warehouse_id).scalar() or 0
    return int(photo_count) + int(stock_count) + int(area_count) + int(plant_count)


def _choose_survivor(db: Session, candidates: List[Warehouse]) -> Warehouse:
    return sorted(candidates, key=lambda w: (-_relation_score(db, w.id), w.id))[0]


def _stock_dates_for_warehouses(db: Session, warehouse_ids: Set[int]) -> Set[Any]:
    if not warehouse_ids:
        return set()
    return {
        row[0]
        for row in db.query(StockCalculation.tanggal)
        .filter(StockCalculation.gudang_id.in_(warehouse_ids))
        .distinct()
        .all()
    }


def _move_area_grouping(db: Session, source_id: int, survivor_id: int) -> None:
    rows = db.query(AreaGrouping).filter(AreaGrouping.gudang_id == source_id).all()
    for row in rows:
        duplicate = (
            db.query(AreaGrouping)
            .filter(
                AreaGrouping.gudang_id == survivor_id,
                AreaGrouping.kode_kab == row.kode_kab,
                AreaGrouping.id != row.id,
            )
            .first()
        )
        if duplicate:
            db.delete(row)
        else:
            row.gudang_id = survivor_id


def _merge_warehouse_relations(db: Session, source_id: int, survivor_id: int) -> None:
    db.query(Photo).filter(Photo.gudang_id == source_id).update(
        {Photo.gudang_id: survivor_id}, synchronize_session=False
    )
    db.query(WarehousePlant).filter(WarehousePlant.gudang_id == source_id).update(
        {WarehousePlant.gudang_id: survivor_id}, synchronize_session=False
    )
    _move_area_grouping(db, source_id, survivor_id)


@router.post("/upload")
async def upload_master_gudang(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload file CSV Master Data Gudang dengan strategi upsert/merge.
    Warehouse lama tidak dihapus agar foto dan stok historis tetap aman.
    """
    fname = (file.filename or "").lower()
    if not fname.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File harus berformat .csv")

    try:
        content = await file.read()
        text = content.decode("utf-8-sig")
        records = _parse_master_csv(text)
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File CSV harus memakai encoding UTF-8.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created_count = 0
    updated_count = 0
    merged_count = 0
    plant_count = 0
    deactivated_count = 0
    merge_details: List[str] = []
    affected_dates: Set[Any] = set()
    affected_warehouse_ids: Set[int] = set()
    target_plants = {code for record in records for code in record["plants"]}

    try:
        for record in records:
            plant_rows = (
                db.query(WarehousePlant)
                .filter(WarehousePlant.kode_plant.in_(record["plants"]))
                .all()
            )
            candidates_by_id = {
                row.warehouse.id: row.warehouse for row in plant_rows if row.warehouse is not None
            }

            exact_match = (
                db.query(Warehouse)
                .filter(
                    Warehouse.nama_gudang == record["nama_gudang"],
                    Warehouse.kode_kab == record["kode_kab"],
                    Warehouse.kota == record["kota"],
                    Warehouse.provinsi == record["provinsi"],
                )
                .first()
            )
            if exact_match:
                candidates_by_id[exact_match.id] = exact_match

            if candidates_by_id:
                survivor = _choose_survivor(db, list(candidates_by_id.values()))
                updated_count += 1
            else:
                survivor = Warehouse(
                    nama_gudang=record["nama_gudang"],
                    kota=record["kota"],
                    kode_kab=record["kode_kab"],
                    provinsi=record["provinsi"],
                    is_active=True,
                )
                db.add(survivor)
                db.flush()
                created_count += 1

            candidate_ids = set(candidates_by_id.keys())
            candidate_ids.add(survivor.id)
            affected_warehouse_ids.update(candidate_ids)
            affected_dates.update(_stock_dates_for_warehouses(db, candidate_ids))

            merged_sources = [w for w in candidates_by_id.values() if w.id != survivor.id]
            if merged_sources:
                merged_count += len(merged_sources)
                source_names = " + ".join(sorted({w.nama_gudang for w in merged_sources + [survivor]}))
                merge_details.append(f"{source_names} -> {record['nama_gudang']}")
                for source in merged_sources:
                    _merge_warehouse_relations(db, source.id, survivor.id)
                    source.is_active = False

            survivor.nama_gudang = record["nama_gudang"]
            survivor.kota = record["kota"]
            survivor.kode_kab = record["kode_kab"]
            survivor.provinsi = record["provinsi"]
            survivor.is_active = True

            for code in record["plants"]:
                plant = db.query(WarehousePlant).filter(WarehousePlant.kode_plant == code).first()
                if plant:
                    if plant.gudang_id != survivor.id:
                        affected_warehouse_ids.add(plant.gudang_id)
                        affected_dates.update(_stock_dates_for_warehouses(db, {plant.gudang_id, survivor.id}))
                    plant.gudang_id = survivor.id
                else:
                    db.add(WarehousePlant(gudang_id=survivor.id, kode_plant=code))
                plant_count += 1

        stale_plants = db.query(WarehousePlant).filter(~WarehousePlant.kode_plant.in_(target_plants)).all()
        for plant in stale_plants:
            affected_warehouse_ids.add(plant.gudang_id)
            affected_dates.update(_stock_dates_for_warehouses(db, {plant.gudang_id}))
            db.delete(plant)

        db.flush()

        warehouses = db.query(Warehouse).all()
        for warehouse in warehouses:
            has_plant = (
                db.query(WarehousePlant.id)
                .filter(WarehousePlant.gudang_id == warehouse.id)
                .first()
                is not None
            )
            if not has_plant and warehouse.is_active:
                warehouse.is_active = False
                deactivated_count += 1

        if affected_dates and affected_warehouse_ids:
            db.query(StockCalculation).filter(
                StockCalculation.tanggal.in_(affected_dates),
                StockCalculation.gudang_id.in_(affected_warehouse_ids),
            ).delete(synchronize_session=False)

        db.commit()

        for tanggal in sorted(affected_dates):
            recalculate_all_for_date(db, tanggal)

        return {
            "message": (
                "Master gudang berhasil diproses tanpa menghapus foto/stok historis. "
                f"{created_count} gudang dibuat, {updated_count} gudang diupdate, "
                f"{merged_count} gudang dimerge, {plant_count} kode plant dipetakan."
            ),
            "warehouses_count": created_count + updated_count,
            "plants_count": plant_count,
            "created_count": created_count,
            "updated_count": updated_count,
            "merged_count": merged_count,
            "deactivated_count": deactivated_count,
            "recalculated_dates": [d.isoformat() for d in sorted(affected_dates)],
            "merge_details": merge_details[:20],
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Gagal memproses file CSV: {str(e)}")


@router.get("/gudang")
def get_all_gudang(db: Session = Depends(get_db)):
    """Ambil semua data gudang aktif untuk dropdown/pilihan."""
    gudangs = db.query(Warehouse).filter(Warehouse.is_active == True).order_by(Warehouse.nama_gudang).all()
    return [
        {
            "id": g.id,
            "nama_gudang": g.nama_gudang,
            "kota": g.kota,
            "kode_plants": [p.kode_plant for p in g.plants],
        }
        for g in gudangs
    ]


@router.get("/gudang/{gudang_id}")
def get_gudang(gudang_id: int, db: Session = Depends(get_db)):
    """Ambil data gudang berdasarkan ID."""
    gudang = db.query(Warehouse).filter(Warehouse.id == gudang_id).first()
    if not gudang:
        raise HTTPException(status_code=404, detail="Gudang tidak ditemukan")

    kode_plants = [p.kode_plant for p in gudang.plants]
    return {
        "id": gudang.id,
        "nama_gudang": gudang.nama_gudang,
        "kota": gudang.kota,
        "provinsi": gudang.provinsi,
        "kode_kab": gudang.kode_kab,
        "is_active": gudang.is_active,
        "kode_plants": kode_plants,
    }


# ── CRUD Gudang ────────────────────────────────────────────────────────────

class WarehouseCreate(BaseModel):
    nama_gudang: str
    kota: str
    kode_kab: Optional[int] = None
    provinsi: str
    kode_plants: List[str] = []


class WarehouseUpdate(BaseModel):
    nama_gudang: str
    kota: str
    kode_kab: Optional[int] = None
    provinsi: str
    kode_plants: List[str] = []


class PlantUpdate(BaseModel):
    kode_plants: List[str]


@router.get("/reference")
def get_reference(db: Session = Depends(get_db)):
    """
    Referensi provinsi + kota/kabupaten beserta kode_kab dari tabel warehouses
    (master gudang), untuk dropdown form. Menggunakan data kota yang sudah ada.
    """
    rows = db.query(Warehouse.kota, Warehouse.kode_kab, Warehouse.provinsi).distinct().all()

    provinsi_map: Dict[str, Dict[str, Dict[str, Any]]] = {}

    for kota, kode_kab, provinsi in rows:
        p = (provinsi or "").strip()
        k = (kota or "").strip()
        if not p or not k:
            continue
        key = f"{p}|{k}"
        provinsi_map.setdefault(p, {})[key] = {
            "kota": k,
            "kode_kab": kode_kab,
        }

    return [
        {
            "provinsi": p,
            "kabupaten": sorted(items.values(), key=lambda x: x["kota"]),
        }
        for p, items in sorted(provinsi_map.items())
    ]


@router.get("/warehouses")
def list_warehouses(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    show_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """List semua gudang dengan pagination, search, dan opsi tampilkan inactive."""
    q = db.query(Warehouse)
    if not show_inactive:
        q = q.filter(Warehouse.is_active == True)

    if search:
        like = f"%{search}%"
        q = q.filter(
            Warehouse.nama_gudang.ilike(like)
            | Warehouse.kota.ilike(like)
            | Warehouse.provinsi.ilike(like)
        )

    total = q.count()
    warehouses = (
        q.order_by(Warehouse.nama_gudang)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for w in warehouses:
        items.append({
            "id": w.id,
            "nama_gudang": w.nama_gudang,
            "kota": w.kota,
            "kode_kab": w.kode_kab,
            "provinsi": w.provinsi,
            "is_active": w.is_active,
            "kode_plants": [p.kode_plant for p in (w.plants or [])],
            "created_at": w.created_at.isoformat() if w.created_at else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, -(-total // per_page)),
    }


@router.post("/warehouses")
def create_warehouse(req: WarehouseCreate, db: Session = Depends(get_db)):
    """Buat gudang baru + kode plant."""
    if not req.nama_gudang.strip():
        raise HTTPException(400, "Nama gudang wajib diisi.")
    if not req.kota.strip():
        raise HTTPException(400, "Kota wajib diisi.")
    if not req.provinsi.strip():
        raise HTTPException(400, "Provinsi wajib diisi.")

    plants = [_normalize_code(c) for c in req.kode_plants if c.strip()]
    for code in plants:
        existing = db.query(WarehousePlant).filter(WarehousePlant.kode_plant == code).first()
        if existing:
            raise HTTPException(400, f"Kode plant '{code}' sudah digunakan gudang lain.")

    # Autofill kode_kab dari nama kota/kabupaten jika tidak diberikan
    kode_kab = req.kode_kab
    if kode_kab is None:
        kode_kab = _resolve_kode_kab(db, req.kota, req.provinsi)
        if kode_kab is None:
            raise HTTPException(
                400,
                f"Kode kabupaten untuk kota '{req.kota}' ({req.provinsi}) tidak ditemukan di referensi. "
                "Isi kode kabupaten secara manual.",
            )

    warehouse = Warehouse(
        nama_gudang=req.nama_gudang.strip(),
        kota=req.kota.strip(),
        kode_kab=kode_kab,
        provinsi=req.provinsi.strip(),
        is_active=True,
    )
    db.add(warehouse)
    db.flush()

    for code in plants:
        db.add(WarehousePlant(gudang_id=warehouse.id, kode_plant=code))

    db.commit()
    db.refresh(warehouse)

    return {
        "id": warehouse.id,
        "nama_gudang": warehouse.nama_gudang,
        "kota": warehouse.kota,
        "kode_kab": warehouse.kode_kab,
        "provinsi": warehouse.provinsi,
        "is_active": warehouse.is_active,
        "kode_plants": plants,
    }


@router.put("/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: int, req: WarehouseUpdate, db: Session = Depends(get_db)):
    """Update data gudang + sinkronisasi kode plant."""
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(404, "Gudang tidak ditemukan.")
    if not req.nama_gudang.strip():
        raise HTTPException(400, "Nama gudang wajib diisi.")

    plants = [_normalize_code(c) for c in req.kode_plants if c.strip()]
    for code in plants:
        existing = (
            db.query(WarehousePlant)
            .filter(WarehousePlant.kode_plant == code, WarehousePlant.gudang_id != warehouse_id)
            .first()
        )
        if existing:
            raise HTTPException(400, f"Kode plant '{code}' sudah digunakan gudang lain.")

    # Autofill kode_kab dari nama kota/kabupaten jika tidak diberikan
    if req.kode_kab is None:
        resolved = _resolve_kode_kab(db, req.kota, req.provinsi)
        if resolved is None:
            raise HTTPException(
                400,
                f"Kode kabupaten untuk kota '{req.kota}' ({req.provinsi}) tidak ditemukan di referensi. "
                "Isi kode kabupaten secara manual.",
            )
        kode_kab = resolved
    else:
        kode_kab = req.kode_kab

    warehouse.nama_gudang = req.nama_gudang.strip()
    warehouse.kota = req.kota.strip()
    warehouse.kode_kab = kode_kab
    warehouse.provinsi = req.provinsi.strip()
    warehouse.is_active = True

    old_plants = {p.kode_plant: p for p in db.query(WarehousePlant).filter(WarehousePlant.gudang_id == warehouse_id).all()}
    new_plants = set(plants)

    for code in new_plants - set(old_plants.keys()):
        db.add(WarehousePlant(gudang_id=warehouse_id, kode_plant=code))
    for code in set(old_plants.keys()) - new_plants:
        db.delete(old_plants[code])

    db.commit()
    return {"id": warehouse.id, "message": "Gudang berhasil diupdate."}


@router.patch("/warehouses/{warehouse_id}/plants")
def update_plants_inline(warehouse_id: int, req: PlantUpdate, db: Session = Depends(get_db)):
    """Update hanya kode plant (untuk inline edit di tabel)."""
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(404, "Gudang tidak ditemukan.")

    plants = [_normalize_code(c) for c in req.kode_plants if c.strip()]
    for code in plants:
        existing = (
            db.query(WarehousePlant)
            .filter(WarehousePlant.kode_plant == code, WarehousePlant.gudang_id != warehouse_id)
            .first()
        )
        if existing:
            raise HTTPException(400, f"Kode plant '{code}' sudah digunakan gudang lain.")

    old_plants = {p.kode_plant: p for p in db.query(WarehousePlant).filter(WarehousePlant.gudang_id == warehouse_id).all()}
    new_plants = set(plants)

    for code in new_plants - set(old_plants.keys()):
        db.add(WarehousePlant(gudang_id=warehouse_id, kode_plant=code))
    for code in set(old_plants.keys()) - new_plants:
        db.delete(old_plants[code])

    db.commit()
    return {"id": warehouse_id, "kode_plants": plants, "message": "Kode plant berhasil diupdate."}


@router.delete("/warehouses/{warehouse_id}")
def delete_warehouse(warehouse_id: int, db: Session = Depends(get_db)):
    """Soft delete gudang (set is_active=False)."""
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(404, "Gudang tidak ditemukan.")

    warehouse.is_active = False
    db.commit()
    return {"message": f"Gudang '{warehouse.nama_gudang}' berhasil dinonaktifkan."}


@router.get("/unmapped-plants")
def get_unmapped_plants(db: Session = Depends(get_db)):
    """Mengambil daftar kode plant yang ada di data SAP (MB52 / ZSD_SODO) tapi tidak ada di Master Data Gudang."""
    mb52_plants = {r[0] for r in db.query(SAPStock.kode_plant).distinct().all()}
    zsd_plants = {r[0] for r in db.query(SAPOutstandingDO.kode_plant).distinct().all()}
    master_plants = {r[0] for r in db.query(WarehousePlant.kode_plant).all()}
    all_sap_plants = mb52_plants.union(zsd_plants)
    unmapped = sorted(list(all_sap_plants - master_plants))

    return {
        "unmapped_count": len(unmapped),
        "unmapped_plants": unmapped,
    }
