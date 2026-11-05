"""Direktori kode plant SAP.

Memisahkan kode gudang distribusi dari kode internal perusahaan (pabrik,
pelabuhan, kantor) supaya peringatan "kode plant belum ter-mapping" hanya
memuat kode yang benar-benar perlu dipetakan ke Master Data Gudang.

Data diambil dari ``data/plant_directory.json`` yang diturunkan dari:

- kolom ``Name 1`` pada file MB52 Urea/NPK (untuk mengenali unit pabrik,
  pelabuhan, dan kantor), dan
- kolom ``Kode Plant`` pada ``Daftar_Gudang_Bersih_Per_01_Oktober_2026.csv``
  (daftar gudang resmi yang seharusnya ada di master).

Regenerate file JSON tersebut bila daftar gudang resmi atau data MB52 berubah.
Kode yang tidak dikenal diperlakukan sebagai gudang agar kode baru tidak
hilang diam-diam dari peringatan.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

_DATA_FILE = Path(__file__).resolve().parent / "data" / "plant_directory.json"

with _DATA_FILE.open(encoding="utf-8") as _f:
    _DATA = json.load(_f)

FACTORY_PLANTS: frozenset[str] = frozenset(_DATA["factory_plants"])
PORT_PLANTS: frozenset[str] = frozenset(_DATA["port_plants"])
OFFICE_PLANTS: frozenset[str] = frozenset(_DATA["office_plants"])
OFFICIAL_WAREHOUSE_PLANTS: frozenset[str] = frozenset(
    _DATA["official_warehouse_plants"]
)

PlantCategory = Literal["pabrik", "pelabuhan", "kantor", "gudang"]


def plant_category(code: str) -> PlantCategory:
    """Kembalikan kategori kode plant: pabrik / pelabuhan / kantor / gudang."""
    normalized = (code or "").strip().upper()
    if normalized in FACTORY_PLANTS:
        return "pabrik"
    if normalized in PORT_PLANTS:
        return "pelabuhan"
    if normalized in OFFICE_PLANTS:
        return "kantor"
    return "gudang"


def is_non_warehouse_plant(code: str) -> bool:
    """True bila kode plant bukan gudang distribusi (pabrik/pelabuhan/kantor)."""
    return plant_category(code) != "gudang"


def is_official_warehouse(code: str) -> bool:
    """True bila kode plant tercantum di daftar gudang resmi."""
    return (code or "").strip().upper() in OFFICIAL_WAREHOUSE_PLANTS
