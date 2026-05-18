import sys
import os
import csv

# Add backend directory to sys.path to allow imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.models import Warehouse, WarehousePlant

def seed():
    csv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "csv", "gdfix1505.csv")
    
    db = SessionLocal()
    try:
        with open(csv_path, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            
            # Clear existing data
            db.query(WarehousePlant).delete()
            db.query(Warehouse).delete()
            db.commit()
            
            warehouse_count = 0
            plant_count = 0
            
            # Create a dictionary to avoid duplicate warehouse names
            warehouses_map = {}
            inserted_plants = set()
            
            for row in reader:
                nama = row.get("Nama Gudang", "").strip()
                if not nama:
                    continue
                
                if nama not in warehouses_map:
                    kode_kab = row.get("kodekab", "").strip()
                    try:
                        kode_kab = int(kode_kab)
                    except:
                        kode_kab = None
                        
                    w = Warehouse(
                        nama_gudang=nama,
                        kota=row.get("Kota", "").strip(),
                        kode_kab=kode_kab,
                        provinsi=row.get("Provinsi", "").strip(),
                        is_active=True
                    )
                    db.add(w)
                    db.flush() # To get the ID
                    warehouses_map[nama] = w
                    warehouse_count += 1
                else:
                    w = warehouses_map[nama]
                
                # Check Kode1, Kode2, Kode3
                for kode_key in ["Kode1", "Kode2", "Kode3"]:
                    kode = row.get(kode_key, "").strip()
                    if kode and kode not in inserted_plants and len(kode) <= 10:
                        # Check if plant code already exists
                        exists = db.query(WarehousePlant).filter_by(kode_plant=kode).first()
                        if not exists:
                            wp = WarehousePlant(gudang_id=w.id, kode_plant=kode)
                            db.add(wp)
                            inserted_plants.add(kode)
                            plant_count += 1
            
            db.commit()
            print(f"Berhasil! Menyimpan {warehouse_count} gudang dan {plant_count} kode plant.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
