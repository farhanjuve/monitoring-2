"""
INDIGO Report Parser Service
Mempersiapkan data untuk laporan realisasi penggunaan aplikasi INDIGO Truck Tracker.

Laporan disusun dengan cara:
  - Report SAP (ZMMR22)  = ACUAN / populasi seluruh Delivery Order (DO).
  - Report Indigo        = sumber data realisasi (apakah DO dipantau lewat aplikasi).
  - DO yang ada di SAP tetapi tidak ditemukan di Indigo dianggap "tidak menjalankan aplikasi".

Matching dilakukan berdasarkan nomor DO (no_do). Periode dideteksi dari Tgl. GI
pada report SAP (bulan yang paling dominan), dapat di-override manual.
"""

import io
import re
from collections import Counter
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import openpyxl

# ── Konstantan kolom SAP ZMMR22 ─────────────────────────────────────────────
_SAP_HEADER = [
    "Source.Name", "Sourch", "No. PO STO", "Tgl. PO STO", "Kode Plant Asal",
    "Plant Asal", "Kode Plant Tujuan", "Plant Tujuan", "Ekspeditur", "Item PO",
    "Kode Produk.", "Produk", "Qty. PO STO", "Total Delivery Cost", "UoM",
    "Realisasi Cost", "Currency Delivery Cost", "Currency Realisasi Cost",
    "Kode Provinsi Asal", "Provinsi Asal", "Kabupaten Asal", "Provinsi Tujuan",
    "Kabupaten Tujuan", "Delivery Date", "Kode Kabupaten Asal",
    "Kode Provinsi Tujuan", "Kode Kabupaten Tujuan", "Tgl Lapor DPCS",
    "Lapor DPCS", "Kode Ekspeditur", "Kode Alat Angkut", "Alat Angkut",
    "Tgl. GI", "No. DO",
]


def _to_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _serial_to_date(v: Any) -> Optional[date]:
    if isinstance(v, datetime):
        return v.date() if v.hour or v.minute or v.second else v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, (int, float)):
        try:
            return (datetime(1899, 12, 30) + _num_to_timedelta(v)).date()
        except Exception:
            return None
    return None


def _num_to_timedelta(v: float):
    from datetime import timedelta
    return timedelta(days=int(v))


def _normalize_do(no_do: Any) -> str:
    """Normalisasi nomor DO agar konsisten antar file."""
    if no_do is None:
        return ""
    if isinstance(no_do, float) and no_do.is_integer():
        return str(int(no_do))
    s = str(no_do).strip()
    return re.sub(r"\.0$", "", s)


def _find_header(ws, required: List[str]) -> Optional[Dict[str, int]]:
    """Scan beberapa baris pertama untuk menemukan baris header yang berisi semua kolom wajib."""
    for row_idx, cells in enumerate(ws.iter_rows(values_only=True), start=1):
        if row_idx > 15:
            break
        cell_map = {}
        for col_idx, val in enumerate(cells, start=1):
            if val and str(val).strip():
                cell_map[str(val).strip()] = col_idx
        if all(req in cell_map for req in required):
            return cell_map
    return None


def _read_rows(ws, header_map: Dict[str, int]):
    """Iterasi baris setelah header (baris pertama di-skip sebagai header)."""
    max_col = max(header_map.values())
    first = True
    for cells in ws.iter_rows(values_only=True):
        if first:
            first = False
            continue
        vals = list(cells)
        if len(vals) < max_col:
            continue
        yield {
            key: vals[col_idx - 1]
            for key, col_idx in header_map.items()
        }


def parse_sap_report(file_obj: Any) -> Dict[str, Any]:
    """
    Parse file report SAP (ZMMR22 .xlsx).
    Return dict:
      {
        "unique_do": {no_do: {plant_asal, plant_tujuan, ekspeditur, provinsi_asal,
                              kabupaten_asal, provinsi_tujuan, kabupaten_tujuan,
                              material, tgl_gi, item_po}},
        "do_count": int,
        "periode": "YYYY-MM" (dari Tgl. GI paling dominan),
        "sap_source": str,
      }
    """
    wb = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
    ws = wb.active

    header_map = _find_header(ws, ["No. DO", "Tgl. GI"])
    if not header_map:
        wb.close()
        raise ValueError("Kolom 'No. DO' / 'Tgl. GI' tidak ditemukan di report SAP.")

    def get(name, default=None):
        return header_map.get(name, header_map.get(_SAP_HEADER.index(name) if name in _SAP_HEADER else 0, default))

    # Simpel lookup: header_map keyed by exact header name
    sap_source = _to_str(ws.cell(row=2, column=1).value or ws.cell(row=1, column=1).value)

    unique_do: Dict[str, Dict[str, Any]] = {}
    months: Counter = Counter()

    for row in _read_rows(ws, header_map):
        no_do_raw = row.get("No. DO")
        no_do = _normalize_do(no_do_raw)
        if not no_do:
            continue

        tgl_gi = _serial_to_date(row.get("Tgl. GI"))
        if tgl_gi:
            months[f"{tgl_gi.year:04d}-{tgl_gi.month:02d}"] += 1

        if no_do in unique_do:
            # Pertahankan record pertama; pastikan tgl_gi terkunci jika belum ada
            existing = unique_do[no_do]
            if existing["tgl_gi"] is None and tgl_gi:
                existing["tgl_gi"] = tgl_gi
            continue

        unique_do[no_do] = {
            "no_do": no_do,
            "plant_asal": _to_str(row.get("Plant Asal")),
            "plant_tujuan": _to_str(row.get("Plant Tujuan")),
            "ekspeditur": _to_str(row.get("Ekspeditur")),
            "provinsi_asal": _to_str(row.get("Provinsi Asal")),
            "kabupaten_asal": _to_str(row.get("Kabupaten Asal")),
            "provinsi_tujuan": _to_str(row.get("Provinsi Tujuan")),
            "kabupaten_tujuan": _to_str(row.get("Kabupaten Tujuan")),
            "material": _to_str(row.get("Produk")),
            "tgl_gi": tgl_gi,
        }

    wb.close()

    periode = months.most_common(1)[0][0] if months else None
    return {
        "unique_do": unique_do,
        "do_count": len(unique_do),
        "periode": periode,
        "sap_source": sap_source,
    }


def parse_indigo_report(file_obj: Any) -> Dict[str, Any]:
    """
    Parse file report Indigo (.xlsx) — dua sheet: 'Indigo Tracking' & 'Delivery Orders'.
    Return dict:
      {
        "indigo_do": Set[str],        # gabungan no DO dari kedua sheet
        "do_count": int,
        "tracking_count": int,
        "delivery_count": int,
      }
    """
    wb = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
    indigo_do: Set[str] = set()
    tracking_count = 0
    delivery_count = 0

    # Sheet 1: Indigo Tracking (kolom no_do)
    if "Indigo Tracking" in wb.sheetnames:
        ws = wb["Indigo Tracking"]
        header = _find_header(ws, ["no_do"])
        if header:
            for row in _read_rows(ws, header):
                no_do = _normalize_do(row.get("no_do"))
                if no_do:
                    indigo_do.add(no_do)
                    tracking_count += 1

    # Sheet 2: Delivery Orders (kolom nodo)
    if "Delivery Orders" in wb.sheetnames:
        ws = wb["Delivery Orders"]
        header = _find_header(ws, ["nodo"])
        if header:
            for row in _read_rows(ws, header):
                no_do = _normalize_do(row.get("nodo"))
                if no_do:
                    indigo_do.add(no_do)
                    delivery_count += 1

    wb.close()
    return {
        "indigo_do": indigo_do,
        "do_count": len(indigo_do),
        "tracking_count": tracking_count,
        "delivery_count": delivery_count,
    }


def build_report_records(
    sap_parsed: Dict[str, Any],
    indigo_parsed: Dict[str, Any],
    periode_override: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], int, int, float]:
    """
    Gabungkan hasil parse SAP & Indigo menjadi daftar record DO untuk disimpan.
    Return: (records, matched_count, sap_total, realization_pct)
    """
    unique_do = sap_parsed["unique_do"]
    sap_total = len(unique_do)
    indigo_do = indigo_parsed["indigo_do"]
    periode = periode_override or sap_parsed["periode"]

    records: List[Dict[str, Any]] = []
    matched_count = 0

    for do, attrs in unique_do.items():
        is_matched = do in indigo_do
        if is_matched:
            matched_count += 1
        records.append({
            "no_do": do,
            "plant_asal": attrs["plant_asal"],
            "plant_tujuan": attrs["plant_tujuan"],
            "ekspeditur": attrs["ekspeditur"],
            "provinsi_asal": attrs["provinsi_asal"],
            "kabupaten_asal": attrs["kabupaten_asal"],
            "provinsi_tujuan": attrs["provinsi_tujuan"],
            "kabupaten_tujuan": attrs["kabupaten_tujuan"],
            "material": attrs["material"],
            "tgl_gi": attrs["tgl_gi"],
            "is_matched": is_matched,
        })

    realization_pct = (matched_count / sap_total * 100) if sap_total else 0.0
    return records, matched_count, sap_total, realization_pct