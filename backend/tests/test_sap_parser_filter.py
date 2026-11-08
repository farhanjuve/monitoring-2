"""Test penyaringan material saat upload MB52.

Aturan yang diuji:
- material terdaftar di master -> masuk stok;
- deskripsi mengandung "reject" -> tetap masuk (grup Non Subsidi);
- material non-pupuk (listrik, steam, bahan baku, dst.) -> diabaikan;
- satuan selain TON/L (KWH, M3, dst.) -> diabaikan.
"""

import unittest
from datetime import date
from io import BytesIO

import pandas as pd

from app.services.sap_parser import parse_mb52


def buat_mb52(baris) -> bytes:
    """Buat file MB52 kecil di memori dengan kolom wajib parser."""
    df = pd.DataFrame(baris)
    buf = BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


def baris(plant, material, deskripsi, nilai, satuan="TON", transit_transfer=0.0):
    return {
        "Plant": plant,
        "Material": material,
        "Material Description": deskripsi,
        "Unrestricted": nilai,
        "Base Unit of Measure": satuan,
        "Storage Location": "0001",
        "Stock in Transit": 0,
        "Transit and Transfer": transit_transfer,
    }


class FilterMaterialTest(unittest.TestCase):
    def setUp(self):
        data = [
            baris("B001", "1000036", "Urea SUB @50 KG", 100.0, transit_transfer=12.5),
            baris("B001", "1000030", "Urea PRL NS CRH", 50.0),
            baris("B001", "1003170", "UREA REJECT", 10.0),
            baris("B001", "1000238", "Listrik", 9999.0, "KWH"),
            baris("B001", "1000892", "PUPUK MIKRO; NUTREMAG", 5.0),
        ]
        self.peringatan = []
        self.rows = parse_mb52(
            buat_mb52(data), date(2026, 11, 5), warning_sink=self.peringatan
        )

    def test_hanya_material_pupuk_yang_disimpan(self):
        self.assertEqual(len(self.rows), 3)

    def test_kategori_dari_kode_material(self):
        jenis = {row["material_code"]: row["jenis_pupuk"] for row in self.rows}
        self.assertEqual(jenis["1000036"], "Urea")
        self.assertEqual(jenis["1000030"], "Non Subsidi")

    def test_reject_ikut_dihitung(self):
        reject = [row for row in self.rows if "REJECT" in (row["material_desc"] or "")]
        self.assertEqual(len(reject), 1)
        self.assertEqual(reject[0]["jenis_pupuk"], "Non Subsidi")

    def test_listrik_dan_material_non_pupuk_dibuang(self):
        deskripsi = {row["material_desc"] for row in self.rows}
        self.assertNotIn("Listrik", deskripsi)
        self.assertNotIn("PUPUK MIKRO; NUTREMAG", deskripsi)

    def test_transit_transfer_ikut_terbaca(self):
        diterima = [row for row in self.rows if row["material_code"] == "1000036"]
        self.assertEqual(len(diterima), 1)
        self.assertAlmostEqual(diterima[0]["transit_transfer"], 12.5)

    def test_nilai_hanya_dari_baris_yang_lolos(self):
        total = sum(row["unrestricted"] for row in self.rows)
        self.assertAlmostEqual(total, 160.0)

    def test_peringatan_menyebut_jumlah_baris_diabaikan(self):
        gabung = " ".join(self.peringatan)
        self.assertIn("1 baris diabaikan karena bukan material pupuk", gabung)
        self.assertIn("1 baris diabaikan karena satuannya", gabung)


class KonversiKilogramTest(unittest.TestCase):
    """Baris KG harus dikonversi ke ton, bukan dijumlahkan apa adanya."""

    def setUp(self):
        self.peringatan = []
        self.rows = parse_mb52(
            buat_mb52([
                baris("B001", "1000036", "Urea SUB @50 KG", 2500.0, "KG"),
            ]),
            date(2026, 11, 5),
            warning_sink=self.peringatan,
        )

    def test_nilai_kg_dibagi_seribu(self):
        self.assertEqual(len(self.rows), 1)
        self.assertAlmostEqual(self.rows[0]["unrestricted"], 2.5)

    def test_peringatan_konversi_disebut(self):
        self.assertIn("KG dikonversi ke ton", " ".join(self.peringatan))


class KolomMaterialWajibTest(unittest.TestCase):
    """Tanpa kolom Material, klasifikasi subsidi/non subsidi tidak bisa dipercaya."""

    def test_file_tanpa_kolom_material_ditolak(self):
        tanpa_material = [
            {
                "Plant": "B001",
                "Material Description": "Urea SUB @50 KG",
                "Unrestricted": 10.0,
                "Base Unit of Measure": "TON",
                "Storage Location": "0001",
            }
        ]
        with self.assertRaises(ValueError) as ctx:
            parse_mb52(buat_mb52(tanpa_material), date(2026, 11, 5))
        self.assertIn("Material", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
