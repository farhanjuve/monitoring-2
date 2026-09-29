"""
INDIGO Report API Routes
Endpoints untuk laporan realisasi penggunaan aplikasi INDIGO Truck Tracker:
  - Upload berpasangan report SAP (acuan) + report INDIGO (realisasi)
  - Ringkasan global & kecenderungan per bulan
  - Breakdown per ekspeditur & per plant (asal/tujuan)
  - Riwayat upload & hapus
"""

import io
import re
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import IndigoReport, IndigoDO
from app.services.indigo_parser import (
    parse_sap_report,
    parse_indigo_report,
    build_report_records,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _serialize_report(r: IndigoReport) -> dict:
    return {
        "id": r.id,
        "periode": r.periode,
        "sap_filename": r.sap_filename,
        "indigo_filename": r.indigo_filename,
        "sap_do_count": r.sap_do_count,
        "indigo_do_count": r.indigo_do_count,
        "matched_count": r.matched_count,
        "realization_pct": round(r.realization_pct or 0.0, 2),
        "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else None,
    }


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_report(
    sap_file: UploadFile = File(...),
    indigo_file: UploadFile = File(...),
    periode: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Upload report SAP + report INDIGO untuk dihitung realisasinya."""
    if not sap_file.filename or not indigo_file.filename:
        raise HTTPException(status_code=400, detail="Kedua file (SAP & INDIGO) wajib diupload.")

    if periode:
        if not re.fullmatch(r"\d{4}-\d{2}", periode):
            raise HTTPException(status_code=400, detail="Format periode harus YYYY-MM.")
    else:
        # Hanya satu upload per periode default (paling baru menggantikan yang lama)
        pass

    try:
        sap_data = await sap_file.read()
        indigo_data = await indigo_file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca file: {str(e)}")

    try:
        sap_parsed = parse_sap_report(io.BytesIO(sap_data))
        indigo_parsed = parse_indigo_report(io.BytesIO(indigo_data))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File tidak bisa diparse: {str(e)}")

    if sap_parsed["do_count"] == 0:
        raise HTTPException(status_code=400, detail="Report SAP tidak mengandung data DO.")

    # Periode final: override manual atau bulan dominan dari Tgl. GI, atau "unknown"
    final_periode = periode or sap_parsed["periode"] or "0000-00"

    records, matched_count, sap_total, realization_pct = build_report_records(
        sap_parsed, indigo_parsed, periode_override=final_periode
    )

    # Simpan report + record DO
    report = IndigoReport(
        periode=final_periode,
        sap_filename=sap_file.filename,
        indigo_filename=indigo_file.filename,
        sap_do_count=sap_total,
        indigo_do_count=indigo_parsed["do_count"],
        matched_count=matched_count,
        realization_pct=realization_pct,
    )
    db.add(report)
    db.flush()

    db.bulk_insert_mappings(IndigoDO, [
        {
            "report_id": report.id,
            "periode": final_periode,
            "no_do": rec["no_do"],
            "ekspeditur": rec["ekspeditur"],
            "plant_asal": rec["plant_asal"],
            "plant_tujuan": rec["plant_tujuan"],
            "provinsi_asal": rec["provinsi_asal"],
            "kabupaten_asal": rec["kabupaten_asal"],
            "provinsi_tujuan": rec["provinsi_tujuan"],
            "kabupaten_tujuan": rec["kabupaten_tujuan"],
            "material": rec["material"],
            "tgl_gi": rec["tgl_gi"],
            "is_matched": rec["is_matched"],
        }
        for rec in records
    ])
    db.commit()
    db.refresh(report)

    return {
        "report": _serialize_report(report),
        "summary": {
            "sap_do_count": sap_total,
            "indigo_do_count": indigo_parsed["do_count"],
            "indigo_tracking_count": indigo_parsed["tracking_count"],
            "indigo_delivery_count": indigo_parsed["delivery_count"],
            "matched_count": matched_count,
            "realization_pct": round(realization_pct, 2),
        },
    }


# ── Overview / Trend ─────────────────────────────────────────────────────────

@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    """Ringkasan global seluruh bulan yang sudah diupload."""
    totals = db.query(
        func.sum(IndigoReport.sap_do_count).label("sap_total"),
        func.sum(IndigoReport.indigo_do_count).label("indigo_total"),
        func.sum(IndigoReport.matched_count).label("matched_total"),
    ).first()

    sap_total = totals.sap_total or 0
    indigo_total = totals.indigo_total or 0
    matched_total = totals.matched_total or 0

    return {
        "totals": {
            "sap_do_count": sap_total,
            "indigo_do_count": indigo_total,
            "matched_count": matched_total,
            "realization_pct": round((matched_total / sap_total * 100) if sap_total else 0.0, 2),
            "report_count": db.query(IndigoReport).count(),
        }
    }


@router.get("/trend")
def get_trend(db: Session = Depends(get_db)):
    """Kecenderungan naik-turun kepatuhan per bulan (aggregasi dari tabel report)."""
    rows = (
        db.query(
            IndigoReport.periode.label("periode"),
            func.sum(IndigoReport.sap_do_count).label("sap_do_count"),
            func.sum(IndigoReport.indigo_do_count).label("indigo_do_count"),
            func.sum(IndigoReport.matched_count).label("matched_count"),
        )
        .group_by(IndigoReport.periode)
        .order_by(IndigoReport.periode)
        .all()
    )

    result = []
    for row in rows:
        sap = row.sap_do_count or 0
        matched = row.matched_count or 0
        result.append({
            "periode": row.periode,
            "sap_do_count": sap,
            "indigo_do_count": row.indigo_do_count or 0,
            "matched_count": matched,
            "realization_pct": round((matched / sap * 100) if sap else 0.0, 2),
        })
    return result


@router.get("/ekspeditur")
def get_ekspeditur(
    periode: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Realisasi per ekspeditur."""
    q = db.query(
        IndigoDO.ekspeditur.label("ekspeditur"),
        func.count(IndigoDO.id).label("sap_do_count"),
        func.sum(case((IndigoDO.is_matched == True, 1), else_=0)).label("matched_count"),
    )
    if periode:
        q = q.filter(IndigoDO.periode == periode)

    q = (
        q.group_by(IndigoDO.ekspeditur)
        .order_by(func.sum(case((IndigoDO.is_matched == True, 1), else_=0)).desc())
    )
    if limit and limit > 0:
        q = q.limit(limit)
    rows = q.all()

    result = []
    for row in rows:
        sap = row.sap_do_count or 0
        matched = row.matched_count or 0
        if not row.ekspeditur:
            continue
        result.append({
            "ekspeditur": row.ekspeditur,
            "sap_do_count": sap,
            "matched_count": matched,
            "unmatched_count": sap - matched,
            "realization_pct": round((matched / sap * 100) if sap else 0.0, 2),
        })
    return result


@router.get("/plant")
def get_plant(
    periode: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Realisasi per plant asal & tujuan."""
    asal_q = db.query(
        IndigoDO.plant_asal.label("plant"),
        func.count(IndigoDO.id).label("sap_do_count"),
        func.sum(case((IndigoDO.is_matched == True, 1), else_=0)).label("matched_count"),
    )
    tujuan_q = db.query(
        IndigoDO.plant_tujuan.label("plant"),
        func.count(IndigoDO.id).label("sap_do_count"),
        func.sum(case((IndigoDO.is_matched == True, 1), else_=0)).label("matched_count"),
    )
    if periode:
        asal_q = asal_q.filter(IndigoDO.periode == periode)
        tujuan_q = tujuan_q.filter(IndigoDO.periode == periode)

    asal_q = (
        asal_q.group_by(IndigoDO.plant_asal)
        .order_by(func.count(IndigoDO.id).desc())
    )
    tujuan_q = (
        tujuan_q.group_by(IndigoDO.plant_tujuan)
        .order_by(func.count(IndigoDO.id).desc())
    )
    if limit and limit > 0:
        asal_q = asal_q.limit(limit)
        tujuan_q = tujuan_q.limit(limit)

    asal_rows = asal_q.all()
    tujuan_rows = tujuan_q.all()

    def _serialize(rows, role):
        out = []
        for row in rows:
            plant = row.plant
            if not plant:
                continue
            sap = row.sap_do_count or 0
            matched = row.matched_count or 0
            out.append({
                "plant": plant,
                "role": role,
                "sap_do_count": sap,
                "matched_count": matched,
                "unmatched_count": sap - matched,
                "realization_pct": round((matched / sap * 100) if sap else 0.0, 2),
            })
        return out

    return {
        "asal": _serialize(asal_rows, "asal"),
        "tujuan": _serialize(tujuan_rows, "tujuan"),
    }


@router.get("/periode-list")
def get_periode_list(db: Session = Depends(get_db)):
    """Daftar periode yang pernah diupload (untuk filter)."""
    rows = (
        db.query(IndigoReport.periode)
        .distinct()
        .order_by(IndigoReport.periode.desc())
        .all()
    )
    return [r[0] for r in rows]


# ── Riwayat ──────────────────────────────────────────────────────────────────

@router.get("/reports")
def get_reports(db: Session = Depends(get_db)):
    rows = (
        db.query(IndigoReport)
        .order_by(IndigoReport.created_at.desc())
        .all()
    )
    return [_serialize_report(r) for r in rows]


@router.delete("/reports/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = db.query(IndigoReport).filter(IndigoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Upload tidak ditemukan.")

    # Hapus record DO terkait manual supaya ondelete trigger tetap jalan di TiDB
    db.query(IndigoDO).filter(IndigoDO.report_id == report_id).delete()
    db.delete(report)
    db.commit()
    return {"message": "Upload berhasil dihapus."}