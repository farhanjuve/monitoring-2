"""
Parse & import data safety stock dari file Excel masing-masing kabupaten.

Format input (Sheet2):
- kolom: kodekab, bulan, ton, tahun, id_produk, id_produk2, Lead Time Safety Stock
- satu baris per (kodekab, bulan, produk)

Mapping produk -> kolom safety_stock (dikonfirmasi user):
  P01 -> ss_urea, P02 -> ss_npk, P03 -> ss_organik,
  P04 -> ss_za, P05 -> ss_sp36, P54 -> ss_npk_kakao
"""
import io
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from app.models.models import SafetyStock, Warehouse

# Prefix 2 digit kodekab BPS -> provinsi
BPS_PROVINSI: Dict[int, str] = {
    11: "ACEH",
    12: "SUMATERA UTARA",
    13: "SUMATERA BARAT",
    14: "RIAU",
    15: "JAMBI",
    16: "SUMATERA SELATAN",
    17: "BENGKULU",
    18: "LAMPUNG",
    19: "KEP. BANGKA BELITUNG",
    21: "KEP. RIAU",
    31: "DKI JAKARTA",
    32: "JAWA BARAT",
    33: "JAWA TENGAH",
    34: "DI YOGYAKARTA",
    35: "JAWA TIMUR",
    36: "BANTEN",
    51: "BALI",
    52: "NUSA TENGGARA BARAT",
    53: "NUSA TENGGARA TIMUR",
    61: "KALIMANTAN BARAT",
    62: "KALIMANTAN TENGAH",
    63: "KALIMANTAN SELATAN",
    64: "KALIMANTAN TIMUR",
    65: "KALIMANTAN UTARA",
    71: "SULAWESI UTARA",
    72: "SULAWESI TENGAH",
    73: "SULAWESI SELATAN",
    74: "SULAWESI TENGGARA",
    75: "GORONTALO",
    76: "SULAWESI BARAT",
    81: "MALUKU",
    82: "MALUKU UTARA",
    91: "PAPUA",
    92: "PAPUA BARAT",
    93: "PAPUA SELATAN",
    94: "PAPUA TENGAH",
    96: "PAPUA BARAT DAYA",
}

# Produsen -> nama kolom safety_stock
KOLOM_PRODUSEN: Dict[str, str] = {
    "P01": "ss_urea",
    "P02": "ss_npk",
    "P03": "ss_organik",
    "P04": "ss_za",
    "P05": "ss_sp36",
    "P54": "ss_npk_kakao",
}


def provinsi_from_kodekab(kode_kab: int) -> str | None:
    return BPS_PROVINSI.get(kode_kab // 100)


def parse_safety_stock_excel(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Baca sheet Excel safety stock -> daftar record (kode_kab, bulan, tahun, provinsi, produk, ton)."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    if not wb.sheetnames:
        raise ValueError("File Excel kosong (tidak ada sheet).")
    ws = wb[wb.sheetnames[0]]

    headers = [str(c.value).strip().lower() if c.value else "" for c in ws[1]]

    def col(name: str) -> int:
        for i, h in enumerate(headers):
            if h == name:
                return i
        raise ValueError(f"Kolom '{name}' tidak ditemukan di sheet '{ws.title}'.")

    i_kab = col("kodekab")
    i_bulan = col("bulan")
    i_ton = col("ton")
    i_tahun = col("tahun")
    i_produk = col("id_produk2")

    records: List[Dict[str, Any]] = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        kodekab, bulan, ton = row[i_kab], row[i_bulan], row[i_ton]
        tahun, produk = row[i_tahun], row[i_produk]
        if kodekab is None:
            continue
        try:
            kode_kab_int = int(kodekab)
            bulan_int = int(bulan)
            tahun_int = int(tahun)
        except (TypeError, ValueError):
            continue
        produk_str = str(produk).strip().upper()
        if produk_str not in KOLOM_PRODUSEN:
            continue

        provinsi = provinsi_from_kodekab(kode_kab_int) or "Tidak Diketahui"
        ton_val = float(ton or 0.0)

        records.append({
            "kode_kab": kode_kab_int,
            "bulan": bulan_int,
            "tahun": tahun_int,
            "provinsi": provinsi,
            "produk": produk_str,
            "ton": ton_val,
        })
    return records


def import_safety_stock(db: Session, records: List[Dict[str, Any]]) -> Tuple[int, int]:
    """
    Simpan record safety stock ke tabel safety_stock (pivot per kabupaten/bulan/tahun).
    Hapus dulu data tahun bersangkutan supaya upload ulang tidak dobel.
    Return: (jumlah kabupaten-bulan tersimpan, total baris).
    """
    from_pivots = {}
    key_set = set()
    for r in records:
        key = (r["kode_kab"], r["bulan"], r["tahun"])
        key_set.add(key)
        agg = from_pivots.setdefault(key, {
            "kode_kab": r["kode_kab"],
            "bulan": r["bulan"],
            "tahun": r["tahun"],
            "provinsi": r["provinsi"],
            **{k: 0.0 for k in KOLOM_PRODUSEN.values()},
        })
        agg[KOLOM_PRODUSEN[r["produk"]]] += r["ton"]

    tahun_set = {r["tahun"] for r in records}
    for tahun in tahun_set:
        db.query(SafetyStock).filter(SafetyStock.tahun == tahun).delete(synchronize_session=False)

    # Nama kabupaten dari tabel gudang (referensi), supaya tersimpan utk display
    nama_kab = {
        r[0]: r[1]
        for r in db.query(Warehouse.kode_kab, Warehouse.kota)
        .filter(Warehouse.kode_kab.isnot(None))
        .all()
    }

    rows = []
    for key in sorted(key_set):
        agg = from_pivots[key]
        rows.append(SafetyStock(
            kode_kab=agg["kode_kab"],
            kabupaten=nama_kab.get(agg["kode_kab"]),
            provinsi=agg["provinsi"],
            bulan=agg["bulan"],
            tahun=agg["tahun"],
            ss_urea=round(agg["ss_urea"], 2),
            ss_npk=round(agg["ss_npk"], 2),
            ss_npk_kakao=round(agg["ss_npk_kakao"], 2),
            ss_za=round(agg["ss_za"], 2),
            ss_sp36=round(agg["ss_sp36"], 2),
            ss_organik=round(agg["ss_organik"], 2),
        ))
    db.bulk_save_objects(rows)
    return len(rows), len(rows)