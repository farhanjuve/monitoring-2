"""Pembuat laporan keterisian gudang dalam format Excel.

Dipisahkan dari router agar bisa diuji tanpa database: seluruh fungsi di sini
menerima data yang sudah di-query (warehouse, kalkulasi stok, peta kapasitas)
dan tidak menyentuh Session.

Definisi yang dipakai:
- Keterisian = stok admin gudang / kapasitas gudang.
- Kapasitas gudang multi-plant = jumlah kapasitas seluruh kode plant-nya.
- Stok admin dan fisik dirinci per jenis pupuk, sedangkan status keterisian
  memakai gabungan seluruh jenis pupuk.
"""

from collections import defaultdict
from datetime import date
from typing import Dict, List, Sequence, Tuple

from openpyxl import Workbook
from openpyxl.formatting.rule import DataBarRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.core.material_master import (
    GRUP_CAIR,
    GRUP_NON_SUBSIDI,
    grup_untuk_kategori,
    kelompokkan_grup,
    satuan_grup,
)
from app.core.regions import get_area_for_province


BULAN_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

AREA_ORDER = ["Sumatera", "Jawa", "Bali & NT", "Kalimantan", "Sulamapa"]

SATUAN_TON = "TON"

OCCUPANCY_STATUS_LABEL = {
    "ok": "Lega",
    "warn": "Waspada",
    "low": "Kritis",
    "full": "Penuh",
    "na": "Tanpa kapasitas",
    "none": "Belum ada data",
}

OCCUPANCY_STATUS_RANK = {"full": 0, "low": 1, "warn": 2, "ok": 3, "na": 4, "none": 5}

OCCUPANCY_STATUS_STYLE = {
    "ok": ("C6EFCE", "006100"),
    "warn": ("FFEB9C", "9C6500"),
    "low": ("F8CBAD", "9C0006"),
    "full": ("FFC7CE", "9C0006"),
    "na": ("D9D9D9", "404040"),
    "none": ("E7E6E6", "808080"),
}


def format_tanggal_id(value: date) -> str:
    return f"{value.day} {BULAN_ID[value.month - 1]} {value.year}"


def occupancy_status(total_admin: float, kapasitas: float, has_data: bool) -> str:
    if kapasitas <= 0:
        return "na"
    if not has_data:
        return "none"
    ratio = total_admin / kapasitas
    if ratio > 1:
        return "full"
    if ratio >= 0.9:
        return "low"
    if ratio >= 0.7:
        return "warn"
    return "ok"


def area_index(area: str) -> int:
    try:
        return AREA_ORDER.index(area)
    except ValueError:
        return len(AREA_ORDER)


def build_occupancy_rows(
    warehouses: Sequence,
    calcs: Sequence,
    kapasitas_map: Dict[str, float],
) -> Tuple[List[dict], List[str]]:
    """Susun satu baris laporan per gudang beserta daftar grup pupuk.

    Keterisian hanya memakai pupuk bersatuan TON. Pupuk cair bersatuan liter
    tidak pernah dijumlahkan dengan kapasitas gudang yang juga ton.
    """
    stock_map: dict[int, dict[str, tuple[float, float]]] = {}
    present: set[str] = set()
    for calc in calcs:
        grup = grup_untuk_kategori(calc.tipe_pupuk)
        present.add(grup)
        stock_map.setdefault(calc.gudang_id, {})[grup] = (
            float(calc.stok_admin or 0.0),
            float(calc.stok_fisik or 0.0),
        )

    groups = kelompokkan_grup(present) or ["Urea", "NPK"]
    ton_groups = [g for g in groups if satuan_grup(g) == SATUAN_TON]

    rows = []
    for warehouse in warehouses:
        plants = sorted(
            [p for p in warehouse.plants if p.kode_plant],
            key=lambda p: p.kode_plant,
        )
        kode_plants = "/".join(p.kode_plant for p in plants)
        kapasitas = sum(kapasitas_map.get(p.kode_plant, 0.0) for p in plants)

        admin_by_grup = {}
        fisik_by_grup = {}
        for grup in groups:
            admin, fisik = stock_map.get(warehouse.id, {}).get(grup, (0.0, 0.0))
            admin_by_grup[grup] = admin
            fisik_by_grup[grup] = fisik

        total_admin = sum(admin_by_grup[g] for g in ton_groups)
        total_fisik = sum(fisik_by_grup[g] for g in ton_groups)
        non_subsidi_admin = admin_by_grup.get(GRUP_NON_SUBSIDI, 0.0)
        non_subsidi_fisik = fisik_by_grup.get(GRUP_NON_SUBSIDI, 0.0)
        subsidi_admin = total_admin - non_subsidi_admin
        subsidi_fisik = total_fisik - non_subsidi_fisik

        # Ketersediaan data dinilai dari pupuk berton saja: gudang yang hanya
        # punya data pupuk cair tetap dianggap belum punya data keterisian.
        has_data = any(g in stock_map.get(warehouse.id, {}) for g in ton_groups)
        status = occupancy_status(total_admin, kapasitas, has_data)
        ratio = (total_admin / kapasitas) if (kapasitas > 0 and has_data) else None
        sisa = (kapasitas - total_admin) if (kapasitas > 0 and has_data) else None

        rows.append(
            {
                "area": get_area_for_province(warehouse.provinsi),
                "provinsi": (warehouse.provinsi or "TIDAK DIKETAHUI").strip().upper(),
                "kabupaten": (warehouse.kota or "TIDAK DIKETAHUI").strip().upper(),
                "kode_plants": kode_plants,
                "nama": warehouse.nama_gudang or f"Gudang {warehouse.id}",
                "jumlah_plant": len(plants),
                "kapasitas": float(kapasitas),
                "admin_by_grup": admin_by_grup,
                "fisik_by_grup": fisik_by_grup,
                "subsidi_admin": subsidi_admin,
                "non_subsidi_admin": non_subsidi_admin,
                "subsidi_fisik": subsidi_fisik,
                "non_subsidi_fisik": non_subsidi_fisik,
                "total_admin": total_admin,
                "total_fisik": total_fisik,
                "ratio": ratio,
                "status": status,
                "sisa": sisa,
                "has_data": has_data,
            }
        )

    rows.sort(
        key=lambda row: (
            area_index(row["area"]),
            row["provinsi"],
            OCCUPANCY_STATUS_RANK.get(row["status"], 9),
            -(row["ratio"] if row["ratio"] is not None else -1.0),
            row["nama"].lower(),
        )
    )

    return rows, groups


def summarize_by_province(
    rows: Sequence[dict],
) -> Dict[Tuple[str, str], dict]:
    """Agregasi baris gudang menjadi rekap per (wilayah, provinsi)."""
    # Rekap per provinsi.
    provinsi_map: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = (row["area"], row["provinsi"])
        agg = provinsi_map.setdefault(
            key,
            {
                "gudang": 0,
                "dengan_data": 0,
                "kapasitas": 0.0,
                "admin": 0.0,
                "admin_terhitung": 0.0,
                "fisik": 0.0,
                "subsidi_admin": 0.0,
                "non_subsidi_admin": 0.0,
                "subsidi_fisik": 0.0,
                "non_subsidi_fisik": 0.0,
                "status": defaultdict(int),
            },
        )
        agg["gudang"] += 1
        agg["dengan_data"] += 1 if row["has_data"] else 0
        agg["kapasitas"] += row["kapasitas"]
        agg["admin"] += row["total_admin"]
        # Hanya stok gudang berkapasitas yang masuk pembilang rasio. Stok
        # gudang tanpa kapasitas tetap ditampilkan agar tidak hilang, tetapi
        # tidak boleh menggelembungkan keterisian provinsi/nasional.
        agg["admin_terhitung"] += row["total_admin"] if row["kapasitas"] > 0 else 0.0
        agg["fisik"] += row["total_fisik"]
        agg["subsidi_admin"] += row["subsidi_admin"]
        agg["non_subsidi_admin"] += row["non_subsidi_admin"]
        agg["subsidi_fisik"] += row["subsidi_fisik"]
        agg["non_subsidi_fisik"] += row["non_subsidi_fisik"]
        agg["status"][row["status"]] += 1

    return provinsi_map


def build_occupancy_workbook(
    tanggal: date,
    rows: Sequence[dict],
    groups: Sequence[str],
    provinsi_map: Dict[Tuple[str, str], dict],
) -> Workbook:
    """Bangun workbook tiga sheet: Ringkasan Provinsi, Detail Gudang, Metodologi."""
    # ==================== Styles ====================
    navy = "1F4E78"
    navy_soft = "D9E2F3"
    border_color = "D9D9D9"
    thin = Side(style="thin", color=border_color)
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill("solid", fgColor=navy)
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=15, bold=True, color=navy)
    subtitle_font = Font(name="Calibri", size=10, italic=True, color="404040")
    note_font = Font(name="Calibri", size=9, italic=True, color="595959")
    body_font = Font(name="Calibri", size=10, color="000000")
    bold_font = Font(name="Calibri", size=10, bold=True, color="000000")
    total_font = Font(name="Calibri", size=10, bold=True, color=navy)

    wb = Workbook()

    # ==================== Sheet 1: Ringkasan Provinsi ====================
    ws = wb.active
    ws.title = "Ringkasan Provinsi"
    ws.sheet_properties.tabColor = navy
    last_col = 17

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_col)
    cell = ws.cell(row=1, column=1, value="LAPORAN KETERISIAN GUDANG PER PROVINSI")
    cell.font = title_font
    cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 24

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_col)
    cell = ws.cell(
        row=2,
        column=1,
        value=(
            f"Tanggal data: {format_tanggal_id(tanggal)}  |  "
            "Dasar keterisian: seluruh pupuk berton ÷ kapasitas gudang  |  "
            "Hanya gudang aktif yang masuk Lingkup Nasional"
        ),
    )
    cell.font = subtitle_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_col)
    cell = ws.cell(
        row=3,
        column=1,
        value=(
            "Angka dalam ton. Stok admin = seluruh pupuk berton (subsidi + non subsidi). "
            "Pupuk cair bersatuan liter tidak ikut dihitung karena satuannya berbeda. "
            "Rasio provinsi/nasional hanya memakai stok gudang berkapasitas."
        ),
    )
    cell.font = note_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    summary_headers = [
        "Wilayah",
        "Provinsi",
        "Jumlah Gudang",
        "Kapasitas (t)",
        "Stok Subsidi (t)",
        "Stok Non Subsidi (t)",
        "Stok Admin (t)",
        "Stok Admin Berkapasitas (t)",
        "Stok Fisik (t)",
        "Keterisian",
        "Sisa Ruang (t)",
        "Lega",
        "Waspada",
        "Kritis",
        "Penuh",
        "Tanpa Kapasitas",
        "Belum Ada Data",
    ]
    header_row = 5
    for col, label in enumerate(summary_headers, start=1):
        cell = ws.cell(row=header_row, column=col, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    ws.row_dimensions[header_row].height = 34

    def write_summary_row(
        values: list,
        row_index: int,
        *,
        fill_hex: str | None = None,
        font: Font = body_font,
        merge_label: bool = False,
        status: str | None = None,
    ) -> None:
        # Nilai wajib ditulis SEBELUM merge. Setelah merge, kolom 2 menjadi
        # MergedCell yang read-only, sehingga menulis nilai ke sana melempar
        # AttributeError dan seluruh laporan gagal dibuat.
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row_index, column=col, value=value)
            cell.font = font
            cell.border = border
            if fill_hex:
                cell.fill = PatternFill("solid", fgColor=fill_hex)

            if col in (1, 2):
                cell.alignment = Alignment(
                    horizontal="center" if col == 1 else "left", vertical="center"
                )
            elif col == 3:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.number_format = "0"
            elif col in (4, 5, 6, 7, 8, 9, 11):
                cell.alignment = Alignment(horizontal="right", vertical="center")
                if isinstance(value, (int, float)):
                    cell.number_format = "#,##0.0"
                if col == 11 and isinstance(value, (int, float)) and value < 0:
                    cell.font = Font(name="Calibri", size=10, bold=True, color="9C0006")
            elif col == 10:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if isinstance(value, (int, float)):
                    cell.number_format = "0.0%"
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.number_format = "0"

        if merge_label:
            ws.merge_cells(
                start_row=row_index, start_column=1, end_row=row_index, end_column=2
            )
            # Rapikan border/fill pada area merge (MergedCell hanya read-only
            # untuk nilai, atribut gaya masih boleh diubah).
            for col in (1, 2):
                merged_cell = ws.cell(row=row_index, column=col)
                merged_cell.border = border
                if fill_hex:
                    merged_cell.fill = PatternFill("solid", fgColor=fill_hex)

        if status:
            fill_hex_status, font_hex_status = OCCUPANCY_STATUS_STYLE[status]
            cell = ws.cell(row=row_index, column=10)
            cell.fill = PatternFill("solid", fgColor=fill_hex_status)
            cell.font = Font(name="Calibri", size=10, bold=True, color=font_hex_status)

    row_index = header_row + 1
    grand = {
        "gudang": 0,
        "dengan_data": 0,
        "kapasitas": 0.0,
        "admin": 0.0,
        "admin_terhitung": 0.0,
        "fisik": 0.0,
        "subsidi_admin": 0.0,
        "non_subsidi_admin": 0.0,
        "status": defaultdict(int),
    }

    for area in AREA_ORDER:
        area_keys = sorted(
            [key for key in provinsi_map if key[0] == area],
            key=lambda key: key[1],
        )
        if not area_keys:
            continue

        area_total = {
            "gudang": 0,
            "dengan_data": 0,
            "kapasitas": 0.0,
            "admin": 0.0,
            "admin_terhitung": 0.0,
            "fisik": 0.0,
            "subsidi_admin": 0.0,
            "non_subsidi_admin": 0.0,
            "status": defaultdict(int),
        }

        for key in area_keys:
            agg = provinsi_map[key]
            kapasitas = agg["kapasitas"]
            # "Belum ada data" hanya boleh muncul bila memang tidak ada satu pun
            # gudang di provinsi itu yang punya baris stok pada tanggal tersebut.
            has_data = agg["dengan_data"] > 0
            ratio = (
                (agg["admin_terhitung"] / kapasitas)
                if (kapasitas > 0 and has_data)
                else None
            )
            sisa = (
                (kapasitas - agg["admin_terhitung"])
                if (kapasitas > 0 and has_data)
                else None
            )
            status = occupancy_status(agg["admin_terhitung"], kapasitas, has_data)

            write_summary_row(
                [
                    key[0],
                    key[1],
                    agg["gudang"],
                    kapasitas,
                    agg["subsidi_admin"],
                    agg["non_subsidi_admin"],
                    agg["admin"],
                    agg["admin_terhitung"],
                    agg["fisik"],
                    ratio if ratio is not None else "—",
                    sisa if sisa is not None else "—",
                    agg["status"].get("ok", 0),
                    agg["status"].get("warn", 0),
                    agg["status"].get("low", 0),
                    agg["status"].get("full", 0),
                    agg["status"].get("na", 0),
                    agg["status"].get("none", 0),
                ],
                row_index,
                status=status,
            )
            row_index += 1

            area_total["gudang"] += agg["gudang"]
            area_total["dengan_data"] += agg["dengan_data"]
            area_total["kapasitas"] += kapasitas
            area_total["admin"] += agg["admin"]
            area_total["admin_terhitung"] += agg["admin_terhitung"]
            area_total["fisik"] += agg["fisik"]
            area_total["subsidi_admin"] += agg["subsidi_admin"]
            area_total["non_subsidi_admin"] += agg["non_subsidi_admin"]
            for status_key, count in agg["status"].items():
                area_total["status"][status_key] += count

        area_has_data = area_total["dengan_data"] > 0
        area_ratio = (
            (area_total["admin_terhitung"] / area_total["kapasitas"])
            if (area_total["kapasitas"] > 0 and area_has_data)
            else None
        )
        area_sisa = (
            (area_total["kapasitas"] - area_total["admin_terhitung"])
            if (area_total["kapasitas"] > 0 and area_has_data)
            else None
        )
        area_status = occupancy_status(
            area_total["admin_terhitung"], area_total["kapasitas"], area_has_data
        )
        write_summary_row(
            [
                f"Total {area}",
                "",
                area_total["gudang"],
                area_total["kapasitas"],
                area_total["subsidi_admin"],
                area_total["non_subsidi_admin"],
                area_total["admin"],
                area_total["admin_terhitung"],
                area_total["fisik"],
                area_ratio if area_ratio is not None else "—",
                area_sisa if area_sisa is not None else "—",
                area_total["status"].get("ok", 0),
                area_total["status"].get("warn", 0),
                area_total["status"].get("low", 0),
                area_total["status"].get("full", 0),
                area_total["status"].get("na", 0),
                area_total["status"].get("none", 0),
            ],
            row_index,
            fill_hex=navy_soft,
            font=total_font,
            merge_label=True,
        )
        row_index += 1

        grand["gudang"] += area_total["gudang"]
        grand["dengan_data"] += area_total["dengan_data"]
        grand["kapasitas"] += area_total["kapasitas"]
        grand["admin"] += area_total["admin"]
        grand["admin_terhitung"] += area_total["admin_terhitung"]
        grand["fisik"] += area_total["fisik"]
        grand["subsidi_admin"] += area_total["subsidi_admin"]
        grand["non_subsidi_admin"] += area_total["non_subsidi_admin"]
        for status_key, count in area_total["status"].items():
            grand["status"][status_key] += count

    grand_has_data = grand["dengan_data"] > 0
    grand_ratio = (
        (grand["admin_terhitung"] / grand["kapasitas"])
        if (grand["kapasitas"] > 0 and grand_has_data)
        else None
    )
    grand_sisa = (
        (grand["kapasitas"] - grand["admin_terhitung"])
        if (grand["kapasitas"] > 0 and grand_has_data)
        else None
    )
    write_summary_row(
        [
            "TOTAL NASIONAL",
            "",
            grand["gudang"],
            grand["kapasitas"],
            grand["subsidi_admin"],
            grand["non_subsidi_admin"],
            grand["admin"],
            grand["admin_terhitung"],
            grand["fisik"],
            grand_ratio if grand_ratio is not None else "—",
            grand_sisa if grand_sisa is not None else "—",
            grand["status"].get("ok", 0),
            grand["status"].get("warn", 0),
            grand["status"].get("low", 0),
            grand["status"].get("full", 0),
            grand["status"].get("na", 0),
            grand["status"].get("none", 0),
        ],
        row_index,
        fill_hex=navy,
        font=Font(name="Calibri", size=10, bold=True, color="FFFFFF"),
        merge_label=True,
    )

    summary_widths = {
        "A": 13,
        "B": 20,
        "C": 10,
        "D": 14,
        "E": 14,
        "F": 16,
        "G": 14,
        "H": 19,
        "I": 14,
        "J": 10,
        "K": 14,
        "L": 8,
        "M": 9,
        "N": 7,
        "O": 7,
        "P": 12,
        "Q": 12,
    }
    for col, width in summary_widths.items():
        ws.column_dimensions[col].width = width

    ws.freeze_panes = "A6"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{header_row}:{header_row}"

    # ==================== Sheet 2: Detail Gudang ====================
    ws = wb.create_sheet("Detail Gudang")
    ws.sheet_properties.tabColor = "00B0B9"

    group_count = len(groups)
    base_col_count = 7
    admin_start = base_col_count + 1
    subsidi_col = admin_start + group_count
    non_subsidi_col = subsidi_col + 1
    admin_total_col = non_subsidi_col + 1
    fisik_start = admin_total_col + 1
    fisik_total_col = fisik_start + group_count
    p_col = fisik_total_col + 1
    status_col = p_col + 1
    sisa_col = status_col + 1
    last_col = sisa_col

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_col)
    cell = ws.cell(row=1, column=1, value="DETAIL KETERISIAN GUDANG")
    cell.font = title_font
    cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 24

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_col)
    cell = ws.cell(
        row=2,
        column=1,
        value=(
            f"Tanggal data: {format_tanggal_id(tanggal)}  |  "
            "Keterisian = stok admin ÷ kapasitas  |  Stok admin = (stok fisik − outstanding SO) + intransit"
        ),
    )
    cell.font = subtitle_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_col)
    cell = ws.cell(
        row=3,
        column=1,
        value=(
            "Gudang tanpa kapasitas tetap ditampilkan dan diurutkan paling bawah pada setiap provinsi. "
            "Kode plant yang sudah digabung ke gudang fisik yang sama bernilai kapasitas 0 agar tidak dihitung dua kali."
        ),
    )
    cell.font = note_font
    cell.alignment = Alignment(horizontal="left", vertical="center")

    detail_headers = [
        "Wilayah",
        "Provinsi",
        "Kabupaten/Kota",
        "Kode Plant",
        "Nama Gudang",
        "Jumlah Plant",
        "Kapasitas\n(t)",
    ]
    detail_headers += [f"Stok Admin\n{grup}\n(t)" for grup in groups]
    detail_headers += [
        "Stok Subsidi\n(t)",
        "Stok Non Subsidi\n(t)",
        "Stok Admin\nTotal (t)",
    ]
    detail_headers += [f"Stok Fisik\n{grup}\n(t)" for grup in groups]
    detail_headers += [
        "Stok Fisik\nTotal (t)",
        "Keterisian",
        "Status",
        "Sisa Ruang\n(t)",
    ]

    header_row = 5
    for col, label in enumerate(detail_headers, start=1):
        cell = ws.cell(row=header_row, column=col, value=label)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    ws.row_dimensions[header_row].height = 52

    zebra_fill = PatternFill("solid", fgColor="F7F9FC")
    prev_provinsi = None
    zebra = False

    for offset, row in enumerate(rows):
        row_index = header_row + 1 + offset
        if row["provinsi"] != prev_provinsi:
            prev_provinsi = row["provinsi"]
            zebra = not zebra
        row_fill = zebra_fill if zebra else None

        values = [
            row["area"],
            row["provinsi"],
            row["kabupaten"],
            row["kode_plants"],
            row["nama"],
            row["jumlah_plant"],
            row["kapasitas"],
        ]
        values += [row["admin_by_grup"][grup] for grup in groups]
        values += [
            row["subsidi_admin"],
            row["non_subsidi_admin"],
            row["total_admin"],
        ]
        values += [row["fisik_by_grup"][grup] for grup in groups]
        values += [
            row["total_fisik"],
            row["ratio"] if row["ratio"] is not None else "—",
            OCCUPANCY_STATUS_LABEL[row["status"]],
            row["sisa"] if row["sisa"] is not None else "—",
        ]

        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row_index, column=col, value=value)
            cell.border = border
            cell.font = body_font
            if row_fill:
                cell.fill = row_fill

            if col in (1, 4, 6):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col in (2, 3, 5):
                cell.alignment = Alignment(horizontal="left", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="right", vertical="center")

            angka_ton = (
                col in (7, admin_total_col, fisik_total_col, sisa_col)
                or subsidi_col <= col <= non_subsidi_col
                or admin_start <= col < admin_start + group_count
                or fisik_start <= col < fisik_start + group_count
            )
            if col == 6:
                cell.number_format = "0"
            elif angka_ton:
                if isinstance(value, (int, float)):
                    cell.number_format = "#,##0.0"
                if col == sisa_col and isinstance(value, (int, float)) and value < 0:
                    cell.font = Font(name="Calibri", size=10, bold=True, color="9C0006")
            elif col == p_col:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if isinstance(value, (int, float)):
                    cell.number_format = "0.0%"

        # Warna status.
        fill_hex_status, font_hex_status = OCCUPANCY_STATUS_STYLE[row["status"]]
        status_cell = ws.cell(row=row_index, column=status_col)
        status_cell.fill = PatternFill("solid", fgColor=fill_hex_status)
        status_cell.font = Font(
            name="Calibri", size=10, bold=True, color=font_hex_status
        )
        status_cell.alignment = Alignment(horizontal="center", vertical="center")

        # Sel keterisian tanpa angka dibuat netral.
        if row["ratio"] is None:
            p_cell = ws.cell(row=row_index, column=p_col)
            p_cell.fill = PatternFill("solid", fgColor="F2F2F2")
            p_cell.font = Font(name="Calibri", size=10, color="808080")

    last_row = header_row + len(rows)
    if rows:
        ws.auto_filter.ref = f"A{header_row}:{get_column_letter(last_col)}{last_row}"
        ws.conditional_formatting.add(
            f"{get_column_letter(p_col)}{header_row + 1}:"
            f"{get_column_letter(p_col)}{last_row}",
            DataBarRule(
                start_type="num",
                start_value=0,
                end_type="num",
                end_value=1.2,
                color="5B9BD5",
                showValue=True,
            ),
        )

    detail_widths = {
        "A": 12,
        "B": 20,
        "C": 20,
        "D": 16,
        "E": 34,
        "F": 10,
        "G": 12,
    }
    for col in range(1, last_col + 1):
        letter = get_column_letter(col)
        ws.column_dimensions[letter].width = detail_widths.get(letter, 13)
    ws.column_dimensions[get_column_letter(p_col)].width = 11
    ws.column_dimensions[get_column_letter(status_col)].width = 16
    ws.column_dimensions[get_column_letter(sisa_col)].width = 14

    ws.freeze_panes = "G6"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{header_row}:{header_row}"

    # ==================== Sheet 3: Metodologi ====================
    ws = wb.create_sheet("Metodologi")
    ws.sheet_properties.tabColor = "808080"
    ws.column_dimensions["A"].width = 118

    ws.merge_cells("A1:A1")
    cell = ws.cell(row=1, column=1, value="METODOLOGI & DEFINISI")
    cell.font = title_font
    ws.row_dimensions[1].height = 24

    notes = [
        f"Tanggal data: {format_tanggal_id(tanggal)}.",
        "Keterisian = stok admin seluruh pupuk berton ÷ kapasitas gudang. Nilai >100% berarti stok melebihi kapasitas.",
        "Stok admin = (stok fisik − outstanding SO) + intransit.",
        "Stok admin total = subsidi + non subsidi. Keduanya ditampilkan terpisah agar angka keterisian bisa diaudit.",
        "Pupuk cair (satuan liter) TIDAK dihitung dalam keterisian karena satuannya berbeda dari kapasitas (ton). Golongan ini tetap tampil di kolom per golongan.",
        "Produk non subsidi digabung menjadi satu golongan “Non Subsidi”; rincian per kode material tetap tersimpan di data mentah SAP.",
        "Kapasitas gudang multi-plant = jumlah kapasitas seluruh kode plant-nya. Kode plant kedua yang merujuk gudang fisik yang sama diberi kapasitas 0 agar tidak double count.",
        "Hanya gudang aktif yang dicentang pada halaman Lingkup Nasional yang masuk laporan. Gudang nonaktif atau tidak dicentang tidak dihitung.",
        "Rasio provinsi/nasional hanya memakai stok gudang yang memiliki kapasitas; stok gudang tanpa kapasitas tetap ditampilkan di kolom Stok Admin tetapi tidak masuk pembilang rasio.",
        "Gudang dengan kapasitas 0 tetap ditampilkan dengan status “Tanpa kapasitas” dan diurutkan paling bawah.",
        "Gudang dengan kapasitas >0 tetapi belum punya baris stok berton pada tanggal tersebut berstatus “Belum ada data”.",
        "Stok admin digunakan sebagai dasar utama keterisian; stok fisik ditampilkan sebagai pembanding.",
        "",
        "Ambang status:",
        "  ≤ 70%          : Lega",
        "  70% – <90%     : Waspada",
        "  90% – 100%     : Kritis",
        "  > 100%         : Penuh",
        "  Kapasitas 0    : Tanpa kapasitas",
        "  Belum ada data : Belum ada baris stok berton pada tanggal tersebut",
        "",
        "Sumber data: hasil kalkulasi stok harian (StockCalculation), master gudang, master material, dan peta kapasitas plant.",
    ]
    for idx, text in enumerate(notes, start=3):
        cell = ws.cell(row=idx, column=1, value=text)
        cell.font = bold_font if text.endswith(":") else body_font
        cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        ws.row_dimensions[idx].height = 20 if text else 12

    # Tabel definisi status dengan warna. Ditempatkan di kolom B/C karena kolom A
    # dipakai catatan panjang (lebar 118), agar label tidak menjadi bar warna raksasa.
    status_row = len(notes) + 4
    ws.cell(row=status_row, column=2, value="Status").font = bold_font
    ws.cell(row=status_row, column=3, value="Arti").font = bold_font
    status_defs = [
        ("Lega", "Terisi ≤ 70% kapasitas", "ok"),
        ("Waspada", "Terisi 70% – <90% kapasitas", "warn"),
        ("Kritis", "Terisi 90% – 100% kapasitas", "low"),
        ("Penuh", "Terisi > 100% kapasitas", "full"),
        ("Tanpa kapasitas", "Kapasitas gudang belum ada di master", "na"),
        ("Belum ada data", "Belum ada baris stok pada tanggal tersebut", "none"),
    ]
    for idx, (label, meaning, status_key) in enumerate(status_defs, start=status_row + 1):
        fill_hex_status, font_hex_status = OCCUPANCY_STATUS_STYLE[status_key]
        cell_status = ws.cell(row=idx, column=2, value=label)
        cell_status.fill = PatternFill("solid", fgColor=fill_hex_status)
        cell_status.font = Font(name="Calibri", size=10, bold=True, color=font_hex_status)
        cell_status.alignment = Alignment(horizontal="center", vertical="center")
        cell_meaning = ws.cell(row=idx, column=3, value=meaning)
        cell_meaning.font = body_font
        cell_meaning.alignment = Alignment(horizontal="left", vertical="center")
    ws.column_dimensions["B"].width = 20
    ws.column_dimensions["C"].width = 52

    return wb
