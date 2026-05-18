import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Warehouse, WarehousePlant, SAPStock, SAPOutstandingDO

router = APIRouter()

@router.post("/upload")
async def upload_master_gudang(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload file CSV Master Data Gudang.
    """
    fname = (file.filename or "").lower()
    if not fname.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File harus berformat .csv")

    try:
        content = await file.read()
        text = content.decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(text), delimiter=';')
        
        # We will wrap this in a transaction
        db.query(WarehousePlant).delete()
        db.query(Warehouse).delete()
        db.flush()
        
        warehouse_count = 0
        plant_count = 0
        warehouses_map = {}
        inserted_plants = set()
        
        for row in reader:
            nama = row.get("Nama Gudang", "").strip()
            if not nama:
                continue
            
            if nama not in warehouses_map:
                kode_kab = row.get("kodekab", "").strip()
                try: kode_kab = int(kode_kab)
                except: kode_kab = None
                    
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
                    wp = WarehousePlant(gudang_id=w.id, kode_plant=kode)
                    db.add(wp)
                    inserted_plants.add(kode)
                    plant_count += 1
        
        db.commit()
        return {
            "message": f"Berhasil mengimpor {warehouse_count} gudang dan {plant_count} kode plant.",
            "warehouses_count": warehouse_count,
            "plants_count": plant_count
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Gagal memproses file CSV: {str(e)}")

@router.get("/gudang/{gudang_id}")
def get_gudang(gudang_id: int, db: Session = Depends(get_db)):
    """Ambil data gudang berdasarkan ID."""
    gudang = db.query(Warehouse).filter(Warehouse.id == gudang_id).first()
    if not gudang:
        raise HTTPException(status_code=404, detail="Gudang tidak ditemukan")
    
    kode_plants = [p.kode_plant for p in gudang.plants]
    return {
        "id": gudang.id,
        "nama_gudang": gudang.nama_gudang,
        "kota": gudang.kota,
        "provinsi": gudang.provinsi,
        "kode_kab": gudang.kode_kab,
        "is_active": gudang.is_active,
        "kode_plants": kode_plants
    }

@router.get("/unmapped-plants")
def get_unmapped_plants(db: Session = Depends(get_db)):
    """Mengambil daftar kode plant yang ada di data SAP (MB52 / ZSD_SODO) tapi tidak ada di Master Data Gudang."""
    # Ambil semua kode plant unik dari sap_stock
    mb52_plants = {r[0] for r in db.query(SAPStock.kode_plant).distinct().all()}
    
    # Ambil semua kode plant unik dari sap_outstanding_do
    zsd_plants = {r[0] for r in db.query(SAPOutstandingDO.kode_plant).distinct().all()}
    
    # Ambil semua kode plant dari master data warehouse_plants
    master_plants = {r[0] for r in db.query(WarehousePlant.kode_plant).all()}
    
    # Gabungkan data plant dari SAP
    all_sap_plants = mb52_plants.union(zsd_plants)
    
    # Cari yang tidak ada di master data
    unmapped = sorted(list(all_sap_plants - master_plants))
    
    return {
        "unmapped_count": len(unmapped),
        "unmapped_plants": unmapped
    }
