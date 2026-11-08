"""Penentuan gudang yang masuk perhitungan keterisian nasional.

Perhitungan nasional hanya ingin memuat stok di daerah, bukan stok di pabrik,
pelabuhan, atau kantor. Klasifikasi plant sudah tersedia di
``app.core.plant_directory``; modul ini menambahkan pola kode yang dipakai
operasional untuk mengenali gudang lini/pabrik dan gudang pelabuhan:

- kode plant dengan angka berakhiran ``101`` (mis. B101, D101) dianggap
  gudang lini/pabrik;
- kode plant dengan tiga angka berawalan ``7`` (mis. B701, D703) dianggap
  gudang pelabuhan.

Nilai ini hanya dipakai sebagai *rekomendasi awal*. Keputusan akhir tetap
disimpan per gudang pada kolom ``warehouses.is_national_included`` sehingga
pengguna bisa mencentang/membatalkan lewat halaman Lingkup Nasional.
"""

from __future__ import annotations

import re
from typing import Iterable, List

from app.core.plant_directory import plant_category


def _numeric_part(code: str) -> str:
    return "".join(ch for ch in (code or "") if ch.isdigit())


def _is_lini_101(code: str) -> bool:
    return _numeric_part(code).endswith("101")


def _is_pelabuhan_7xx(code: str) -> bool:
    angka = _numeric_part(code)
    return len(angka) == 3 and angka.startswith("7")


def _normalisasi(kode_plants: Iterable[str]) -> List[str]:
    return [
        str(kode).strip().upper()
        for kode in (kode_plants or [])
        if str(kode or "").strip()
    ]


def exclusion_reasons(kode_plants: Iterable[str]) -> List[str]:
    """Alasan sebuah gudang sebaiknya tidak masuk perhitungan nasional.

    Mengembalikan daftar kosong bila gudang dianggap gudang daerah biasa.
    """
    alasan: List[str] = []
    for kode in _normalisasi(kode_plants):
        kategori = plant_category(kode)
        if kategori == "pabrik":
            alasan.append(f"{kode}: plant pabrik")
        elif kategori == "pelabuhan":
            alasan.append(f"{kode}: plant pelabuhan")
        elif kategori == "kantor":
            alasan.append(f"{kode}: plant kantor")
        elif _is_lini_101(kode):
            alasan.append(f"{kode}: kode 101 (lini/pabrik)")
        elif _is_pelabuhan_7xx(kode):
            alasan.append(f"{kode}: kode 7xx (pelabuhan)")
    return alasan


def default_included(kode_plants: Iterable[str]) -> bool:
    """Rekomendasi awal: masuk perhitungan bila tidak ada alasan eksklusi."""
    return not exclusion_reasons(kode_plants)


def kategori_tampilan(kode_plants: Iterable[str]) -> str:
    """Label ringkas untuk badge di UI: pabrik/pelabuhan/kantor/lini pabrik/gudang."""
    kode_list = _normalisasi(kode_plants)
    kategori_plant = {plant_category(kode) for kode in kode_list}

    if "pabrik" in kategori_plant:
        return "pabrik"
    if "pelabuhan" in kategori_plant:
        return "pelabuhan"
    if "kantor" in kategori_plant:
        return "kantor"
    if any(_is_lini_101(kode) for kode in kode_list):
        return "lini pabrik"
    if any(_is_pelabuhan_7xx(kode) for kode in kode_list):
        return "pelabuhan"
    return "gudang"
