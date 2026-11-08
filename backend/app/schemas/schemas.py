from pydantic import BaseModel, EmailStr, Field, field_serializer, field_validator
from datetime import datetime, date
from typing import List, Optional

from app.core.time import to_utc_iso

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

    @field_serializer("created_at")
    def serialize_created_at(self, value: datetime):
        return to_utc_iso(value)

    class Config:
        from_attributes = True

class FcmTokenCreate(BaseModel):
    token: str
    device_info: str | None = None

# ==================== Stock Schemas ====================

class StockCalculationOut(BaseModel):
    id: int
    tanggal: date
    gudang_id: int
    nama_gudang: Optional[str] = None
    kode_plants: Optional[str] = None
    kota: Optional[str] = None
    provinsi: Optional[str] = None
    is_active: bool = True
    is_national_included: bool = True
    tipe_pupuk: str
    stok_fisik: float
    outstanding_so: float
    stok_admin_tanpa_intransit: float
    intransit: float
    stok_admin: float
    # "Transit and Transfer" dari MB52. Hanya dipakai peta keterisian gudang.
    transit_transfer: float = 0.0
    calculated_at: Optional[datetime] = None

    @field_validator("transit_transfer", mode="before")
    @classmethod
    def _transit_transfer_nol(cls, value):
        """Baris lama bisa saja NULL; perlakukan sebagai 0, bukan error."""
        return 0.0 if value is None else value

    @field_serializer("calculated_at")
    def serialize_calculated_at(self, value: datetime | None):
        return to_utc_iso(value)

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

    @field_serializer("created_at")
    def serialize_created_at(self, value: datetime | None):
        return to_utc_iso(value)

    class Config:
        from_attributes = True

class UploadResponse(BaseModel):
    message: str
    upload: SAPUploadOut
    rows_processed: int
    calculations_updated: int


# ==================== Kapasitas Gudang ====================

class KapasitasItem(BaseModel):
    """Satu kode plant beserta kapasitas dan gudang pemiliknya."""

    kode_plant: str
    kapasitas_ton: float = 0.0
    nama_gudang: Optional[str] = None
    kota: Optional[str] = None
    provinsi: Optional[str] = None
    terpetakan: bool = False
    total_kapasitas_gudang: float = 0.0


class KapasitasUpdate(BaseModel):
    kapasitas_ton: float = Field(default=0.0, ge=0)


class KapasitasBulkItem(KapasitasUpdate):
    kode_plant: str


class KapasitasBulkUpdate(BaseModel):
    items: List[KapasitasBulkItem]
