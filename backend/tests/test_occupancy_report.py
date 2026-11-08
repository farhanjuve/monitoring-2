"""Test laporan keterisian gudang (tanpa database).

Jalankan dari folder `backend`:

    python -m unittest discover -s tests -v
"""

import unittest
from datetime import date
from io import BytesIO
from types import SimpleNamespace

from openpyxl import load_workbook

from app.services.occupancy_report import (
    build_occupancy_rows,
    build_occupancy_workbook,
    occupancy_status,
    summarize_by_province,
)


def make_warehouse(wid, provinsi, kota, nama, kode_plants):
    return SimpleNamespace(
        id=wid,
        provinsi=provinsi,
        kota=kota,
        nama_gudang=nama,
        plants=[SimpleNamespace(kode_plant=kode) for kode in kode_plants],
    )


def make_calc(gudang_id, tipe_pupuk, stok_admin, stok_fisik):
    return SimpleNamespace(
        gudang_id=gudang_id,
        tipe_pupuk=tipe_pupuk,
        stok_admin=stok_admin,
        stok_fisik=stok_fisik,
    )


KAPASITAS = {"B1": 100.0, "B2": 50.0, "B3": 25.0}

WAREHOUSES = [
    make_warehouse(1, "ACEH", "KOTA LHOKSEUMAWE", "Lhokseumawe", ["B1", "B2"]),
    make_warehouse(2, "ACEH", "KAB. ACEH BESAR", "Aceh Besar", ["B3"]),
    make_warehouse(3, "JAWA BARAT", "KAB. BOGOR", "Bogor", ["B4"]),
]

CALCS = [
    make_calc(1, "Urea", 60.0, 70.0),
    make_calc(1, "NPK", 40.0, 45.0),
]


class StatusKeterisianTest(unittest.TestCase):
    def test_kapasitas_nol_selalu_tanpa_kapasitas(self):
        self.assertEqual(occupancy_status(0.0, 0.0, True), "na")
        self.assertEqual(occupancy_status(500.0, 0.0, True), "na")

    def test_gudang_belum_punya_baris_stok(self):
        self.assertEqual(occupancy_status(0.0, 100.0, False), "none")

    def test_ambang_batas(self):
        kasus = [
            (0.0, "ok"),
            (69.9, "ok"),
            (70.0, "warn"),
            (89.9, "warn"),
            (90.0, "low"),
            (100.0, "low"),
            (100.1, "full"),
        ]
        for total_admin, diharapkan in kasus:
            with self.subTest(total_admin=total_admin):
                self.assertEqual(occupancy_status(total_admin, 100.0, True), diharapkan)


class BarisLaporanTest(unittest.TestCase):
    def setUp(self):
        self.rows, self.ferts = build_occupancy_rows(WAREHOUSES, CALCS, KAPASITAS)
        self.by_name = {row["nama"]: row for row in self.rows}

    def test_kapasitas_gudang_multi_plant_dijumlahkan(self):
        self.assertEqual(self.by_name["Lhokseumawe"]["kapasitas"], 150.0)
        self.assertEqual(self.by_name["Lhokseumawe"]["jumlah_plant"], 2)

    def test_kode_plant_tidak_terpetakan_berkapasitas_nol(self):
        self.assertEqual(self.by_name["Bogor"]["kapasitas"], 0.0)
        self.assertEqual(self.by_name["Bogor"]["status"], "na")

    def test_stok_dirinci_per_pupuk_dan_totalnya_gabungan(self):
        row = self.by_name["Lhokseumawe"]
        self.assertEqual(row["admin_by_grup"]["Urea"], 60.0)
        self.assertEqual(row["admin_by_grup"]["NPK"], 40.0)
        self.assertEqual(row["total_admin"], 100.0)
        self.assertEqual(row["total_fisik"], 115.0)

    def test_gudang_tanpa_data_tidak_punya_rasio(self):
        row = self.by_name["Aceh Besar"]
        self.assertEqual(row["status"], "none")
        self.assertIsNone(row["ratio"])
        self.assertIsNone(row["sisa"])
        self.assertFalse(row["has_data"])

    def test_urutan_baris_mengikuti_wilayah_lalu_provinsi(self):
        urutan = [row["nama"] for row in self.rows]
        # Sumatera (ACEH) sebelum Jawa; di dalam ACEH, status lebih kritis dulu.
        self.assertEqual(urutan, ["Lhokseumawe", "Aceh Besar", "Bogor"])

    def test_jenis_pupuk_mengikuti_urutan_baku(self):
        self.assertEqual(self.ferts, ["Urea", "NPK"])


class PupukCairTest(unittest.TestCase):
    """Pupuk cair bersatuan liter tidak boleh masuk hitungan kapasitas (ton)."""

    def setUp(self):
        warehouses = [make_warehouse(1, "ACEH", "KOTA LHOKSEUMAWE", "Lhokseumawe", ["B1"])]
        calcs = [
            make_calc(1, "Urea", 60.0, 60.0),
            make_calc(1, "Non Subsidi", 30.0, 30.0),
            make_calc(1, "Organik Cair", 500.0, 500.0),
        ]
        self.rows, self.groups = build_occupancy_rows(warehouses, calcs, {"B1": 100.0})
        self.row = self.rows[0]

    def test_pupuk_cair_tidak_masuk_total_ton(self):
        self.assertEqual(self.row["total_admin"], 90.0)
        self.assertEqual(self.row["admin_by_grup"]["Organik Cair"], 500.0)

    def test_pemisahan_subsidi_dan_non_subsidi(self):
        self.assertEqual(self.row["subsidi_admin"], 60.0)
        self.assertEqual(self.row["non_subsidi_admin"], 30.0)
        self.assertEqual(
            self.row["subsidi_admin"] + self.row["non_subsidi_admin"],
            self.row["total_admin"],
        )

    def test_keterisian_hanya_dari_pupuk_berton(self):
        self.assertAlmostEqual(self.row["ratio"], 0.9)
        self.assertEqual(self.row["status"], "low")

    def test_urutan_grup(self):
        self.assertEqual(self.groups, ["Urea", "Organik Cair", "Non Subsidi"])

    def test_gudang_hanya_punya_data_cair_dianggap_belum_ada_data(self):
        warehouses = [make_warehouse(1, "ACEH", "KOTA", "Gudang Cair", ["B1"])]
        calcs = [make_calc(1, "Organik Cair", 500.0, 500.0)]
        rows, _ = build_occupancy_rows(warehouses, calcs, {"B1": 100.0})
        self.assertFalse(rows[0]["has_data"])
        self.assertIsNone(rows[0]["ratio"])
        self.assertEqual(rows[0]["status"], "none")


class RekapProvinsiTest(unittest.TestCase):
    def setUp(self):
        rows, _ = build_occupancy_rows(WAREHOUSES, CALCS, KAPASITAS)
        self.rekap = summarize_by_province(rows)

    def test_agregasi_per_provinsi(self):
        aceh = self.rekap[("Sumatera", "ACEH")]
        self.assertEqual(aceh["gudang"], 2)
        self.assertEqual(aceh["dengan_data"], 1)
        self.assertEqual(aceh["kapasitas"], 175.0)
        self.assertEqual(aceh["admin"], 100.0)
        self.assertEqual(aceh["admin_terhitung"], 100.0)
        self.assertEqual(aceh["status"]["ok"], 1)
        self.assertEqual(aceh["status"]["none"], 1)

    def test_provinsi_tanpa_kapasitas(self):
        jabar = self.rekap[("Jawa", "JAWA BARAT")]
        self.assertEqual(jabar["kapasitas"], 0.0)
        self.assertEqual(jabar["admin"], 0.0)
        self.assertEqual(jabar["admin_terhitung"], 0.0)
        self.assertEqual(jabar["status"]["na"], 1)


class RasioTanpaKapasitasTest(unittest.TestCase):
    """Stok gudang tanpa kapasitas tidak boleh menggelembungkan rasio."""

    def test_stok_tanpa_kapasitas_tidak_masuk_pembilang(self):
        warehouses = [
            make_warehouse(1, "ACEH", "KOTA", "Ber kapasitas", ["B1"]),
            make_warehouse(2, "ACEH", "KOTA", "Tanpa kapasitas", ["B9"]),
        ]
        calcs = [
            make_calc(1, "Urea", 50.0, 50.0),
            make_calc(2, "Urea", 500.0, 500.0),
        ]
        rows, _ = build_occupancy_rows(warehouses, calcs, {"B1": 100.0})
        rekap = summarize_by_province(rows)[("Sumatera", "ACEH")]

        self.assertEqual(rekap["admin"], 550.0)
        self.assertEqual(rekap["admin_terhitung"], 50.0)
        self.assertEqual(rekap["kapasitas"], 100.0)


class WorkbookTest(unittest.TestCase):
    def setUp(self):
        rows, ferts = build_occupancy_rows(WAREHOUSES, CALCS, KAPASITAS)
        self.rows = rows
        self.provinsi_map = summarize_by_province(rows)
        # Dulu baris total melempar AttributeError karena menulis ke sel hasil merge.
        workbook = build_occupancy_workbook(
            date(2026, 11, 4), rows, ferts, self.provinsi_map
        )
        stream = BytesIO()
        workbook.save(stream)
        stream.seek(0)
        self.wb = load_workbook(stream)

    def test_tiga_sheet(self):
        self.assertEqual(
            self.wb.sheetnames, ["Ringkasan Provinsi", "Detail Gudang", "Metodologi"]
        )

    def test_baris_total_nasional(self):
        ws = self.wb["Ringkasan Provinsi"]
        baris = [
            row
            for row in ws.iter_rows(min_row=6, max_col=17, values_only=True)
            if row[0] == "TOTAL NASIONAL"
        ]
        self.assertEqual(len(baris), 1)
        self.assertEqual(baris[0][2], 3)       # jumlah gudang
        self.assertEqual(baris[0][3], 175.0)   # kapasitas
        self.assertEqual(baris[0][6], 100.0)   # stok admin
        self.assertEqual(baris[0][7], 100.0)   # stok admin berkapasitas

    def test_baris_total_di_merge(self):
        ws = self.wb["Ringkasan Provinsi"]
        nomor = next(
            row[0].row
            for row in ws.iter_rows(min_row=6, max_col=1)
            if row[0].value == "TOTAL NASIONAL"
        )
        rentang = {str(r) for r in ws.merged_cells.ranges}
        self.assertIn(f"A{nomor}:B{nomor}", rentang)

    def test_detail_memuat_kolom_per_pupuk(self):
        ws = self.wb["Detail Gudang"]
        header = [cell.value for cell in ws[5]]
        self.assertIn("Stok Admin\nUrea\n(t)", header)
        self.assertIn("Stok Admin\nNPK\n(t)", header)
        self.assertIn("Stok Subsidi\n(t)", header)
        self.assertIn("Stok Non Subsidi\n(t)", header)
        self.assertIn("Stok Admin\nTotal (t)", header)
        self.assertEqual(ws.max_row - 5, len(self.rows))

    def test_detail_nilai_subsidi_dan_total(self):
        ws = self.wb["Detail Gudang"]
        header = [cell.value for cell in ws[5]]
        subsidi = header.index("Stok Subsidi\n(t)")
        non_subsidi = header.index("Stok Non Subsidi\n(t)")
        total = header.index("Stok Admin\nTotal (t)")
        baris = list(ws.iter_rows(min_row=6, values_only=True))[0]
        self.assertEqual(baris[subsidi] + baris[non_subsidi], baris[total])

    def test_ringkasan_memuat_kolom_subsidi(self):
        ws = self.wb["Ringkasan Provinsi"]
        header = [cell.value for cell in ws[5]]
        self.assertEqual(
            header[:9],
            [
                "Wilayah",
                "Provinsi",
                "Jumlah Gudang",
                "Kapasitas (t)",
                "Stok Subsidi (t)",
                "Stok Non Subsidi (t)",
                "Stok Admin (t)",
                "Stok Admin Berkapasitas (t)",
                "Stok Fisik (t)",
            ],
        )

    def test_status_tertulis_dalam_bahasa_indonesia(self):
        ws = self.wb["Detail Gudang"]
        header = [cell.value for cell in ws[5]]
        kolom_status = header.index("Status")
        nilai = {row[kolom_status] for row in ws.iter_rows(min_row=6, values_only=True)}
        self.assertEqual(nilai, {"Lega", "Belum ada data", "Tanpa kapasitas"})


if __name__ == "__main__":
    unittest.main()
