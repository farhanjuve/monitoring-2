"""Pemetaan provinsi ke wilayah kerja (Sumatera, Jawa, Bali & NT, Kalimantan, Sulamapa).

`Sulamapa` adalah nama wilayah gabungan Sulawesi-Maluku-Papua. Provinsi yang
tidak dikenal otomatis masuk ke sana, sama seperti perilaku laporan lama.
"""

PROVINCE_MAPPING = {
    # Sumatera (termasuk Lampung)
    "aceh": "Sumatera",
    "sumatera utara": "Sumatera",
    "sumatera barat": "Sumatera",
    "riau": "Sumatera",
    "kepulauan riau": "Sumatera",
    "jambi": "Sumatera",
    "bengkulu": "Sumatera",
    "sumatera selatan": "Sumatera",
    "kepulauan bangka belitung": "Sumatera",
    "bangka belitung": "Sumatera",
    "lampung": "Sumatera",

    # Jawa
    "banten": "Jawa",
    "dki jakarta": "Jawa",
    "dki": "Jawa",
    "jakarta": "Jawa",
    "jawa barat": "Jawa",
    "jawa tengah": "Jawa",
    "di yogyakarta": "Jawa",
    "yogyakarta": "Jawa",
    "jawa timur": "Jawa",

    # Bali & Nusa Tenggara
    "bali": "Bali & NT",
    "nusa tenggara barat": "Bali & NT",
    "ntb": "Bali & NT",
    "nusa tenggara timur": "Bali & NT",
    "ntt": "Bali & NT",

    # Kalimantan
    "kalimantan barat": "Kalimantan",
    "kalimantan tengah": "Kalimantan",
    "kalimantan selatan": "Kalimantan",
    "kalimantan timur": "Kalimantan",
    "kalimantan utara": "Kalimantan",
}

DEFAULT_AREA = "Sulamapa"


def get_area_for_province(province: str) -> str:
    """Kembalikan wilayah kerja untuk nama provinsi (tidak peka huruf besar/kecil)."""
    if not province:
        return DEFAULT_AREA
    prov_lower = province.strip().lower()
    for key, area in PROVINCE_MAPPING.items():
        if key in prov_lower:
            return area
    return DEFAULT_AREA
