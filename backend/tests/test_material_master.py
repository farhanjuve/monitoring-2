"""Test master material: klasifikasi berbasis kode, status subsidi, dan satuan.

Jalankan dari folder `backend`:

    python -m unittest discover -s tests -v
"""

import csv
import json
import unittest
from pathlib import Path

from app.core.material_master import (
    GRUP_CAIR,
    GRUP_NON_SUBSIDI,
    grup_material,
    grup_tampilan,
    klasifikasi_deskripsi,
    load_material_master,
    normalize_material_code,
    periksa_satuan,
    satuan_grup,
)

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "materialcode2.csv"
JSON_PATH = ROOT / "backend" / "app" / "core" / "data" / "material_master.json"


class MasterMaterialTest(unittest.TestCase):
    def test_master_terbaca(self):
        master = load_material_master()
        self.assertEqual(len(master), 147)
        for kode, info in master.items():
            self.assertTrue(kode.isdigit() and len(kode) == 7, kode)
            self.assertIn(info["status"], {"SUBSIDI", "NON SUBSIDI"})
            self.assertIn(info["satuan"], {"TON", "L"})

    def test_salinan_json_sama_dengan_csv(self):
        if not CSV_PATH.exists():
            self.skipTest("materialcode2.csv tidak tersedia")
        with CSV_PATH.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle, delimiter=";"))
        master = load_material_master()
        self.assertEqual(len(rows), len(master))
        for row in rows:
            kode = row["Material"].strip()
            self.assertIn(kode, master, f"{kode} hilang dari master")

    def test_normalisasi_kode(self):
        self.assertEqual(normalize_material_code(" 1000036 "), "1000036")
        self.assertEqual(normalize_material_code("1000036.0"), "1000036")
        self.assertEqual(normalize_material_code(None), "")


class GrupTampilanTest(unittest.TestCase):
    def test_urea_subsidi_tetap_urea(self):
        self.assertEqual(grup_material("1000036"), "Urea")

    def test_urea_non_subsidi_masuk_non_subsidi(self):
        self.assertEqual(grup_material("1000030"), GRUP_NON_SUBSIDI)

    def test_pupuk_cair_dipisah_lebih_dulu(self):
        # 1001865 bersubsidi, tetapi satuannya liter sehingga tetap dipisah.
        self.assertEqual(grup_material("1001865"), GRUP_CAIR)
        self.assertEqual(grup_material("1001820"), GRUP_CAIR)

    def test_npk_kakao_tetap_kategori_sendiri(self):
        self.assertEqual(grup_material("1001751"), "NPK Kakao")

    def test_urutan_aturan_satuan_sebelum_status(self):
        self.assertEqual(
            grup_tampilan("Organik Cair", "L", "NON SUBSIDI"), GRUP_CAIR
        )
        self.assertEqual(
            grup_tampilan("Urea", "TON", "NON SUBSIDI"), GRUP_NON_SUBSIDI
        )
        self.assertEqual(grup_tampilan("Urea", "TON", "SUBSIDI"), "Urea")

    def test_satuan_grup(self):
        self.assertEqual(satuan_grup(GRUP_CAIR), "L")
        self.assertEqual(satuan_grup("Urea"), "TON")

    def test_kode_tak_dikenal_dan_bukan_pupuk_diabaikan(self):
        self.assertIsNone(grup_material("", "KCL 60"))
        self.assertIsNone(grup_material("", "Listrik"))
        self.assertIsNone(grup_material("1000238", "Listrik"))

    def test_reject_tetap_dihitung_sebagai_non_subsidi(self):
        self.assertEqual(grup_material("", "UREA REJECT"), GRUP_NON_SUBSIDI)
        self.assertEqual(grup_material("", "NPK Reject 15-10-12 NS"), GRUP_NON_SUBSIDI)
        self.assertEqual(grup_material("1003170", "UREA REJECT"), GRUP_NON_SUBSIDI)


class SatuanTest(unittest.TestCase):
    def test_satuan_cocok_tidak_ada_peringatan(self):
        self.assertIsNone(periksa_satuan("1000036", "TON"))
        self.assertIsNone(periksa_satuan("1001865", "L"))

    def test_satuan_beda_memberi_peringatan(self):
        pesan = periksa_satuan("1001865", "TON")
        self.assertIsNotNone(pesan)
        self.assertIn("1001865", pesan)

    def test_kode_tak_dikenal_tidak_diperiksa(self):
        self.assertIsNone(periksa_satuan("9999999", "TON"))


if __name__ == "__main__":
    unittest.main()
