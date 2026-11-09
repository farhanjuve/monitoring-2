"""Endpoint agregasi untuk halaman /peta-kabupaten.

Satu panggilan mengembalikan KPI, level provinsi/kabupaten/gudang, ranking,
dan Stok Pabrik dari filter yang sama. Dengan begitu peta, KPI, dan ranking
tidak mungkin memakai angka yang berbeda.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import SAPStock
from app.services.peta_aggregate import (
    DEFAULT_THRESHOLDS,
    FilterPeta,
    aggregate_peta,
    load_peta_data,
    normalize_subsidi,
)

router = APIRouter()


def _split(value: Optional[str]) -> frozenset[str]:
    if not value:
        return frozenset()
    return frozenset(
        bagian.strip() for bagian in value.split(",") if bagian.strip()
    )


@router.get("/aggregate")
def get_aggregate(
    tanggal: Optional[date] = None,
    produk: Optional[str] = Query(None, description="Daftar kategori dipisah koma"),
    subsidi: str = Query("SEMUA", description="SEMUA | SUBSIDI | NON_SUBSIDI"),
    anper: Optional[str] = Query(None, description="Daftar Anper dipisah koma"),
    lini: Optional[str] = Query(None, description="Belum tersedia"),
    provinsi: Optional[str] = None,
    kabupaten: Optional[str] = None,
    gudang_id: Optional[int] = None,
    indikator: str = "keterisian_admin",
    lega: float = DEFAULT_THRESHOLDS[0],
    waspada: float = DEFAULT_THRESHOLDS[1],
    kritis: float = DEFAULT_THRESHOLDS[2],
    db: Session = Depends(get_db),
):
    """Agregasi dashboard peta untuk satu tanggal dan satu set filter."""
    if not tanggal:
        tanggal = db.query(func.max(SAPStock.tanggal)).scalar()
    if not tanggal:
        raise HTTPException(status_code=404, detail="Belum ada data stok SAP.")

    gudangs, plant_stocks, produk_tersedia, anper_tersedia = load_peta_data(db, tanggal)
    filt = FilterPeta(
        produk=_split(produk),
        subsidi=normalize_subsidi(subsidi),
        anper=_split(anper),
        lini=_split(lini),
        provinsi=provinsi,
        kabupaten=kabupaten,
        gudang_id=gudang_id,
        indikator=indikator,
        thresholds=(lega, waspada, kritis),
    )
    hasil = aggregate_peta(
        gudangs,
        plant_stocks,
        filt,
        produk_tersedia=produk_tersedia,
        anper_tersedia=anper_tersedia,
    )
    hasil["tanggal"] = tanggal.isoformat()
    return hasil
