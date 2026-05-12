from pydantic import BaseModel, EmailStr
from datetime import datetime, date
from typing import Optional

class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    email: EmailStr
    nama: str
    password: str
    role: str = "viewer"

class UserOut(BaseModel):
    id: int
    email: EmailStr
    nama: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class FcmTokenCreate(BaseModel):
    token: str
    device_info: str | None = None

# ==================== Stock Schemas ====================

class StockCalculationOut(BaseModel):
    id: int
    tanggal: date
    kode_plant: str
    tipe_pupuk: str
    stok_fisik: float
    outstanding_so: float
    stok_admin_tanpa_intransit: float
    intransit: float
    stok_admin: float
    calculated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class StockPreview(BaseModel):
    stok_fisik: float
    outstanding_so: float
    stok_admin_tanpa_intransit: float
    intransit: float
    stok_admin: float

class SAPUploadOut(BaseModel):
    id: int
    jenis_file: str
    tanggal_data: date
    filename: str
    jumlah_baris: int
    status: str
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UploadResponse(BaseModel):
    message: str
    upload: SAPUploadOut
    rows_processed: int
    calculations_updated: int
