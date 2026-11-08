"""Tambah flag lingkup perhitungan nasional per gudang.

Revision ID: e7c2a4d9f1b3
Revises: 9124c1bb0614
Create Date: 2026-11-06

Gudang pabrik/pelabuhan/kantor serta gudang lini (kode berakhiran 101) dan
gudang pelabuhan (kode 7xx) tidak masuk perhitungan keterisian nasional.
Flag ini disimpan per gudang agar bisa diubah lewat halaman Lingkup Nasional
tanpa perlu deploy ulang.
"""

from collections import defaultdict
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e7c2a4d9f1b3"
down_revision: Union[str, Sequence[str], None] = "9124c1bb0614"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _kategori_plant(code: str) -> str:
    try:
        from app.core.plant_directory import plant_category

        return plant_category(code)
    except Exception:  # pragma: no cover - fallback bila import tidak tersedia
        return "gudang"


def _sebaiknya_dikecualikan(kode_plants) -> bool:
    for kode in kode_plants:
        kode = str(kode or "").strip().upper()
        if not kode:
            continue
        kategori = _kategori_plant(kode)
        if kategori in ("pabrik", "pelabuhan", "kantor"):
            return True
        angka = "".join(ch for ch in kode if ch.isdigit())
        if angka.endswith("101"):
            return True
        if len(angka) == 3 and angka.startswith("7"):
            return True
    return False


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "warehouses",
        sa.Column(
            "is_national_included",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )

    # Isi nilai awal berdasarkan pola kode plant yang sudah dikenal.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT w.id, p.kode_plant "
            "FROM warehouses w "
            "LEFT JOIN warehouse_plants p ON p.gudang_id = w.id"
        )
    ).fetchall()

    plants_by_warehouse = defaultdict(list)
    for warehouse_id, kode_plant in rows:
        if kode_plant:
            plants_by_warehouse[warehouse_id].append(kode_plant)

    excluded_ids = [
        warehouse_id
        for warehouse_id, kode_plants in plants_by_warehouse.items()
        if _sebaiknya_dikecualikan(kode_plants)
    ]
    if excluded_ids:
        bind.execute(
            sa.text(
                "UPDATE warehouses SET is_national_included = 0 "
                "WHERE id IN :ids"
            ).bindparams(sa.bindparam("ids", expanding=True)),
            {"ids": excluded_ids},
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("warehouses", "is_national_included")
