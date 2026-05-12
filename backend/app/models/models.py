from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

Base = declarative_base()

class MasterPlant(Base):
    __tablename__ = "master_plant"
    
    id = Column(Integer, primary_key=True, index=True)
    kode_plant = Column(String(10), unique=True, index=True, nullable=False)
    nama_gudang = Column(String(200))
    anper = Column(String(10))
    lini = Column(String(20))
    kabupaten = Column(String(100))
    kode_kab = Column(Integer, index=True)
    provinsi = Column(String(100))
    kapasitas_ton = Column(Float, nullable=True)
    has_cctv = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    sharing_kode_plant = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SafetyStock(Base):
    __tablename__ = "safety_stock"
    
    id = Column(Integer, primary_key=True, index=True)
    kode_kab = Column(Integer, unique=True, index=True, nullable=False)
    kabupaten = Column(String(100))
    provinsi = Column(String(100))
    ss_urea = Column(Float, default=0.0)
    ss_npk = Column(Float, default=0.0)
    ss_npk_kakao = Column(Float, default=0.0)
    ss_za = Column(Float, default=0.0)
    ss_sp36 = Column(Float, default=0.0)
    ss_organik = Column(Float, default=0.0)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class AreaGrouping(Base):
    __tablename__ = "area_grouping"
    __table_args__ = (UniqueConstraint('kode_kab', 'kode_plant', name='uq_area_grouping_kab_plant'),)
    
    id = Column(Integer, primary_key=True, index=True)
    kode_kab = Column(Integer, index=True, nullable=False)
    kabupaten = Column(String(100))
    provinsi = Column(String(100))
    kode_plant = Column(String(10), ForeignKey("master_plant.kode_plant"), index=True, nullable=False)
    is_configured = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class SAPStock(Base):
    __tablename__ = "sap_stock"
    __table_args__ = (Index('ix_sap_stock_tanggal_plant_jenis', 'tanggal', 'kode_plant', 'jenis_pupuk'),)
    
    id = Column(Integer, primary_key=True, index=True)
    tanggal = Column(Date, index=True, nullable=False)
    kode_plant = Column(String(10), index=True, nullable=False)
    jenis_pupuk = Column(String(20), nullable=False)
    material_code = Column(String(20), nullable=True)
    material_desc = Column(String(200), nullable=True)
    storage_location = Column(String(10), nullable=True)
    unrestricted = Column(Float, default=0.0)
    intransit = Column(Float, default=0.0)

class SAPOutstandingDO(Base):
    __tablename__ = "sap_outstanding_do"
    __table_args__ = (Index('ix_sap_do_tanggal_plant_jenis', 'tanggal', 'kode_plant', 'jenis_pupuk'),)
    
    id = Column(Integer, primary_key=True, index=True)
    tanggal = Column(Date, index=True, nullable=False)
    kode_plant = Column(String(10), index=True, nullable=False)
    jenis_pupuk = Column(String(20), nullable=False)
    nomor_so = Column(String(30), nullable=True)
    outstanding_qty = Column(Float, default=0.0)
    status_so = Column(String(50), nullable=True)

class SAPUpload(Base):
    __tablename__ = "sap_uploads"
    
    id = Column(Integer, primary_key=True, index=True)
    jenis_file = Column(String(20), nullable=False)  # 'MB52' or 'ZSD_SODO'
    tanggal_data = Column(Date, nullable=False)
    filename = Column(String(300), nullable=False)
    jumlah_baris = Column(Integer, default=0)
    status = Column(String(20), default="success")  # 'success', 'failed', 'processing'
    error_message = Column(Text, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class StockCalculation(Base):
    __tablename__ = "stock_calculations"
    __table_args__ = (UniqueConstraint('tanggal', 'kode_plant', 'tipe_pupuk', name='uq_stock_calc_tanggal_plant_tipe'),)
    
    id = Column(Integer, primary_key=True, index=True)
    tanggal = Column(Date, index=True, nullable=False)
    kode_plant = Column(String(10), index=True, nullable=False)
    tipe_pupuk = Column(String(20), index=True, nullable=False)
    stok_fisik = Column(Float, default=0.0)
    outstanding_so = Column(Float, default=0.0)
    stok_admin_tanpa_intransit = Column(Float, default=0.0)
    intransit = Column(Float, default=0.0)
    stok_admin = Column(Float, default=0.0)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())

class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (Index('ix_photos_tanggal_plant', 'tanggal', 'kode_plant'),)
    
    id = Column(Integer, primary_key=True, index=True)
    tanggal = Column(Date, index=True, nullable=False)
    kode_plant = Column(String(10), index=True, nullable=False)
    kode_plant2 = Column(String(10), nullable=True)
    filename = Column(String(200), nullable=False)
    r2_key = Column(String(300), nullable=False)
    r2_url = Column(Text, nullable=False)
    feed_number = Column(Integer, nullable=False)
    file_size_kb = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    nama = Column(String(100), nullable=False)
    hashed_pw = Column(String(200), nullable=False)
    role = Column(String(20), default="viewer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class FCMToken(Base):
    __tablename__ = "fcm_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(Text, nullable=False)
    device_info = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class NotificationLog(Base):
    __tablename__ = "notification_log"
    
    id = Column(Integer, primary_key=True, index=True)
    tanggal = Column(Date, nullable=False)
    kode_kab = Column(Integer, nullable=False)
    kabupaten = Column(String(100))
    provinsi = Column(String(100))
    jenis_pupuk = Column(String(20))
    stok_tersedia = Column(Float)
    safety_stock = Column(Float)
    pct_of_ss = Column(Float)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    fcm_success = Column(Integer, default=0)
