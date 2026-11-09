"""Impor alokasi Anper per gudang dari daftar gudang resmi.

Sumber: ``Daftar_Gudang_Bersih_Per_01_Oktober_2026.csv`` (kolom
``Kapasitas PIM/PSP/PKC/PKG/PKT``). Setiap baris CSV adalah satu kode plant;
Anper yang punya kapasitas > 0 pada baris itu diberikan ke gudang pemilik
plant tersebut. Satu gudang boleh punya beberapa Anper.

Kapasitas Anper hanya disimpan untuk label/tooltip. Penyebut keterisian tetap
kapasitas fisik gudang (``plant_capacity``), supaya angka sama dengan laporan
Excel dan tidak terjadi double counting.

Jalankan dari folder ``backend``::

    python scripts/import_anper.py
    python scripts/import_anper.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

DEFAULT_CSV = ROOT / "Daftar_Gudang_Bersih_Per_01_Oktober_2026.csv"
ANPERS = ("PIM", "PSP", "PKC", "PKG", "PKT")


def _angka(value) -> float:
    try:
        return float(str(value or "").strip() or 0)
    except ValueError:
        return 0.0


def baca_baris(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=";"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Impor Anper gudang dari CSV.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"ERROR: file CSV tidak ditemukan: {args.csv}")
        return 1

    from app.core.database import SessionLocal
    from app.models.models import WarehouseAnper, WarehousePlant

    rows = baca_baris(args.csv)
    db = SessionLocal()
    try:
        plant_gid = {
            plant.kode_plant: plant.gudang_id
            for plant in db.query(WarehousePlant).all()
        }

        assignments: dict[tuple[int, str], float] = {}
        plant_tanpa_gudang: Counter[str] = Counter()
        baris_tanpa_anper = 0
        for row in rows:
            kode_plant = (row.get("Kode Plant") or "").strip()
            gudang_id = plant_gid.get(kode_plant)
            if gudang_id is None:
                plant_tanpa_gudang[kode_plant or "(kosong)"] += 1
                continue

            ada = False
            for anper in ANPERS:
                kapasitas = _angka(row.get(f"Kapasitas {anper} (Ton)"))
                if kapasitas <= 0:
                    continue
                ada = True
                kunci = (gudang_id, anper)
                # Beberapa baris bisa mengulang kapasitas yang sama untuk satu
                # gudang (satu gudang banyak plant). Ambil nilai terbesar,
                # jangan dijumlahkan, agar tidak double counting.
                assignments[kunci] = max(assignments.get(kunci, 0.0), kapasitas)
            if not ada:
                baris_tanpa_anper += 1

        per_anper = Counter(anper for _, anper in assignments)
        gudang_terisi = len({gudang_id for gudang_id, _ in assignments})

        print(f"Baris CSV              : {len(rows)}")
        print(f"Gudang dapat Anper     : {gudang_terisi}")
        print(f"Relasi gudang-Anper    : {len(assignments)}")
        print(f"Sebaran Anper          : {dict(sorted(per_anper.items()))}")
        print(f"Plant tanpa gudang     : {sum(plant_tanpa_gudang.values())} baris "
              f"({len(plant_tanpa_gudang)} kode)")
        print(f"Baris tanpa Anper > 0  : {baris_tanpa_anper}")
        if plant_tanpa_gudang:
            contoh = ", ".join(list(plant_tanpa_gudang)[:10])
            print(f"Contoh plant dilewati  : {contoh}")

        if args.dry_run:
            print("Dry-run: tidak ada perubahan database.")
            return 0

        db.query(WarehouseAnper).delete(synchronize_session=False)
        db.add_all(
            WarehouseAnper(
                gudang_id=gudang_id,
                anper=anper,
                kapasitas_ton=kapasitas,
            )
            for (gudang_id, anper), kapasitas in assignments.items()
        )
        db.commit()
        print("Selesai: tabel warehouse_anper diperbarui.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
