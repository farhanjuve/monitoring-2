"""
Migrasi tabel safety_stock: tambah kolom bulan & tahun, ganti unique(kode_kab) -> unique(kode_kab, bulan, tahun).

Jalankan SEKALI: tabel saat ini kosong (0 baris), jadi di-drop lalu dibuat ulang.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from app.core.database import engine
from app.models.models import Base, SafetyStock  # noqa: F401


def migrate():
    with engine.connect() as conn:
        n = conn.execute(text("SELECT COUNT(*) FROM safety_stock")).fetchone()[0]
        if n > 0:
            print(f"STOP: tabel safety_stock berisi {n} baris. Pindahkan datanya dulu.")
            return
        conn.execute(text("DROP TABLE IF EXISTS safety_stock"))
        conn.commit()
    Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables["safety_stock"]])
    print("Tabel safety_stock dibuat ulang dengan kolom bulan & tahun.", flush=True)


if __name__ == "__main__":
    migrate()