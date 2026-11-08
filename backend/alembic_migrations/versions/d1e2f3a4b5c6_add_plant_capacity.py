"""Tabel plant_capacity + audit_logs, dan seed kapasitas dari JSON.

Revision ID: d1e2f3a4b5c6
Revises: c4f1a8d2e5b7
Create Date: 2026-11-06

Kapasitas dipindah dari file JSON ke database agar bisa diubah lewat frontend.
JSON lama tetap dipertahankan sebagai cadangan bila tabel masih kosong.
"""

import json
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c4f1a8d2e5b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SUMBER_JSON = (
    Path(__file__).resolve().parents[2] / "app" / "core" / "data" / "kapasitas_gudang.json"
)


def upgrade() -> None:
    op.create_table(
        "plant_capacity",
        sa.Column("kode_plant", sa.String(length=10), primary_key=True, nullable=False),
        sa.Column("kapasitas_ton", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("aktor", sa.String(length=100), nullable=True),
        sa.Column("aksi", sa.String(length=50), nullable=False),
        sa.Column("entitas", sa.String(length=50), nullable=False),
        sa.Column("entitas_id", sa.String(length=50), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
    )
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    if not _SUMBER_JSON.exists():
        return

    with _SUMBER_JSON.open(encoding="utf-8") as handle:
        peta = json.load(handle)

    tabel = sa.table(
        "plant_capacity",
        sa.column("kode_plant", sa.String),
        sa.column("kapasitas_ton", sa.Float),
    )
    baris = []
    for kode, nilai in peta.items():
        try:
            angka = float(nilai) if nilai is not None else 0.0
        except (TypeError, ValueError):
            angka = 0.0
        baris.append({"kode_plant": str(kode).strip(), "kapasitas_ton": angka})

    if baris:
        op.bulk_insert(tabel, baris)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_table("plant_capacity")
