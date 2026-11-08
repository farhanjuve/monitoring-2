"""Helper pencatatan audit sederhana.

Aplikasi belum memakai autentikasi untuk endpoint tulis, jadi `aktor` boleh
kosong. Pencatatan dilakukan pada transaksi yang sama dengan perubahan data,
sehingga kalau perubahan gagal, log ikut batal.
"""

import json
from typing import Any, Dict, Optional

from app.models.models import AuditLog


def catat_audit(
    db,
    aksi: str,
    entitas: str,
    entitas_id: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None,
    aktor: Optional[str] = None,
) -> AuditLog:
    log = AuditLog(
        aktor=aktor,
        aksi=aksi,
        entitas=entitas,
        entitas_id=str(entitas_id) if entitas_id is not None else None,
        detail=json.dumps(detail, ensure_ascii=False) if detail is not None else None,
    )
    db.add(log)
    return log
