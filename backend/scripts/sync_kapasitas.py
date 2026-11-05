"""
Sinkronkan peta kapasitas gudang dari frontend ke backend.

Sumber tunggal data kapasitas adalah `frontend/lib/kapasitas-gudang.json`
(dipakai halaman peta kabupaten). Backend tetap butuh salinan sendiri karena
di-deploy terpisah dari frontend, jadi salinan itu dihasilkan dari sini.

Jalankan setiap kali peta kapasitas berubah:

    python scripts/sync_kapasitas.py

Keluar dengan kode 0 bila sudah sinkron atau berhasil menyalin.
"""
import filecmp
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "lib" / "kapasitas-gudang.json"
TARGET = ROOT / "backend" / "app" / "core" / "data" / "kapasitas_gudang.json"


def main() -> int:
    if not SOURCE.exists():
        print(f"ERROR: sumber tidak ditemukan: {SOURCE}")
        return 1

    if TARGET.exists() and filecmp.cmp(SOURCE, TARGET, shallow=False):
        print("Peta kapasitas sudah sinkron.")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, TARGET)
    print(f"Disalin: {SOURCE.relative_to(ROOT)} -> {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
