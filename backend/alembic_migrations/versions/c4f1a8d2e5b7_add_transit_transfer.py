"""Tambah kolom transit_transfer (Transit and Transfer dari MB52).

Revision ID: c4f1a8d2e5b7
Revises: e7c2a4d9f1b3
Create Date: 2026-11-06

Kolom ini menyimpan angka "Transit and Transfer" dari file MB52 secara
terpisah dari `intransit` ("Stock in Transit"). Tujuannya agar peta
keterisian gudang bisa menambahkannya ke stok fisik tanpa mengubah
metrik Intransit di dashboard.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c4f1a8d2e5b7"
down_revision: Union[str, Sequence[str], None] = "e7c2a4d9f1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _kolom_ada(table: str, kolom: str) -> bool:
    bind = op.get_bind()
    hasil = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": kolom},
    ).scalar()
    return bool(hasil)


def upgrade() -> None:
    for table in ("sap_stock", "stock_calculations"):
        if not _kolom_ada(table, "transit_transfer"):
            op.add_column(table, sa.Column("transit_transfer", sa.Float(), nullable=True))
        # Data lama tidak punya nilai; isi 0 agar API tidak menerima NULL.
        op.execute(f"UPDATE {table} SET transit_transfer = 0 WHERE transit_transfer IS NULL")


def downgrade() -> None:
    for table in ("stock_calculations", "sap_stock"):
        if _kolom_ada(table, "transit_transfer"):
            op.drop_column(table, "transit_transfer")
