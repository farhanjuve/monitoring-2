"""Loader kapasitas gudang per kode plant untuk laporan Excel.

Sumber tunggal data kapasitas adalah `frontend/lib/kapasitas-gudang.json`
(dipakai halaman peta kabupaten/kota). Untuk deployment backend -- yang tidak
membawa folder frontend -- dipakai salinan yang dibundel di
`backend/app/core/data/kapasitas_gudang.json`.

Salinan itu dihasilkan oleh `scripts/sync_kapasitas.py`, jangan diedit manual.
Saat development, file frontend selalu menang supaya hasil Excel tidak
menyimpang dari angka yang tampil di peta.
"""

import json
from pathlib import Path
from typing import Dict

_BUNDLED = Path(__file__).resolve().parent / "data" / "kapasitas_gudang.json"
_REPO_FRONTEND = (
    Path(__file__).resolve().parents[3] / "frontend" / "lib" / "kapasitas-gudang.json"
)


def _source_path() -> Path:
    for path in (_REPO_FRONTEND, _BUNDLED):
        if path.exists():
            return path
    raise FileNotFoundError(
        "Peta kapasitas gudang tidak ditemukan. Jalankan `python scripts/sync_kapasitas.py` "
        "untuk membuat salinan backend dari file frontend."
    )


def load_kapasitas() -> Dict[str, float]:
    """Baca peta kode plant -> kapasitas (ton). Nilai kosong dianggap 0."""
    with _source_path().open(encoding="utf-8") as handle:
        raw = json.load(handle)

    result: Dict[str, float] = {}
    for kode, nilai in raw.items():
        try:
            result[kode] = float(nilai) if nilai is not None else 0.0
        except (TypeError, ValueError):
            result[kode] = 0.0
    return result
