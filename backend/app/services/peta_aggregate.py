"""Agregasi dashboard peta kabupaten.

Satu mesin hitung untuk KPI, peta, ranking, tooltip, dan Stok Pabrik. Modul ini
sengaja tidak menyentuh FastAPI: fungsi ``aggregate_peta`` menerima data yang
sudah dinormalisasi sehingga bisa diuji tanpa database.

Aturan angka yang dipakai (disepakati dengan laporan Excel):

- Kapasitas adalah kapasitas fisik gudang, dijumlahkan sekali per gudang dari
  seluruh kode plant-nya. Nilai ini tidak berubah karena filter produk.
- Stok fisik = jumlah ``unrestricted`` material terpilih.
- Intransit = jumlah ``intransit`` material terpilih.
- Total stok = stok fisik + intransit.
- Stok admin = stok fisik - outstanding SO + intransit.
- Sisa ruang resmi = kapasitas - stok admin. Varian fisik dan total disediakan
  terpisah agar formula spec tidak mengubah angka laporan.
- Rasio memakai pecahan 0..1 (bukan persen). Kapasitas 0 -> ``None``.
- Pupuk cair (satuan liter) tidak pernah dicampur ke total ton.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

from app.core.material_master import (
    KATEGORI_LAIN,
    deskripsi_reject,
    klasifikasi_deskripsi,
    material_info,
)
from app.core.plant_directory import plant_category

SATUAN_TON = "TON"
SUBSIDI_SEMUA = "SEMUA"
DEFAULT_THRESHOLDS = (70.0, 90.0, 100.0)

RATIO_KEYS = {
    "keterisian_fisik": "keterisian_fisik",
    "keterisian_total": "keterisian_total",
    "keterisian_admin": "keterisian_admin",
}


def normalize_subsidi(value: str | None) -> str:
    """Rapikan pilihan subsidi: SEMUA / SUBSIDI / NON_SUBSIDI."""
    teks = (value or SUBSIDI_SEMUA).strip().upper().replace("-", "_")
    if teks in ("NON_SUBSIDI", "NONSUBSIDI", "NON SUBSIDI"):
        return "NON_SUBSIDI"
    if teks == "SUBSIDI":
        return "SUBSIDI"
    return SUBSIDI_SEMUA


def normalize_key(value: str | None) -> str:
    return " ".join((value or "").strip().upper().split())


@dataclass(frozen=True)
class StockLine:
    """Satu baris MB52 yang sudah diklasifikasi."""

    kategori: str
    status: str | None
    satuan: str
    fisik: float
    intransit: float
    transit_transfer: float = 0.0


@dataclass(frozen=True)
class SoLine:
    """Satu baris Outstanding SO yang sudah diklasifikasi."""

    jenis_pupuk: str
    kategori: str
    status: str | None
    material_code: str | None
    qty: float


@dataclass
class GudangData:
    id: int
    nama: str
    provinsi: str
    kota: str
    kode_kab: int | None
    kapasitas: float
    plants: tuple[str, ...]
    anper: frozenset[str]
    is_active: bool = True
    is_national_included: bool = True
    stock: list[StockLine] = field(default_factory=list)
    so: list[SoLine] = field(default_factory=list)
    has_stock_rows: bool = False


@dataclass(frozen=True)
class PlantStock:
    """Stok pada kode plant yang tidak terpetakan ke gudang mana pun."""

    kode_plant: str
    kategori: str
    status: str | None
    satuan: str
    fisik: float
    intransit: float
    is_fertilizer: bool


@dataclass(frozen=True)
class FilterPeta:
    produk: frozenset[str] = frozenset()
    subsidi: str = SUBSIDI_SEMUA
    anper: frozenset[str] = frozenset()
    lini: frozenset[str] = frozenset()
    provinsi: str | None = None
    kabupaten: str | None = None
    gudang_id: int | None = None
    indikator: str = "keterisian_admin"
    thresholds: tuple[float, float, float] = DEFAULT_THRESHOLDS


def classify_material(
    material_code: str | None,
    material_desc: str = "",
) -> tuple[str, str | None, str, bool]:
    """Kembalikan (kategori, status, satuan, apakah pupuk).

    Kode yang ada di master dipakai apa adanya. Kode asing diklasifikasi dari
    deskripsi; statusnya ``None`` karena tidak bisa dipastikan.
    """
    info = material_info(material_code) if material_code else None
    if info:
        return info["kategori"], info["status"], info["satuan"], True

    kategori = klasifikasi_deskripsi(material_desc)
    deskripsi = str(material_desc or "").lower()
    satuan = "L" if ("cair" in deskripsi or "liquid" in deskripsi) else SATUAN_TON
    reject = deskripsi_reject(material_desc)
    pupuk = kategori != KATEGORI_LAIN or reject
    # Stok reject tidak punya kode master, tetapi tetap menempati kapasitas.
    # Laporan lama memasukkannya sebagai Non Subsidi; pertahankan agar konsisten.
    return kategori, ("NON SUBSIDI" if reject else None), satuan, pupuk


def keterisian_status(
    ratio: float | None,
    thresholds: Sequence[float] = DEFAULT_THRESHOLDS,
) -> str:
    """Status warna dari rasio 0..1. Ambang dalam persen."""
    if ratio is None:
        return "na"
    lega, waspada, kritis = thresholds
    persen = ratio * 100
    if persen <= lega:
        return "ok"
    if persen <= waspada:
        return "warn"
    if persen <= kritis:
        return "low"
    return "full"


def _stock_matches(line: StockLine, filt: FilterPeta) -> bool:
    if line.satuan != SATUAN_TON:
        return False
    if filt.produk and line.kategori not in filt.produk:
        return False
    if filt.subsidi == "SUBSIDI":
        return line.status == "SUBSIDI"
    if filt.subsidi == "NON_SUBSIDI":
        return line.status == "NON SUBSIDI"
    return True


def _so_attribution(so: SoLine, filt: FilterPeta) -> tuple[bool, bool]:
    """Kembalikan (ikut dihitung, bisa dialokasikan).

    Baris SO lama tidak menyimpan ``material_code``. Bila filter hanya memilih
    satu status subsidi di dalam grup Urea/NPK, SO tidak bisa dipisah dan
    ditandai tidak lengkap -- jangan menebak.
    """
    punya_status = bool(so.material_code) and so.status is not None
    if punya_status:
        if filt.produk and so.kategori not in filt.produk:
            return False, True
        if filt.subsidi == "SUBSIDI":
            return so.status == "SUBSIDI", True
        if filt.subsidi == "NON_SUBSIDI":
            return so.status == "NON SUBSIDI", True
        return True, True

    # Fallback level grup (jenis_pupuk).
    if filt.produk and so.jenis_pupuk not in filt.produk:
        return False, True
    if filt.subsidi == SUBSIDI_SEMUA:
        return True, True
    return False, False


def _aggregate(
    kapasitas: float,
    stock: Iterable[StockLine],
    so: Iterable[SoLine],
    has_stock_rows: bool,
    filt: FilterPeta,
) -> dict:
    selected = [line for line in stock if _stock_matches(line, filt)]
    fisik = sum(line.fisik for line in selected)
    intransit = sum(line.intransit for line in selected)
    transit = sum(line.transit_transfer for line in selected)
    total = fisik + intransit
    # Produk yang benar-benar ada di node ini setelah filter aktif. Dipakai
    # drawer gudang agar user tahu isi gudang tanpa menebak dari nama gudang.
    produk = sorted(
        {
            line.kategori
            for line in selected
            if line.kategori and line.kategori != KATEGORI_LAIN
        }
    )

    so_total = 0.0
    so_lengkap = True
    for baris in so:
        ikut, bisa = _so_attribution(baris, filt)
        if not bisa:
            so_lengkap = False
        elif ikut:
            so_total += baris.qty
    outstanding = so_total if so_lengkap else None
    admin = (fisik - so_total + intransit) if so_lengkap else None

    ada_kapasitas = kapasitas > 0
    rasio_fisik = (fisik / kapasitas) if ada_kapasitas else None
    rasio_total = (total / kapasitas) if ada_kapasitas else None
    rasio_admin = (admin / kapasitas) if ada_kapasitas and admin is not None else None

    sisa_admin = (kapasitas - admin) if ada_kapasitas and admin is not None else None
    sisa_fisik = (kapasitas - fisik) if ada_kapasitas else None
    sisa_total = (kapasitas - total) if ada_kapasitas else None

    indikator = filt.indikator if filt.indikator in {
        "keterisian_fisik",
        "keterisian_total",
        "keterisian_admin",
        "kapasitas_tersisa",
        "stok_fisik",
        "outstanding_so",
    } else "keterisian_admin"
    nilai_indikator = {
        "keterisian_fisik": rasio_fisik,
        "keterisian_total": rasio_total,
        "keterisian_admin": rasio_admin,
        "kapasitas_tersisa": sisa_admin,
        "stok_fisik": fisik,
        "outstanding_so": outstanding,
    }[indikator]

    # Untuk indikator persentase, warna mengikuti rasio yang dipilih. Untuk
    # indikator ton, frontend memakai skala min-max; ``status`` di sini hanya
    # cadangan berbasis rasio admin.
    rasio_indikator = {
        "keterisian_fisik": rasio_fisik,
        "keterisian_total": rasio_total,
        "keterisian_admin": rasio_admin,
    }.get(indikator)
    if not selected:
        status = "none"
        status_indikator = "none" if rasio_indikator is not None else None
    elif not ada_kapasitas:
        status = "na"
        status_indikator = "na"
    elif rasio_admin is None:
        status = "na"
        status_indikator = "na" if rasio_indikator is None else keterisian_status(
            rasio_indikator, filt.thresholds
        )
    else:
        status = keterisian_status(rasio_admin, filt.thresholds)
        status_indikator = (
            keterisian_status(rasio_indikator, filt.thresholds)
            if rasio_indikator is not None
            else None
        )

    return {
        "kapasitas": round(kapasitas, 2),
        "stok_fisik": round(fisik, 2),
        "intransit": round(intransit, 2),
        "transit_transfer": round(transit, 2),
        "total_stok": round(total, 2),
        "outstanding_so": None if outstanding is None else round(outstanding, 2),
        "stok_admin": None if admin is None else round(admin, 2),
        "sisa_ruang": None if sisa_admin is None else round(sisa_admin, 2),
        "sisa_ruang_fisik": None if sisa_fisik is None else round(sisa_fisik, 2),
        "sisa_ruang_total": None if sisa_total is None else round(sisa_total, 2),
        "keterisian_fisik": None if rasio_fisik is None else round(rasio_fisik, 6),
        "keterisian_total": None if rasio_total is None else round(rasio_total, 6),
        "keterisian_admin": None if rasio_admin is None else round(rasio_admin, 6),
        "indikator": indikator,
        "nilai_indikator": None if nilai_indikator is None else round(nilai_indikator, 6),
        "produk": produk,
        "status": status,
        "status_indikator": status_indikator,
        "has_data": bool(selected),
        "has_stock_rows": has_stock_rows,
        "so_lengkap": so_lengkap,
    }


def _in_scope(gudang: GudangData, filt: FilterPeta) -> bool:
    if not (gudang.is_active and gudang.is_national_included):
        return False
    if filt.gudang_id is not None and gudang.id != filt.gudang_id:
        return False
    if filt.provinsi and normalize_key(gudang.provinsi) != normalize_key(filt.provinsi):
        return False
    if filt.kabupaten and normalize_key(gudang.kota) != normalize_key(filt.kabupaten):
        return False
    if filt.anper and not (gudang.anper & filt.anper):
        return False
    return True


def _node(
    *,
    key: str,
    nama: str,
    provinsi: str | None = None,
    kota: str | None = None,
    gudang_id: int | None = None,
    gudang_count: int = 1,
    plants: Sequence[str] = (),
    anper: Iterable[str] = (),
    kapasitas: float = 0.0,
    stock: Iterable[StockLine] = (),
    so: Iterable[SoLine] = (),
    has_stock_rows: bool = False,
    filt: FilterPeta,
) -> dict:
    metrik = _aggregate(kapasitas, stock, so, has_stock_rows, filt)
    return {
        "key": key,
        "nama": nama,
        "provinsi": provinsi,
        "kota": kota,
        "gudang_id": gudang_id,
        "gudang_count": gudang_count,
        "plants": list(plants),
        "anper": sorted(anper),
        **metrik,
    }


def _ranking(nodes: Sequence[dict], filt: FilterPeta, top: int = 10) -> dict:
    rasio_key = RATIO_KEYS.get(filt.indikator, "keterisian_admin")
    if filt.indikator in ("keterisian_fisik", "stok_fisik"):
        sisa_key = "sisa_ruang_fisik"
    elif filt.indikator == "keterisian_total":
        sisa_key = "sisa_ruang_total"
    else:
        sisa_key = "sisa_ruang"

    level = "gudang" if nodes and nodes[0]["gudang_id"] is not None else "kabupaten"

    # Ranking berbasis stok admin tidak boleh mencampur wilayah yang SO-nya
    # lengkap dengan wilayah yang tidak. Bila filter subsidi memotong SO lama,
    # kosongkan ranking dan beri alasan; jangan menampilkan angka setengah benar.
    butuh_admin = rasio_key == "keterisian_admin" or sisa_key == "sisa_ruang"
    if butuh_admin and any(
        node["has_data"] and not node["so_lengkap"] for node in nodes
    ):
        return {
            "level": level,
            "penuh": [],
            "kosong": [],
            "tersedia": False,
            "alasan": (
                "Ranking berbasis Stok Admin belum tersedia karena Outstanding SO "
                "lama belum bisa dipisah per status subsidi."
            ),
        }

    penuh = [
        node
        for node in nodes
        if node["has_data"] and node["kapasitas"] > 0 and node[rasio_key] is not None
    ]
    penuh.sort(key=lambda node: node[rasio_key], reverse=True)

    kosong = [
        node
        for node in nodes
        if node["has_data"] and node[sisa_key] is not None
    ]
    kosong.sort(key=lambda node: node[sisa_key], reverse=True)

    def ringkas(node: dict, nilai_key: str) -> dict:
        return {
            "key": node["key"],
            "nama": node["nama"],
            "provinsi": node["provinsi"],
            "kota": node["kota"],
            "gudang_id": node["gudang_id"],
            "nilai": node[nilai_key],
            "keterisian_admin": node["keterisian_admin"],
            "kapasitas": node["kapasitas"],
            "stok_admin": node["stok_admin"],
            "sisa_ruang": node["sisa_ruang"],
        }

    return {
        "level": level,
        "penuh": [ringkas(node, rasio_key) for node in penuh[:top]],
        "kosong": [ringkas(node, sisa_key) for node in kosong[:top]],
        "tersedia": True,
        "alasan": None,
    }


def _pabrik(
    plant_stocks: Sequence[PlantStock],
    filt: FilterPeta,
) -> dict:
    buckets = {
        "pabrik": {"fisik": 0.0, "intransit": 0.0, "plants": set()},
        "pelabuhan": {"fisik": 0.0, "intransit": 0.0, "plants": set()},
        "kantor": {"fisik": 0.0, "intransit": 0.0, "plants": set()},
        "belum_terpetakan": {"fisik": 0.0, "intransit": 0.0, "plants": set()},
    }
    for line in plant_stocks:
        if line.satuan != SATUAN_TON or not line.is_fertilizer:
            continue
        if not _stock_matches(
            StockLine(line.kategori, line.status, line.satuan, line.fisik, line.intransit),
            filt,
        ):
            continue
        kategori = plant_category(line.kode_plant)
        if kategori == "gudang":
            kategori = "belum_terpetakan"
        bucket = buckets[kategori]
        bucket["fisik"] += line.fisik
        bucket["intransit"] += line.intransit
        bucket["plants"].add(line.kode_plant)

    total_fisik = sum(b["fisik"] for b in buckets.values())
    total_plant = sum(len(b["plants"]) for b in buckets.values())
    hasil = {}
    for nama, bucket in buckets.items():
        hasil[nama] = {
            "fisik": round(bucket["fisik"], 2),
            "intransit": round(bucket["intransit"], 2),
            "total_stok": round(bucket["fisik"] + bucket["intransit"], 2),
            "plant": len(bucket["plants"]),
            "kontribusi": round(bucket["fisik"] / total_fisik, 6) if total_fisik else None,
        }
    hasil["total"] = {
        "fisik": round(total_fisik, 2),
        "intransit": round(sum(b["intransit"] for b in buckets.values()), 2),
        "total_stok": round(
            sum(b["fisik"] + b["intransit"] for b in buckets.values()), 2
        ),
        "plant": total_plant,
    }
    return hasil


def aggregate_peta(
    gudangs: Sequence[GudangData],
    plant_stocks: Sequence[PlantStock],
    filt: FilterPeta,
    *,
    produk_tersedia: Sequence[str] = (),
    anper_tersedia: Sequence[str] = (),
) -> dict:
    """Hitung seluruh respons dashboard dari data yang sudah dimuat."""
    scoped = [gudang for gudang in gudangs if _in_scope(gudang, filt)]

    gudang_nodes = [
        _node(
            key=f"gudang:{gudang.id}",
            nama=gudang.nama,
            provinsi=gudang.provinsi,
            kota=gudang.kota,
            gudang_id=gudang.id,
            plants=gudang.plants,
            anper=gudang.anper,
            kapasitas=gudang.kapasitas,
            stock=gudang.stock,
            so=gudang.so,
            has_stock_rows=gudang.has_stock_rows,
            filt=filt,
        )
        for gudang in scoped
    ]

    def group_nodes(key_func, label: str) -> list[dict]:
        buckets: dict[str, list[GudangData]] = {}
        for gudang in scoped:
            buckets.setdefault(key_func(gudang), []).append(gudang)
        hasil = []
        for key, anggota in buckets.items():
            pertama = anggota[0]
            hasil.append(
                _node(
                    key=key,
                    nama=pertama.provinsi if label == "provinsi" else pertama.kota,
                    provinsi=pertama.provinsi,
                    kota=None if label == "provinsi" else pertama.kota,
                    gudang_count=len(anggota),
                    plants=tuple(p for g in anggota for p in g.plants),
                    anper={a for g in anggota for a in g.anper},
                    kapasitas=sum(g.kapasitas for g in anggota),
                    stock=[line for g in anggota for line in g.stock],
                    so=[line for g in anggota for line in g.so],
                    has_stock_rows=any(g.has_stock_rows for g in anggota),
                    filt=filt,
                )
            )
        hasil.sort(key=lambda node: node["nama"].lower())
        return hasil

    provinsi_nodes = group_nodes(
        lambda gudang: f"provinsi:{normalize_key(gudang.provinsi)}", "provinsi"
    )
    kabupaten_nodes = group_nodes(
        lambda gudang: f"kabupaten:{normalize_key(gudang.provinsi)}:{normalize_key(gudang.kota)}",
        "kabupaten",
    )

    if filt.gudang_id is not None:
        nama_scope = scoped[0].nama if scoped else "Gudang"
    elif filt.kabupaten:
        nama_scope = filt.kabupaten
    elif filt.provinsi:
        nama_scope = filt.provinsi
    else:
        nama_scope = "Nasional"

    kpi = _node(
        key="nasional" if not (filt.provinsi or filt.kabupaten or filt.gudang_id) else "scope",
        nama=nama_scope,
        gudang_count=len(scoped),
        plants=tuple(p for g in scoped for p in g.plants),
        anper={a for g in scoped for a in g.anper},
        kapasitas=sum(g.kapasitas for g in scoped),
        stock=[line for g in scoped for line in g.stock],
        so=[line for g in scoped for line in g.so],
        has_stock_rows=any(g.has_stock_rows for g in scoped),
        filt=filt,
    )

    level_ranking = gudang_nodes if (filt.kabupaten or filt.gudang_id) else kabupaten_nodes
    ranking = _ranking(level_ranking, filt)

    pabrik = _pabrik(plant_stocks, filt)
    total_gudang = kpi["stok_fisik"] + kpi["intransit"]
    total_nasional = (
        total_gudang
        + pabrik["total"]["fisik"]
        + pabrik["total"]["intransit"]
    )
    for nama, bucket in pabrik.items():
        if not isinstance(bucket, dict):
            continue
        bucket["kontribusi"] = (
            round(bucket["total_stok"] / total_nasional, 6) if total_nasional else None
        )
    pabrik["kontribusi_nasional"] = (
        round(pabrik["total"]["total_stok"] / total_nasional, 6)
        if total_nasional
        else None
    )
    pabrik["total_nasional_stok"] = round(total_nasional, 2)

    warnings: list[str] = []
    if filt.lini:
        warnings.append(
            "Filter Lini II/III belum tersedia karena tidak ada sumber data lini di sistem."
        )
    if filt.subsidi != SUBSIDI_SEMUA and kpi["outstanding_so"] is None:
        warnings.append(
            "Outstanding SO belum bisa dipisah per status subsidi pada data lama "
            "(material_code kosong). Unggah ulang file ZSD_SODO agar angka Stok Admin akurat."
        )
    if filt.anper and not anper_tersedia:
        warnings.append(
            "Data Anper belum diimpor. Jalankan scripts/import_anper.py agar filter Anper berfungsi."
        )

    return {
        "filters": {
            "produk": sorted(filt.produk),
            "subsidi": filt.subsidi,
            "anper": sorted(filt.anper),
            "lini": sorted(filt.lini),
            "provinsi": filt.provinsi,
            "kabupaten": filt.kabupaten,
            "gudang_id": filt.gudang_id,
            "indikator": filt.indikator,
            "thresholds": list(filt.thresholds),
        },
        "kpi": kpi,
        "levels": {
            "provinsi": provinsi_nodes,
            "kabupaten": kabupaten_nodes,
            "gudang": gudang_nodes,
        },
        "ranking": ranking,
        "pabrik": pabrik,
        "meta": {
            "gudang_scope": len(scoped),
            "gudang_tanpa_kapasitas": sum(1 for g in scoped if g.kapasitas <= 0),
            "gudang_tanpa_stok": sum(1 for g in scoped if not g.has_stock_rows),
            "liter_dikecualikan": round(
                sum(
                    line.fisik
                    for gudang in scoped
                    for line in gudang.stock
                    if line.satuan != SATUAN_TON
                ),
                2,
            ),
            "produk_tersedia": list(produk_tersedia),
            "anper_tersedia": list(anper_tersedia),
            "lini_tersedia": [],
            "sumber": "MB52 (sap_stock) + ZSD_SODO + plant_capacity + warehouse_anper",
            "kapasitas_basis": "kapasitas fisik gudang, dihitung sekali per gudang",
            "satuan": "ton",
            "pabrik_scope": "nasional",
            "so_lengkap": kpi["so_lengkap"],
            "warnings": warnings,
        },
    }


def load_peta_data(db, tanggal) -> tuple[list[GudangData], list[PlantStock], list[str], list[str]]:
    """Muat dan normalisasi data satu tanggal dari database.

    Mengembalikan (gudang, stok_plant_tanpa_gudang, produk_tersedia, anper_tersedia).
    """
    from app.core.kapasitas import load_kapasitas
    from app.models.models import (
        SAPOutstandingDO,
        SAPStock,
        Warehouse,
        WarehouseAnper,
        WarehousePlant,
    )

    plants = db.query(WarehousePlant).all()
    plants_by_gid: dict[int, list[str]] = {}
    plant_gid: dict[str, int] = {}
    for plant in plants:
        plants_by_gid.setdefault(plant.gudang_id, []).append(plant.kode_plant)
        plant_gid[plant.kode_plant] = plant.gudang_id

    kapasitas = load_kapasitas(db)
    anper_by_gid: dict[int, set[str]] = {}
    for baris in db.query(WarehouseAnper).all():
        anper_by_gid.setdefault(baris.gudang_id, set()).add(baris.anper)

    gudang_by_id: dict[int, GudangData] = {}
    for gudang in db.query(Warehouse).all():
        kode_plants = tuple(plants_by_gid.get(gudang.id, ()))
        gudang_by_id[gudang.id] = GudangData(
            id=gudang.id,
            nama=gudang.nama_gudang or "",
            provinsi=gudang.provinsi or "",
            kota=gudang.kota or "",
            kode_kab=gudang.kode_kab,
            kapasitas=sum(float(kapasitas.get(kode, 0.0)) for kode in kode_plants),
            plants=kode_plants,
            anper=frozenset(anper_by_gid.get(gudang.id, ())),
            is_active=bool(gudang.is_active),
            is_national_included=bool(gudang.is_national_included),
        )

    produk: set[str] = set()
    plant_stocks: list[PlantStock] = []
    for baris in db.query(SAPStock).filter(SAPStock.tanggal == tanggal).all():
        kategori, status, satuan, pupuk = classify_material(
            baris.material_code, baris.material_desc or ""
        )
        produk.add(kategori)
        gid = plant_gid.get(baris.kode_plant)
        gudang = gudang_by_id.get(gid) if gid is not None else None
        if gudang is None:
            plant_stocks.append(
                PlantStock(
                    kode_plant=baris.kode_plant,
                    kategori=kategori,
                    status=status,
                    satuan=satuan,
                    fisik=float(baris.unrestricted or 0.0),
                    intransit=float(baris.intransit or 0.0),
                    is_fertilizer=pupuk,
                )
            )
            continue
        gudang.stock.append(
            StockLine(
                kategori=kategori,
                status=status,
                satuan=satuan,
                fisik=float(baris.unrestricted or 0.0),
                intransit=float(baris.intransit or 0.0),
                transit_transfer=float(baris.transit_transfer or 0.0),
            )
        )
        gudang.has_stock_rows = True

    for baris in db.query(SAPOutstandingDO).filter(SAPOutstandingDO.tanggal == tanggal).all():
        gid = plant_gid.get(baris.kode_plant)
        gudang = gudang_by_id.get(gid) if gid is not None else None
        if gudang is None:
            continue
        info = material_info(baris.material_code) if baris.material_code else None
        kategori = info["kategori"] if info else baris.jenis_pupuk
        status = info["status"] if info else None
        gudang.so.append(
            SoLine(
                jenis_pupuk=baris.jenis_pupuk,
                kategori=kategori,
                status=status,
                material_code=baris.material_code,
                qty=float(baris.outstanding_qty or 0.0),
            )
        )

    anper_tersedia = sorted(
        {anper for daftar in anper_by_gid.values() for anper in daftar}
    )
    return list(gudang_by_id.values()), plant_stocks, sorted(produk), anper_tersedia
