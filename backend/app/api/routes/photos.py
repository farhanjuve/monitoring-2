import uuid
import os
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
import boto3
from botocore.exceptions import ClientError
from typing import List

from app.core.database import get_db
from app.core.config import settings
from app.models.models import Photo, Warehouse, WarehousePlant

router = APIRouter()
LOCAL_STORAGE_DIR = os.path.join(os.getcwd(), "storage", "mock-storage")

def get_s3_client():
    if not settings.R2_ACCOUNT_ID or not settings.R2_ACCESS_KEY_ID:
        return None
    
    endpoint_url = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    return boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto"
    )

def save_locally(upload_file: UploadFile, key: str) -> str:
    local_path = os.path.join(LOCAL_STORAGE_DIR, key)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    upload_file.file.seek(0)
    with open(local_path, "wb") as f:
        f.write(upload_file.file.read())
    upload_file.file.seek(0)
    return f"/mock-storage/{key}"

@router.post("/upload")
async def upload_photo(
    gudang_id: int = Form(...),
    tanggal: str = Form(...),
    kamera_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload foto CCTV ke Cloudflare R2 dan simpan URL ke database.
    kamera_id biasanya 'CCTV Pintu Depan' atau 'CCTV Dalam Area Stok'.
    """
    gudang = db.query(Warehouse).filter(Warehouse.id == gudang_id).first()
    if not gudang:
        raise HTTPException(status_code=404, detail="Gudang tidak ditemukan")

    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["jpg", "jpeg", "png"]:
        raise HTTPException(status_code=400, detail="Hanya file jpg, jpeg, dan png yang diperbolehkan.")

    # Tentukan feed_number berdasarkan kamera_id
    feed_number = 1 if "depan" in kamera_id.lower() or kamera_id == "1" else 2

    s3_client = get_s3_client()
    
    # Buat nama file unik
    unique_filename = f"gudang_{gudang_id}/{tanggal}/feed_{feed_number}_{uuid.uuid4().hex[:8]}.{file_ext}"

    if s3_client:
        try:
            # Upload ke R2
            s3_client.upload_fileobj(
                file.file,
                settings.R2_BUCKET_NAME,
                unique_filename,
                ExtraArgs={"ContentType": file.content_type}
            )
            
            # Buat URL public (jika ada domain) atau presigned URL
            if settings.R2_PUBLIC_URL:
                file_url = f"{settings.R2_PUBLIC_URL}/{unique_filename}"
            else:
                file_url = f"https://{settings.R2_BUCKET_NAME}.{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{unique_filename}"
        except ClientError as e:
            raise HTTPException(status_code=500, detail=f"Gagal mengunggah ke R2: {str(e)}")
    else:
        # Simpan lokal bila R2 belum dikonfigurasi.
        file_url = save_locally(file, unique_filename)

    # Hitung file_size_kb
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    file_size_kb = file_size_bytes // 1024

    # Cek apakah foto untuk kamera & tanggal yang sama sudah ada
    # Jika ya, kita update (replace)
    existing_photo = db.query(Photo).filter(
        Photo.gudang_id == gudang_id,
        Photo.tanggal == tanggal,
        Photo.feed_number == feed_number
    ).first()

    if existing_photo:
        existing_photo.filename = file.filename
        existing_photo.r2_key = unique_filename
        existing_photo.r2_url = file_url
        existing_photo.file_size_kb = file_size_kb
        existing_photo.uploaded_at = datetime.now()
        photo_record = existing_photo
    else:
        photo_record = Photo(
            gudang_id=gudang_id,
            tanggal=tanggal,
            filename=file.filename,
            r2_key=unique_filename,
            r2_url=file_url,
            feed_number=feed_number,
            file_size_kb=file_size_kb,
            uploaded_at=datetime.now()
        )
        db.add(photo_record)
    
    db.commit()
    db.refresh(photo_record)

    return {
        "message": "Foto berhasil diunggah",
        "id": photo_record.id,
        "url": file_url
    }

@router.get("/gudang/{gudang_id}")
def get_photos(gudang_id: int, tanggal: str | None = None, db: Session = Depends(get_db)):
    """Ambil daftar foto untuk suatu gudang. Bisa difilter per tanggal."""
    query = db.query(Photo).filter(Photo.gudang_id == gudang_id)
    if tanggal:
        query = query.filter(Photo.tanggal == tanggal)
    
    # Ambil 10 teratas per tanggal
    photos = query.order_by(Photo.uploaded_at.desc()).limit(10).all()
    
    return [
        {
            "id": p.id,
            "tanggal": str(p.tanggal),
            "waktu_jepret": p.uploaded_at.isoformat() if p.uploaded_at else datetime.now().isoformat(),
            "kamera_id": "CCTV Pintu Depan" if p.feed_number == 1 else "CCTV Dalam Area Stok",
            "url": p.r2_url
        }
        for p in photos
    ]

@router.get("/gallery")
def get_gallery(tanggal: str | None = None, db: Session = Depends(get_db)):
    """Ambil galeri grouped per gudang, default untuk tanggal hari ini."""
    selected_date = tanggal or datetime.now().strftime("%Y-%m-%d")
    photos = db.query(Photo).filter(Photo.tanggal == selected_date).order_by(Photo.gudang_id.asc(), Photo.feed_number.asc(), Photo.uploaded_at.desc()).all()

    grouped: dict[int, dict] = {}
    for p in photos:
        if p.gudang_id not in grouped:
            gudang = db.query(Warehouse).filter(Warehouse.id == p.gudang_id).first()
            if not gudang:
                continue
            grouped[p.gudang_id] = {
                "gudang_id": gudang.id,
                "gudang": f"{gudang.nama_gudang} - {gudang.kota}",
                "date": str(p.tanggal),
                "photos": {}
            }

        # Ambil foto terbaru per feed.
        if p.feed_number not in grouped[p.gudang_id]["photos"]:
            grouped[p.gudang_id]["photos"][p.feed_number] = p.r2_url

    return [
        {
            "gudang_id": item["gudang_id"],
            "gudang": item["gudang"],
            "date": item["date"],
            "photos": [item["photos"][k] for k in sorted(item["photos"].keys())]
        }
        for item in grouped.values()
        if item["photos"]
    ]

@router.post("/bulk-upload")
async def bulk_upload_photos(
    files: List[UploadFile] = File(...),
    default_tanggal: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Bulk upload foto CCTV gudang.
    Menerima beberapa file foto dengan format nama file:
    [KodePlant]_[Feed]_[Tanggal].[ext]
    """
    s3_client = get_s3_client()
    results = []
    
    for file in files:
        filename = file.filename
        if not filename:
            continue
        
        base_name, file_ext = os.path.splitext(filename)
        file_ext = file_ext.lower().strip(".")
        if file_ext not in ["jpg", "jpeg", "png"]:
            results.append({
                "filename": filename,
                "status": "error",
                "reason": "Hanya file JPG, JPEG, dan PNG yang diperbolehkan."
            })
            continue
            
        parts = base_name.split("_")
        if len(parts) < 2:
            results.append({
                "filename": filename,
                "status": "error",
                "reason": "Format nama file salah. Harus mengandung minimal [KodePlant] dan [Feed] dipisahkan oleh underscore (_)."
            })
            continue
            
        kode_plant = parts[0].strip().upper()
        feed_str = parts[1].strip().lower()
        
        # Tentukan tanggal
        tanggal = default_tanggal
        if len(parts) >= 3:
            potential_date = parts[2].strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", potential_date):
                tanggal = potential_date
            elif re.match(r"^\d{8}$", potential_date):
                try:
                    tanggal = datetime.strptime(potential_date, "%Y%m%d").strftime("%Y-%m-%d")
                except ValueError:
                    pass
        
        # Validasi feed_number
        if "depan" in feed_str or feed_str == "1":
            feed_number = 1
            kamera_label = "CCTV Pintu Depan"
        elif "dalam" in feed_str or feed_str == "2":
            feed_number = 2
            kamera_label = "CCTV Dalam Area Stok"
        else:
            results.append({
                "filename": filename,
                "status": "error",
                "reason": f"Feed kamera '{feed_str}' tidak dikenali. Harus berupa '1', '2', 'depan', atau 'dalam'."
            })
            continue
            
        # Lookup plant
        wp = db.query(WarehousePlant).filter(WarehousePlant.kode_plant == kode_plant).first()
        if not wp:
            results.append({
                "filename": filename,
                "status": "error",
                "reason": f"Kode plant '{kode_plant}' tidak terdaftar di Master Data Gudang."
            })
            continue
            
        gudang = wp.warehouse
        if not gudang:
            results.append({
                "filename": filename,
                "status": "error",
                "reason": f"Gudang untuk plant '{kode_plant}' tidak ditemukan."
            })
            continue
            
        gudang_id = gudang.id
        
        # Hitung size
        file.file.seek(0, 2)
        file_size_bytes = file.file.tell()
        file.file.seek(0)
        file_size_kb = file_size_bytes // 1024

        unique_filename = f"gudang_{gudang_id}/{tanggal}/feed_{feed_number}_{uuid.uuid4().hex[:8]}.{file_ext}"

        if s3_client:
            try:
                s3_client.upload_fileobj(
                    file.file,
                    settings.R2_BUCKET_NAME,
                    unique_filename,
                    ExtraArgs={"ContentType": file.content_type}
                )
                
                if settings.R2_PUBLIC_URL:
                    file_url = f"{settings.R2_PUBLIC_URL}/{unique_filename}"
                else:
                    file_url = f"https://{settings.R2_BUCKET_NAME}.{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{unique_filename}"
            except ClientError as e:
                results.append({
                    "filename": filename,
                    "status": "error",
                    "reason": f"Gagal mengunggah ke Cloudflare R2: {str(e)}"
                })
                continue
        else:
            file_url = save_locally(file, unique_filename)
            
        # Upsert
        existing_photo = db.query(Photo).filter(
            Photo.gudang_id == gudang_id,
            Photo.tanggal == tanggal,
            Photo.feed_number == feed_number
        ).first()
        
        if existing_photo:
            existing_photo.filename = filename
            existing_photo.r2_key = unique_filename
            existing_photo.r2_url = file_url
            existing_photo.file_size_kb = file_size_kb
            existing_photo.uploaded_at = datetime.now()
        else:
            new_photo = Photo(
                gudang_id=gudang_id,
                tanggal=tanggal,
                filename=filename,
                r2_key=unique_filename,
                r2_url=file_url,
                feed_number=feed_number,
                file_size_kb=file_size_kb,
                uploaded_at=datetime.now()
            )
            db.add(new_photo)
            
        results.append({
            "filename": filename,
            "status": "success",
            "gudang": gudang.nama_gudang,
            "kode_plant": kode_plant,
            "kamera": kamera_label,
            "tanggal": tanggal,
            "url": file_url
        })
        
    db.commit()
    return {
        "message": "Proses bulk upload selesai",
        "results": results
    }
