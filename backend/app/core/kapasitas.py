"""Loader kapasitas gudang per kode plant.

Sumber utama sekarang tabel `plant_capacity` (bisa diedit lewat frontend).
File JSON di `app/core/data/kapasitas_gudang.json` dipertahankan sebagai
cadangan: dipakai saat tabel belum ada/kosong (mis. instalasi baru) dan oleh
test yang tidak menyentuh database.
"""

import json
from pathlib import Path
from typing import Dict, Optional

from sqlalchemy.exc import SQLAlchemyError

_BUNDLED = Path(__file__).resolve().parent / "data" / "kapasitas_gudang.json"


def _dari_json() -> Dict[str, float]:
    if not _BUNDLED.exists():
        raise FileNotFoundError(
            "Peta kapasitas gudang tidak ditemukan. Jalankan `python scripts/sync_kapasitas.py` "
            "untuk membuat salinan backend dari file frontend."
        )
    with _BUNDLED.open(encoding="utf-8") as handle:
        raw = json.load(handle)

    hasil: Dict[str, float] = {}
    for kode, nilai in raw.items():
        try:
            hasil[str(kode).strip()] = float(nilai) if nilai is not None else 0.0
        except (TypeError, ValueError):
            hasil[str(kode).strip()] = 0.0
    return hasil


def kapasitas_dari_database(db) -> Optional[Dict[str, float]]:
    """Baca kapasitas dari tabel `plant_capacity`.

    Mengembalikan None bila tabel belum ada atau masih kosong, supaya pemanggil
    bisa jatuh ke cadangan JSON.
    """
    from app.models.models import PlantCapacity

    try:
        rows = db.query(PlantCapacity.kode_plant, PlantCapacity.kapasitas_ton).all()
    except SQLAlchemyError:
        db.rollback()
        return None
    if not rows:
        return None
    return {str(kode).strip(): float(nilai or 0.0) for kode, nilai in rows}


def load_kapasitas(db=None) -> Dict[str, float]:
    """Peta kode plant -> kapasitas (ton).

    `db` bersifat opsional: bila diberikan, database jadi sumber utama; bila
    tidak, file JSON dipakai langsung (dipakai test).
    """
    if db is not None:
        hasil = kapasitas_dari_database(db)
        if hasil is not None:
            return hasil
    return _dari_json()
