from app.core.database import SessionLocal
from app.services.stock_calculator import recalculate_all_for_date
from app.models.models import SAPStock

db = SessionLocal()
dates = db.query(SAPStock.tanggal).distinct().all()
print(f"Ditemukan {len(dates)} tanggal unik untuk dihitung ulang...")

for (dt,) in dates:
    print(f"Menghitung ulang untuk tanggal {dt}...")
    recalculate_all_for_date(db, dt)
    print(f"Selesai untuk tanggal {dt}")

print("Selesai semua.")
