"""Tambah material_code pada SO dan tabel alokasi Anper gudang.

Revision ID: 9f4c1a7b2d10
Revises: d1e2f3a4b5c6
Create Date: 2026-11-08

Dua perubahan:

1. ``sap_outstanding_do.material_code`` (nullable). Kolom ini dibutuhkan agar
   Outstanding SO bisa difilter per produk dan per status subsidi, bukan hanya
   per grup Urea/NPK. Data lama tetap NULL sampai file ZSD diunggah ulang.
2. Tabel ``warehouse_anper`` berisi Anper yang dilayani setiap gudang. Sumber
   awalnya ``Daftar_Gudang_Bersih_Per_01_Oktober_2026.csv`` (kolom Kapasitas
   PIM/PSP/PKC/PKG/PKT). Tabel ini hanya untuk filter/label; penyebut
   keterisian tetap kapasitas fisik gudang di ``plant_capacity``.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9f4c1a7b2d10"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sap_outstanding_do",
        sa.Column("material_code", sa.String(length=20), nullable=True),
    )
    op.create_table(
        "warehouse_anper",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("gudang_id", sa.Integer(), nullable=False),
        sa.Column("anper", sa.String(length=10), nullable=False),
        sa.Column("kapasitas_ton", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(
            ["gudang_id"], ["warehouses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gudang_id", "anper", name="uq_warehouse_anper"),
    )
    op.create_index(
        "ix_warehouse_anper_gudang_id", "warehouse_anper", ["gudang_id"]
    )
    op.create_index("ix_warehouse_anper_anper", "warehouse_anper", ["anper"])


def downgrade() -> None:
    op.drop_index("ix_warehouse_anper_anper", table_name="warehouse_anper")
    op.drop_index("ix_warehouse_anper_gudang_id", table_name="warehouse_anper")
    op.drop_table("warehouse_anper")
    op.drop_column("sap_outstanding_do", "material_code")
