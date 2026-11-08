"""Master material: kode material -> kategori, status subsidi, dan satuan.

Sumber data `app/core/data/material_master.json`, dihasilkan dari
`materialcode2.csv` lewat `scripts/sync_material_master.py`. File JSON itu
jangan diedit manual.

Kode material dipakai sebagai acuan utama klasifikasi karena kode stabil,
sedangkan deskripsi material berubah-ubah. Deskripsi hanya dipakai sebagai
cadangan untuk kode yang belum terdaftar di master.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

_TARGET = Path(__file__).resolve().parent / "data" / "material_master.json"

# Pembanding deskripsi untuk material yang belum ada di master.
FALLBACK_KEYWORDS = {
    "Urea": ["urea", "nitrea", "nitralite"],
    "NPK": ["npk", "phonska", "15-15-15", "15-10-12", "16-16-16"],
    "ZA": ["za ", " za", "ammonium sulfate", "amonium", "zwavelzure"],
    "SP-36": ["sp-36", "sp36", "sp 36", "superphosphat"],
    "SP-26": ["sp-26", "sp 26", "sp26"],
    "Organik": ["organik", "organic", "pupuk hayati", "petroganik"],
    "Organik Cair": ["organik cair", "liquid org", "poc"],
}

KATEGORI_LAIN = "Lainnya"

GRUP_NON_SUBSIDI = "Non Subsidi"
GRUP_CAIR = "Organik Cair"

# Urutan kolom/filter: kategori bersubsidi dulu, produk non subsidi paling akhir.
GRUP_URUTAN = [
    "Urea",
    "NPK",
    "NPK Kakao",
    "ZA",
    "SP-36",
    "Organik",
    "Organik Cair",
    GRUP_NON_SUBSIDI,
    "SP-26",
    "Phosgreen",
    "ZK",
    KATEGORI_LAIN,
]


@lru_cache(maxsize=1)
def load_material_master() -> Dict[str, dict]:
    """Baca seluruh master material (kode -> info)."""
    with _TARGET.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload["materials"]


def normalize_material_code(raw) -> str:
    """Rapikan kode material: buang spasi dan ekor `.0` hasil pembacaan pandas."""
    if raw is None:
        return ""
    kode = str(raw).strip()
    if kode.endswith(".0"):
        kode = kode[:-2]
    return kode


def material_info(code) -> Optional[dict]:
    """Info master untuk satu kode material, atau None bila belum terdaftar."""
    return load_material_master().get(normalize_material_code(code))


def grup_tampilan(kategori: str, satuan: str = "TON", status: str = "") -> str:
    """Tentukan grup tampilan dari kategori, satuan, dan status.

    Aturan (disepakati): satuan cair selalu dipisah lebih dulu agar liter tidak
    pernah tercampur ke total ton; setelah itu produk non subsidi digabung.
    """
    if satuan == "L":
        return GRUP_CAIR
    if status == "NON SUBSIDI":
        return GRUP_NON_SUBSIDI
    return kategori


def grup_untuk_kode(code) -> Optional[str]:
    info = material_info(code)
    if not info:
        return None
    return grup_tampilan(info["kategori"], info["satuan"], info["status"])


def grup_material(code, material_desc: str = "") -> Optional[str]:
    """Grup tampilan untuk satu baris SAP, atau None bila bukan material pupuk.

    Urutan keputusan:
    1. kode terdaftar di master -> grup sesuai kategori/status/satuan;
    2. deskripsi mengandung "reject" -> ikut dihitung sebagai Non Subsidi
       (stok reject tetap menempati kapasitas gudang walau tidak dijual);
    3. selain itu -> None, artinya baris diabaikan (listrik, steam, air,
       bahan baku, suku cadang, dan material non-pupuk lain).

    Grup ini yang disimpan sebagai `jenis_pupuk`/`tipe_pupuk`, karena tabel
    kalkulasi stok hanya menyimpan satu nilai per gudang. Rincian per material
    tetap tersimpan di `sap_stock.material_code`.
    """
    info = material_info(code)
    if info:
        return grup_tampilan(info["kategori"], info["satuan"], info["status"])
    if deskripsi_reject(material_desc):
        return GRUP_NON_SUBSIDI
    return None


def deskripsi_reject(material_desc: str) -> bool:
    """True bila deskripsi material menandakan stok reject/gagal produksi."""
    return "reject" in str(material_desc or "").lower()


def grup_untuk_kategori(kategori: str) -> str:
    """Grup tampilan untuk nilai `tipe_pupuk` yang tersimpan di database.

    Nilai di database adalah kategori (mis. 'Urea'), kecuali material yang
    sudah dikelompokkan sebelumnya. Nama grup tetap dikembalikan apa adanya.
    """
    if kategori in GRUP_URUTAN:
        return kategori
    if kategori in ("Organik Cair",):
        return GRUP_CAIR
    return kategori


def satuan_grup(grup: str) -> str:
    """Satuan angka pada satu grup tampilan."""
    return "L" if grup == GRUP_CAIR else "TON"


def urutan_grup(grup: str) -> int:
    try:
        return GRUP_URUTAN.index(grup)
    except ValueError:
        return len(GRUP_URUTAN)


def kelompokkan_grup(nama_grup) -> list:
    """Urutkan daftar grup sesuai urutan baku, sisanya di belakang (abjad)."""
    unik = set(nama_grup)
    dikenal = [g for g in GRUP_URUTAN if g in unik]
    asing = sorted(unik - set(dikenal))
    return dikenal + asing


def klasifikasi_deskripsi(material_desc: str) -> str:
    """Cadangan: klasifikasi dari deskripsi untuk kode yang belum terdaftar."""
    if not material_desc or str(material_desc).strip().lower() in ("nan", ""):
        return KATEGORI_LAIN
    desc_lower = str(material_desc).lower()
    for kategori, keywords in FALLBACK_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in desc_lower:
                return kategori
    return KATEGORI_LAIN


def periksa_satuan(code, satuan_aktual) -> Optional[str]:
    """Bandingkan satuan file SAP dengan master. Kembalikan pesan peringatan bila beda."""
    info = material_info(code)
    if not info:
        return None
    aktual = (satuan_aktual or "").strip().upper()
    if not aktual or aktual == "NAN":
        return None
    if aktual != info["satuan"]:
        return (
            f"Kode {normalize_material_code(code)} tercatat {info['satuan']} di master, "
            f"tetapi file SAP berisi {aktual}."
        )
    return None
