"""
SAP File Parser Service
Parser disesuaikan dengan format file nyata yang diterima dari SAP:
  - MB52: kolom 'Plant', 'Material Description', 'Unrestricted', 'Stock in Transit', dst.
  - ZSD_SODO: kolom 'Kode Gudang', 'Deskripsi Material', 'Outstanding SO', 'Status SO', dst.
"""

import pandas as pd
from io import BytesIO
from datetime import date
from typing import List, Dict, Any


# ============================================================
# Mapping jenis pupuk berdasarkan deskripsi material
# ============================================================
PUPUK_KEYWORDS = {
    "Urea": ["urea"],
    "NPK": ["npk", "phonska", "15-15-15", "15-10-12", "16-16-16"],
    "ZA": ["za ", " za", "ammonium sulfate", "amonium", "zwavelzure"],
    "SP-36": ["sp-36", "sp36", "sp 36", "superphosphat"],
    "Organik": ["organik", "organic", "pupuk hayati"],
}

MB52_REQUIRED_COLUMNS = {"Plant", "Material Description", "Unrestricted"}
MB52_EXPECTED_MIN_COLUMNS = 5
ZSD_REQUIRED_COLUMNS = {"Plant SO", "Deskripsi Material", "Outstanding SO"}
ZSD_EXPECTED_MIN_COLUMNS = 5


def classify_pupuk(material_desc: str) -> str:
    """Klasifikasikan jenis pupuk dari deskripsi material (case-insensitive)."""
    if not material_desc or str(material_desc).strip().lower() in ("nan", ""):
        return "Lainnya"
    desc_lower = str(material_desc).lower()
    for jenis, keywords in PUPUK_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in desc_lower:
                return jenis
    return "Lainnya"


def _read_excel_and_normalize(file_bytes: bytes) -> pd.DataFrame:
    try:
        df = pd.read_excel(BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"Gagal membaca file Excel: {e}")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _validate_columns(actual_cols: List[str], required: set[str], expected_min: int, file_label: str) -> None:
    missing = required - set(actual_cols)
    if missing:
        raise ValueError(
            f"Format kolom {file_label} tidak cocok. "
            f"Jumlah kolom file: {len(actual_cols)}; minimal yang diharapkan: {expected_min}. "
            f"Kolom wajib tidak ditemukan: {sorted(list(missing))}. "
            f"Kolom yang ada: {actual_cols}"
        )
    if len(actual_cols) < expected_min:
        raise ValueError(
            f"Jumlah kolom file {file_label} terlalu sedikit. "
            f"Ditemukan {len(actual_cols)} kolom, minimal {expected_min} kolom."
        )


def preview_mb52(file_bytes: bytes, tanggal: date) -> Dict[str, Any]:
    df = _read_excel_and_normalize(file_bytes)
    actual_cols = df.columns.tolist()
    _validate_columns(actual_cols, MB52_REQUIRED_COLUMNS, MB52_EXPECTED_MIN_COLUMNS, "MB52")
    rows = parse_mb52(file_bytes, tanggal)
    return {
        "valid": True,
        "file_type": "MB52",
        "column_count": len(actual_cols),
        "expected_min_column_count": MB52_EXPECTED_MIN_COLUMNS,
        "required_columns": sorted(list(MB52_REQUIRED_COLUMNS)),
        "actual_columns": actual_cols,
        "rows_parsed": len(rows),
        "sample_rows": rows[:5],
    }


def preview_zsd_sodo(file_bytes: bytes, tanggal: date) -> Dict[str, Any]:
    df = _read_excel_and_normalize(file_bytes)
    actual_cols = df.columns.tolist()
    _validate_columns(actual_cols, ZSD_REQUIRED_COLUMNS, ZSD_EXPECTED_MIN_COLUMNS, "ZSD_SODO")
    rows = parse_zsd_sodo(file_bytes, tanggal)
    return {
        "valid": True,
        "file_type": "ZSD_SODO",
        "column_count": len(actual_cols),
        "expected_min_column_count": ZSD_EXPECTED_MIN_COLUMNS,
        "required_columns": sorted(list(ZSD_REQUIRED_COLUMNS)),
        "actual_columns": actual_cols,
        "rows_parsed": len(rows),
        "sample_rows": rows[:5],
    }


# ============================================================
# MB52 Parser
# ============================================================
def parse_mb52(file_bytes: bytes, tanggal: date) -> List[Dict[str, Any]]:
    """
    Parse file MB52 dari SAP.

    Kolom yang digunakan (sesuai format file nyata):
      - Plant                  → kode_plant (contoh: 'B006')
      - Material               → material_code
      - Material Description   → material_desc, digunakan untuk klasifikasi jenis pupuk
      - Storage Location       → storage_location
      - Unrestricted           → stok fisik (unrestricted)
      - Stock in Transit       → intransit (opsional)
      - Base Unit of Measure   → satuan (opsional, untuk validasi)
    """
    df = _read_excel_and_normalize(file_bytes)
    actual_cols = df.columns.tolist()

    _validate_columns(actual_cols, MB52_REQUIRED_COLUMNS, MB52_EXPECTED_MIN_COLUMNS, "MB52")

    results = []
    for _, row in df.iterrows():
        plant_val = str(row.get("Plant", "")).strip()
        if not plant_val or plant_val.lower() == "nan":
            continue

        material_code = str(row.get("Material", "")).strip()
        material_desc = str(row.get("Material Description", "")).strip()
        sloc = str(row.get("Storage Location", "")).strip()

        # Unrestricted stock
        unrestricted_raw = row.get("Unrestricted", 0)
        try:
            unrestricted = float(unrestricted_raw) if pd.notna(unrestricted_raw) else 0.0
        except (ValueError, TypeError):
            unrestricted = 0.0

        # Stock in Transit (opsional)
        intransit_raw = row.get("Stock in Transit", 0)
        try:
            intransit = float(intransit_raw) if pd.notna(intransit_raw) else 0.0
        except (ValueError, TypeError):
            intransit = 0.0

        jenis_pupuk = classify_pupuk(material_desc)

        results.append({
            "tanggal": tanggal,
            "kode_plant": plant_val,
            "jenis_pupuk": jenis_pupuk,
            "material_code": material_code if material_code.lower() != "nan" else None,
            "material_desc": material_desc if material_desc.lower() != "nan" else None,
            "storage_location": sloc if sloc.lower() != "nan" else None,
            "unrestricted": unrestricted,
            "intransit": intransit,
        })

    return results


# ============================================================
# ZSD_SODO Parser
# ============================================================
def parse_zsd_sodo(file_bytes: bytes, tanggal: date) -> List[Dict[str, Any]]:
    """
    Parse file ZSD_SODO (SO Outstanding) dari SAP.

    Kolom yang digunakan (sesuai format file nyata):
      - Plant SO               → kode_plant (sama dengan kolom Plant di MB52, contoh: 'F203')
      - Deskripsi Material     → digunakan untuk klasifikasi jenis pupuk
      - Nomor Sales Order      → nomor_so
      - Outstanding SO         → outstanding_qty (qty yang belum terpenuhi)
      - Status SO              → status_so
      - Quantity SO            → qty order awal (opsional)
    """
    df = _read_excel_and_normalize(file_bytes)
    actual_cols = df.columns.tolist()

    _validate_columns(actual_cols, ZSD_REQUIRED_COLUMNS, ZSD_EXPECTED_MIN_COLUMNS, "ZSD_SODO")

    results = []
    for _, row in df.iterrows():
        kode_gudang = str(row.get("Plant SO", "")).strip()
        if not kode_gudang or kode_gudang.lower() == "nan":
            continue

        material_desc = str(row.get("Deskripsi Material", "")).strip()
        nomor_so = str(row.get("Nomor Sales Order", "")).strip()
        status_so = str(row.get("Status SO", "")).strip()

        # Outstanding SO qty
        outstanding_raw = row.get("Outstanding SO", 0)
        try:
            outstanding_qty = float(outstanding_raw) if pd.notna(outstanding_raw) else 0.0
        except (ValueError, TypeError):
            outstanding_qty = 0.0

        # Quantity SO awal (opsional)
        qty_so_raw = row.get("Quantity SO", 0)
        try:
            qty_so = float(qty_so_raw) if pd.notna(qty_so_raw) else 0.0
        except (ValueError, TypeError):
            qty_so = 0.0

        jenis_pupuk = classify_pupuk(material_desc)

        results.append({
            "tanggal": tanggal,
            "kode_plant": kode_gudang,
            "jenis_pupuk": jenis_pupuk,
            "nomor_so": nomor_so if nomor_so.lower() != "nan" else None,
            "outstanding_qty": outstanding_qty,
            "status_so": status_so if status_so.lower() != "nan" else None,
        })

    return results
