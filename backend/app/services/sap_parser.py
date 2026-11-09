"""
SAP File Parser Service
Parser disesuaikan dengan format file nyata yang diterima dari SAP:
  - MB52: kolom 'Plant', 'Material Description', 'Unrestricted', 'Stock in Transit', dst.
  - ZSD_SODO: kolom 'Kode Gudang', 'Deskripsi Material', 'Outstanding SO', 'Status SO', dst.
"""

import pandas as pd
from io import BytesIO
from datetime import date
from typing import List, Dict, Any, Optional

from app.core.material_master import (
    FALLBACK_KEYWORDS,
    grup_material,
    klasifikasi_deskripsi,
    material_info,
    normalize_material_code,
    periksa_satuan,
)


# ============================================================
# Mapping jenis pupuk
# ============================================================
# Acuan utama adalah kode material (lihat app/core/material_master.py).
# Tabel kata kunci di bawah hanya cadangan untuk kode yang belum terdaftar.
PUPUK_KEYWORDS = FALLBACK_KEYWORDS

# Satuan yang dikenal. Satuan lain dilaporkan sebagai peringatan, bukan diam-diam dianggap ton.
SATUAN_DIKENAL = {"TON", "L", "KG"}

# Singkatan satuan dari SAP (mis. ZSD memakai "TO").
SATUAN_ALIAS = {
    "TO": "TON",
    "TON": "TON",
    "L": "L",
    "LTR": "L",
    "LT": "L",
    "KG": "KG",
    "KGM": "KG",
}


def _normalisasi_satuan(raw) -> str:
    """Satuan SAP -> bentuk baku (TO -> TON, LTR -> L). Kosong bila tidak ada."""
    if raw is None:
        return ""
    nilai = str(raw).strip().upper()
    if not nilai or nilai == "NAN":
        return ""
    return SATUAN_ALIAS.get(nilai, nilai)


def _ke_ton(nilai: float, satuan: str) -> float:
    """Satuan file -> ton. Hanya KG yang perlu dikonversi (1 KG = 0,001 t)."""
    return nilai / 1000.0 if satuan == "KG" else nilai

MB52_REQUIRED_COLUMNS = {"Plant", "Material", "Material Description", "Unrestricted"}
MB52_EXPECTED_MIN_COLUMNS = 5
ZSD_REQUIRED_COLUMNS = {"Plant SO", "Deskripsi Material", "Outstanding SO"}
ZSD_EXPECTED_MIN_COLUMNS = 5


def classify_pupuk(material_desc: str) -> str:
    """Klasifikasikan jenis pupuk dari deskripsi material (cadangan saja)."""
    return klasifikasi_deskripsi(material_desc)


def klasifikasi_material(material_code, material_desc: str) -> str:
    """Klasifikasi jenis pupuk: kode material lebih dulu, deskripsi sebagai cadangan."""
    info = material_info(material_code)
    if info:
        return info["kategori"]
    return klasifikasi_deskripsi(material_desc)


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
def parse_mb52(
    file_bytes: bytes,
    tanggal: date,
    warning_sink: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Parse file MB52 dari SAP.

    Kolom yang digunakan (sesuai format file nyata):
      - Plant                  → kode_plant (contoh: 'B006')
      - Material               → material_code (acuan klasifikasi jenis pupuk)
      - Material Description   → material_desc, cadangan bila kode belum terdaftar
      - Storage Location       → storage_location
      - Unrestricted           → stok fisik (unrestricted)
      - Stock in Transit       → intransit (opsional)
      - Base Unit of Measure   → satuan; dibandingkan dengan master material

    `warning_sink` (opsional) akan diisi pesan bila satuan di file berbeda dari
    master atau tidak dikenal. Upload tetap berjalan; pengguna diberi tahu.
    """
    df = _read_excel_and_normalize(file_bytes)
    actual_cols = df.columns.tolist()

    _validate_columns(actual_cols, MB52_REQUIRED_COLUMNS, MB52_EXPECTED_MIN_COLUMNS, "MB52")

    peringatan: List[str] = []
    satuan_tak_dikenal = set()
    diabaikan = {}
    diabaikan_satuan = 0
    dikonversi_kg = 0

    results = []
    for _, row in df.iterrows():
        plant_val = str(row.get("Plant", "")).strip()
        if not plant_val or plant_val.lower() == "nan":
            continue

        material_code = normalize_material_code(row.get("Material", ""))
        material_desc = str(row.get("Material Description", "")).strip()
        sloc = str(row.get("Storage Location", "")).strip()
        satuan = _normalisasi_satuan(row.get("Base Unit of Measure"))

        if satuan and satuan not in SATUAN_DIKENAL:
            # Satuan listrik (KWH), volume (M3/NM3), atau satuan lain tidak
            # boleh dicampur ke stok berton.
            satuan_tak_dikenal.add(satuan)
            diabaikan_satuan += 1
            continue

        jenis_pupuk = grup_material(material_code, material_desc)
        if jenis_pupuk is None:
            kunci = material_desc or material_code or "(tanpa nama)"
            diabaikan[kunci] = diabaikan.get(kunci, 0) + 1
            continue

        if satuan:
            pesan = periksa_satuan(material_code, satuan)
            if pesan and pesan not in peringatan:
                peringatan.append(pesan)

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

        # Transit and Transfer (opsional) - dipakai peta keterisian gudang
        transit_transfer_raw = row.get("Transit and Transfer", 0)
        try:
            transit_transfer = (
                float(transit_transfer_raw) if pd.notna(transit_transfer_raw) else 0.0
            )
        except (ValueError, TypeError):
            transit_transfer = 0.0

        # Satuan file menentukan konversi. KG wajib dibagi 1.000 agar tidak
        # tercatat sebagai ton (1.000 KG tidak boleh menjadi 1.000 ton).
        if satuan == "KG":
            dikonversi_kg += 1
        unrestricted = _ke_ton(unrestricted, satuan)
        intransit = _ke_ton(intransit, satuan)
        transit_transfer = _ke_ton(transit_transfer, satuan)

        results.append({
            "tanggal": tanggal,
            "kode_plant": plant_val,
            "jenis_pupuk": jenis_pupuk,
            "material_code": material_code if material_code.lower() != "nan" else None,
            "material_desc": material_desc if material_desc.lower() != "nan" else None,
            "storage_location": sloc if sloc.lower() != "nan" else None,
            "unrestricted": unrestricted,
            "intransit": intransit,
            "transit_transfer": transit_transfer,
        })

    if diabaikan:
        total = sum(diabaikan.values())
        contoh = ", ".join(
            str(nama)
            for nama, _ in sorted(diabaikan.items(), key=lambda item: -item[1])[:3]
        )
        peringatan.append(
            f"{total} baris diabaikan karena bukan material pupuk (mis. {contoh})."
        )
    if diabaikan_satuan:
        peringatan.append(
            f"{diabaikan_satuan} baris diabaikan karena satuannya tidak bisa dihitung "
            f"sebagai ton ({', '.join(sorted(satuan_tak_dikenal))})."
        )
    if dikonversi_kg:
        peringatan.append(
            f"{dikonversi_kg} baris bersatuan KG dikonversi ke ton (dibagi 1.000)."
        )
    if warning_sink is not None:
        warning_sink.extend(peringatan)

    return results


# ============================================================
# ZSD_SODO Parser
# ============================================================
def parse_zsd_sodo(
    file_bytes: bytes,
    tanggal: date,
    warning_sink: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Parse file ZSD_SODO (SO Outstanding) dari SAP.

    Kolom yang digunakan (sesuai format file nyata):
      - Plant SO               → kode_plant (sama dengan kolom Plant di MB52, contoh: 'F203')
      - Nomor Material         → acuan klasifikasi jenis pupuk dan disimpan
                                 sebagai ``material_code`` (bisa NULL pada data lama)
      - Deskripsi Material     → cadangan klasifikasi
      - Nomor Sales Order      → nomor_so
      - Outstanding SO         → outstanding_qty (qty yang belum terpenuhi)
      - Status SO              → status_so
      - Quantity SO            → qty order awal (opsional)
    """
    df = _read_excel_and_normalize(file_bytes)
    actual_cols = df.columns.tolist()

    _validate_columns(actual_cols, ZSD_REQUIRED_COLUMNS, ZSD_EXPECTED_MIN_COLUMNS, "ZSD_SODO")

    peringatan: List[str] = []
    diabaikan = {}
    dikonversi_kg = 0

    results = []
    for _, row in df.iterrows():
        kode_gudang = str(row.get("Plant SO", "")).strip()
        if not kode_gudang or kode_gudang.lower() == "nan":
            continue

        material_code = normalize_material_code(row.get("Nomor Material", ""))
        material_desc = str(row.get("Deskripsi Material", "")).strip()
        nomor_so = str(row.get("Nomor Sales Order", "")).strip()
        status_so = str(row.get("Status SO", "")).strip()

        jenis_pupuk = grup_material(material_code, material_desc)
        if jenis_pupuk is None:
            kunci = material_desc or material_code or "(tanpa nama)"
            diabaikan[kunci] = diabaikan.get(kunci, 0) + 1
            continue

        satuan = _normalisasi_satuan(row.get("Unit of Measure"))
        if material_code and material_code.lower() != "nan":
            pesan = periksa_satuan(material_code, satuan)
            if pesan and pesan not in peringatan:
                peringatan.append(pesan)

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

        if satuan == "KG":
            dikonversi_kg += 1
        outstanding_qty = _ke_ton(outstanding_qty, satuan)
        qty_so = _ke_ton(qty_so, satuan)

        results.append({
            "tanggal": tanggal,
            "kode_plant": kode_gudang,
            "jenis_pupuk": jenis_pupuk,
            "material_code": material_code or None,
            "nomor_so": nomor_so if nomor_so.lower() != "nan" else None,
            "outstanding_qty": outstanding_qty,
            "status_so": status_so if status_so.lower() != "nan" else None,
        })

    if diabaikan:
        total = sum(diabaikan.values())
        contoh = ", ".join(
            str(nama)
            for nama, _ in sorted(diabaikan.items(), key=lambda item: -item[1])[:3]
        )
        peringatan.append(
            f"{total} baris SO diabaikan karena bukan material pupuk (mis. {contoh})."
        )
    if dikonversi_kg:
        peringatan.append(
            f"{dikonversi_kg} baris SO bersatuan KG dikonversi ke ton (dibagi 1.000)."
        )
    if warning_sink is not None:
        warning_sink.extend(peringatan)

    return results
