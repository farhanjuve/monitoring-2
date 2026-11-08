"""Test rekomendasi lingkup perhitungan nasional (tanpa database)."""

import unittest

from app.core.national_scope import (
    default_included,
    exclusion_reasons,
    kategori_tampilan,
)


class RekomendasiLingkupTest(unittest.TestCase):
    def test_gudang_daerah_biasa_masuk(self):
        self.assertTrue(default_included(["B401"]))
        self.assertEqual(exclusion_reasons(["B401"]), [])
        self.assertEqual(kategori_tampilan(["B401"]), "gudang")

    def test_kode_101_dikecualikan(self):
        for kode in ("B101", "D101", "C101", "E101", "F101"):
            with self.subTest(kode=kode):
                self.assertFalse(default_included([kode]))
                self.assertTrue(
                    any("101" in alasan for alasan in exclusion_reasons([kode]))
                )

    def test_kode_7xx_dikecualikan(self):
        for kode in ("B701", "D703", "F710"):
            with self.subTest(kode=kode):
                self.assertFalse(default_included([kode]))
                self.assertTrue(
                    any("7xx" in alasan or "pelabuhan" in alasan
                        for alasan in exclusion_reasons([kode]))
                )

    def test_plant_pabrik_dan_kantor_dikecualikan(self):
        self.assertFalse(default_included(["C101"]))  # pabrik di direktori
        self.assertTrue(
            any("pabrik" in alasan for alasan in exclusion_reasons(["C101"]))
        )
        self.assertFalse(default_included(["B601"]))  # kantor
        self.assertTrue(
            any("kantor" in alasan for alasan in exclusion_reasons(["B601"]))
        )

    def test_multi_plant_cukup_satu_yang_dikecualikan(self):
        kode = ["B401", "D101"]
        self.assertFalse(default_included(kode))
        self.assertEqual(len(exclusion_reasons(kode)), 1)

    def test_kode_kosong_tidak_dianggap_alasan(self):
        self.assertTrue(default_included([]))
        self.assertEqual(exclusion_reasons([None, "", "  "]), [])

    def test_label_kategori(self):
        self.assertEqual(kategori_tampilan(["B101"]), "lini pabrik")
        self.assertEqual(kategori_tampilan(["B701"]), "pelabuhan")
        self.assertEqual(kategori_tampilan(["C101"]), "pabrik")
        self.assertEqual(kategori_tampilan(["B601"]), "kantor")


if __name__ == "__main__":
    unittest.main()
