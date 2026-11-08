"""
Sinkronkan master material dari CSV kategori ke JSON yang dipakai backend.

Sumber tunggal: `materialcode2.csv` di root repo (kolom STATUS PUPUK, Material,
Material Description, JENIS PUPUK). Jalankan setiap kali CSV berubah:

    python scripts/sync_material_master.py

Hasil: `app/core/data/material_master.json` -- jangan diedit manual.
"""

import csv
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "materialcode2.csv"
TARGET = Path(__file__).resolve().parents[1] / "app" / "core" / "data" / "material_master.json"

# Label kategori di CSV (huruf besar) -> label yang dipakai aplikasi.
KATEGORI = {
    "UREA": "Urea",
    "NPK": "NPK",
    "NPK KAKAO": "NPK Kakao",
    "ZA": "ZA",
    "ZK": "ZK",
    "SP-36": "SP-36",
    "SP-26": "SP-26",
    "ORGANIK": "Organik",
    "ORGANIK CAIR": "Organik Cair",
    "PHOSGREEN": "Phosgreen",
}

# Satuannya mengikuti kenyataan di SAP: pupuk cair dalam liter, sisanya ton.
SATUAN_KHUSUS = {"Organik Cair": "L"}
SATUAN_DEFAULT = "TON"

STATUS_VALID = {"SUBSIDI", "NON SUBSIDI"}


def main() -> int:
    if not CSV_PATH.exists():
        print(f"ERROR: sumber tidak ditemukan: {CSV_PATH}")
        return 1

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter=";"))

    materials = {}
    masalah = []

    for i, row in enumerate(rows, start=2):
        kode = (row.get("Material") or "").strip()
        status = (row.get("STATUS PUPUK") or "").strip()
        jenis = (row.get("JENIS PUPUK") or "").strip()
        deskripsi = (row.get("Material Description") or "").strip()

        if not kode.isdigit() or len(kode) != 7:
            masalah.append(f"baris {i}: kode tidak valid -> {kode!r}")
            continue
        if kode in materials:
            masalah.append(f"baris {i}: kode duplikat -> {kode}")
            continue
        if status not in STATUS_VALID:
            masalah.append(f"baris {i}: status tidak dikenal -> {status!r}")
            continue
        if jenis not in KATEGORI:
            masalah.append(f"baris {i}: kategori tidak dikenal -> {jenis!r}")
            continue

        kategori = KATEGORI[jenis]
        materials[kode] = {
            "kategori": kategori,
            "status": status,
            "satuan": SATUAN_KHUSUS.get(kategori, SATUAN_DEFAULT),
            "deskripsi": deskripsi,
        }

    if masalah:
        print("CSV tidak valid, tidak ada file yang ditulis:")
        for baris in masalah:
            print("  -", baris)
        return 1

    payload = {
        "sumber": CSV_PATH.name,
        "jumlah": len(materials),
        "materials": dict(sorted(materials.items())),
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    sebaran = Counter(m["kategori"] for m in materials.values())
    print(f"Ditulis {TARGET.relative_to(ROOT)}: {len(materials)} material")
    print("Kategori :", dict(sebaran.most_common()))
    print(
        "Status   :",
        dict(Counter(m["status"] for m in materials.values()).most_common()),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
