"""Test agregasi dashboard peta (tanpa database, plus satu cek rekonsiliasi).

Jalankan dari folder ``backend``::

    python -m unittest discover -s tests -v
"""

import unittest
from datetime import date

from app.core.plant_directory import FACTORY_PLANTS
from app.services.peta_aggregate import (
    FilterPeta,
    GudangData,
    PlantStock,
    SoLine,
    StockLine,
    aggregate_peta,
    classify_material,
    keterisian_status,
)


def gudang(
    gid,
    *,
    provinsi="ACEH",
    kota="KOTA LHOKSEUMAWE",
    kapasitas=100.0,
    stock=(),
    so=(),
    anper=(),
    aktif=True,
    nasional=True,
):
    return GudangData(
        id=gid,
        nama=f"Gudang {gid}",
        provinsi=provinsi,
        kota=kota,
        kode_kab=None,
        kapasitas=kapasitas,
        plants=(f"P{gid}",),
        anper=frozenset(anper),
        is_active=aktif,
        is_national_included=nasional,
        stock=list(stock),
        so=list(so),
        has_stock_rows=bool(stock),
    )


def baris(kategori, fisik, status=None, satuan="TON", intransit=0.0):
    return StockLine(
        kategori=kategori,
        status=status,
        satuan=satuan,
        fisik=fisik,
        intransit=intransit,
    )


def so(kategori, qty, material_code=None, status=None):
    return SoLine(
        jenis_pupuk=kategori,
        kategori=kategori,
        status=status,
        material_code=material_code,
        qty=qty,
    )


class KapasitasTest(unittest.TestCase):
    def test_kapasitas_dihitung_sekali_walau_banyak_produk(self):
        data = aggregate_peta(
            [gudang(1, stock=[baris("Urea", 30), baris("NPK", 20)])],
            [],
            FilterPeta(),
        )
        kpi = data["kpi"]
        self.assertEqual(kpi["kapasitas"], 100.0)
        self.assertEqual(kpi["stok_fisik"], 50.0)
        self.assertAlmostEqual(kpi["keterisian_admin"], 0.5)

    def test_filter_produk_tidak_mengubah_penyebut(self):
        data = aggregate_peta(
            [gudang(1, stock=[baris("Urea", 30), baris("NPK", 20)])],
            [],
            FilterPeta(produk=frozenset({"Urea"})),
        )
        kpi = data["kpi"]
        self.assertEqual(kpi["kapasitas"], 100.0)
        self.assertEqual(kpi["stok_fisik"], 30.0)
        self.assertAlmostEqual(kpi["keterisian_admin"], 0.3)

    def test_kapasitas_nol_menjadi_na(self):
        data = aggregate_peta(
            [gudang(1, kapasitas=0, stock=[baris("Urea", 10)])],
            [],
            FilterPeta(),
        )
        kpi = data["kpi"]
        self.assertIsNone(kpi["keterisian_admin"])
        self.assertIsNone(kpi["sisa_ruang"])
        self.assertEqual(kpi["status"], "na")

    def test_produk_gudang_mengikuti_filter_dan_satuan_ton(self):
        data = aggregate_peta(
            [
                gudang(
                    1,
                    stock=[
                        baris("Urea", 30),
                        baris("NPK", 20),
                        baris("Organik Cair", 999, satuan="L"),
                    ],
                )
            ],
            [],
            FilterPeta(produk=frozenset({"Urea"})),
        )
        node = data["levels"]["gudang"][0]
        self.assertEqual(node["produk"], ["Urea"])

    def test_produk_gudang_tanpa_filter_terurut_dan_tanpa_liter(self):
        data = aggregate_peta(
            [
                gudang(
                    1,
                    stock=[
                        baris("Urea", 30),
                        baris("NPK", 20),
                        baris("Organik Cair", 999, satuan="L"),
                    ],
                )
            ],
            [],
            FilterPeta(),
        )
        node = data["levels"]["gudang"][0]
        self.assertEqual(node["produk"], ["NPK", "Urea"])


class FilterTest(unittest.TestCase):
    def setUp(self):
        self.gudang = gudang(
            1,
            stock=[
                baris("Urea", 10, "SUBSIDI"),
                baris("Urea", 5, "NON SUBSIDI"),
                baris("NPK", 7, "SUBSIDI"),
                baris("NPK", 3, "NON SUBSIDI"),
                baris("Organik Cair", 999, "SUBSIDI", satuan="L"),
            ],
        )

    def test_produk_dan_subsidi_dikombinasikan(self):
        data = aggregate_peta(
            [self.gudang],
            [],
            FilterPeta(
                produk=frozenset({"Urea", "NPK"}),
                subsidi="SUBSIDI",
            ),
        )
        self.assertEqual(data["kpi"]["stok_fisik"], 17.0)

    def test_urea_non_subsidi_saja(self):
        data = aggregate_peta(
            [self.gudang],
            [],
            FilterPeta(produk=frozenset({"Urea"}), subsidi="NON_SUBSIDI"),
        )
        self.assertEqual(data["kpi"]["stok_fisik"], 5.0)

    def test_liter_tidak_masuk_ton(self):
        data = aggregate_peta([self.gudang], [], FilterPeta())
        self.assertEqual(data["kpi"]["stok_fisik"], 25.0)

    def test_gudang_di_luar_lingkup_nasional_dikecualikan(self):
        data = aggregate_peta(
            [
                gudang(1, stock=[baris("Urea", 10)]),
                gudang(2, stock=[baris("Urea", 90)], nasional=False),
                gudang(3, stock=[baris("Urea", 90)], aktif=False),
            ],
            [],
            FilterPeta(),
        )
        self.assertEqual(data["kpi"]["stok_fisik"], 10.0)
        self.assertEqual(data["meta"]["gudang_scope"], 1)

    def test_filter_anper(self):
        data = aggregate_peta(
            [
                gudang(1, stock=[baris("Urea", 10)], anper=("PIM",)),
                gudang(2, stock=[baris("Urea", 90)], anper=("PKG",)),
            ],
            [],
            FilterPeta(anper=frozenset({"PIM"})),
        )
        self.assertEqual(data["kpi"]["stok_fisik"], 10.0)
        self.assertEqual(data["meta"]["gudang_scope"], 1)

    def test_scope_provinsi_dan_kabupaten(self):
        data = aggregate_peta(
            [
                gudang(1, provinsi="ACEH", kota="KOTA A", stock=[baris("Urea", 10)]),
                gudang(2, provinsi="ACEH", kota="KOTA B", stock=[baris("Urea", 20)]),
                gudang(3, provinsi="JAMBI", kota="KOTA C", stock=[baris("Urea", 30)]),
            ],
            [],
            FilterPeta(provinsi="ACEH", kabupaten="KOTA B"),
        )
        self.assertEqual(data["kpi"]["stok_fisik"], 20.0)


class OutstandingTest(unittest.TestCase):
    def test_so_lengkap_saat_semua_status(self):
        data = aggregate_peta(
            [
                gudang(
                    1,
                    stock=[baris("Urea", 100, "SUBSIDI")],
                    so=[so("Urea", 20)],
                )
            ],
            [],
            FilterPeta(produk=frozenset({"Urea"})),
        )
        kpi = data["kpi"]
        self.assertEqual(kpi["outstanding_so"], 20.0)
        self.assertEqual(kpi["stok_admin"], 80.0)
        self.assertTrue(data["meta"]["so_lengkap"])

    def test_so_tidak_dipisah_tanpa_material_code(self):
        data = aggregate_peta(
            [
                gudang(
                    1,
                    stock=[baris("Urea", 100, "SUBSIDI")],
                    so=[so("Urea", 20)],
                )
            ],
            [],
            FilterPeta(produk=frozenset({"Urea"}), subsidi="SUBSIDI"),
        )
        kpi = data["kpi"]
        self.assertIsNone(kpi["outstanding_so"])
        self.assertIsNone(kpi["stok_admin"])
        self.assertFalse(data["meta"]["so_lengkap"])
        self.assertTrue(data["meta"]["warnings"])
        self.assertFalse(data["ranking"]["tersedia"])
        self.assertEqual(data["ranking"]["penuh"], [])

    def test_ranking_fisik_tetap_tersedia(self):
        data = aggregate_peta(
            [
                gudang(
                    1,
                    stock=[baris("Urea", 100, "SUBSIDI")],
                    so=[so("Urea", 20)],
                )
            ],
            [],
            FilterPeta(
                produk=frozenset({"Urea"}),
                subsidi="SUBSIDI",
                indikator="keterisian_fisik",
            ),
        )
        self.assertTrue(data["ranking"]["tersedia"])
        self.assertEqual(len(data["ranking"]["penuh"]), 1)

    def test_so_dipisah_saat_material_code_tersedia(self):
        data = aggregate_peta(
            [
                gudang(
                    1,
                    stock=[baris("Urea", 100, "SUBSIDI")],
                    so=[
                        so("Urea", 10, material_code="1000031", status="SUBSIDI"),
                        so("Urea", 5, material_code="1000030", status="NON SUBSIDI"),
                    ],
                )
            ],
            [],
            FilterPeta(produk=frozenset({"Urea"}), subsidi="SUBSIDI"),
        )
        self.assertEqual(data["kpi"]["outstanding_so"], 10.0)
        self.assertEqual(data["kpi"]["stok_admin"], 90.0)


class AgregasiLevelTest(unittest.TestCase):
    def test_total_gudang_sama_dengan_provinsi_dan_kpi(self):
        data = aggregate_peta(
            [
                gudang(1, provinsi="ACEH", kota="KOTA A", stock=[baris("Urea", 10)]),
                gudang(2, provinsi="ACEH", kota="KOTA B", stock=[baris("Urea", 20)]),
                gudang(3, provinsi="JAMBI", kota="KOTA C", stock=[baris("Urea", 30)]),
            ],
            [],
            FilterPeta(),
        )
        total_gudang = sum(node["stok_fisik"] for node in data["levels"]["gudang"])
        total_provinsi = sum(node["stok_fisik"] for node in data["levels"]["provinsi"])
        total_kabupaten = sum(node["stok_fisik"] for node in data["levels"]["kabupaten"])
        self.assertEqual(total_gudang, data["kpi"]["stok_fisik"])
        self.assertEqual(total_provinsi, data["kpi"]["stok_fisik"])
        self.assertEqual(total_kabupaten, data["kpi"]["stok_fisik"])

    def test_ranking_top_10_dan_terurut(self):
        gudangs = [
            gudang(
                gid,
                provinsi="ACEH",
                kota=f"KOTA {gid:02d}",
                kapasitas=100,
                stock=[baris("Urea", gid * 5)],
            )
            for gid in range(1, 13)
        ]
        data = aggregate_peta(gudangs, [], FilterPeta())
        penuh = data["ranking"]["penuh"]
        self.assertEqual(len(penuh), 10)
        nilai = [item["nilai"] for item in penuh]
        self.assertEqual(nilai, sorted(nilai, reverse=True))
        self.assertEqual(penuh[0]["kota"], "KOTA 12")

    def test_pabrik_hanya_pupuk(self):
        kode_pabrik = sorted(FACTORY_PLANTS)[0]
        plants = [
            PlantStock(kode_pabrik, "Urea", "SUBSIDI", "TON", 500, 50, True),
            PlantStock("X999", "Lainnya", None, "TON", 9999, 0, False),
        ]
        data = aggregate_peta([], plants, FilterPeta())
        pabrik = data["pabrik"]
        self.assertEqual(pabrik["pabrik"]["fisik"], 500.0)
        self.assertEqual(pabrik["pabrik"]["intransit"], 50.0)
        self.assertEqual(pabrik["belum_terpetakan"]["fisik"], 0.0)
        self.assertEqual(pabrik["total"]["fisik"], 500.0)


class KlasifikasiTest(unittest.TestCase):
    def test_reject_jadi_non_subsidi(self):
        kategori, status, satuan, pupuk = classify_material(
            "9999999", "UREA REJECT"
        )
        self.assertEqual(kategori, "Urea")
        self.assertEqual(status, "NON SUBSIDI")
        self.assertEqual(satuan, "TON")
        self.assertTrue(pupuk)

    def test_material_non_pupuk_bukan_pupuk(self):
        _, _, _, pupuk = classify_material("1000238", "Listrik")
        self.assertFalse(pupuk)


class StatusTest(unittest.TestCase):
    def test_ambang_sesuai_spec(self):
        kasus = [
            (0.70, "ok"),
            (0.7001, "warn"),
            (0.90, "warn"),
            (0.9001, "low"),
            (1.00, "low"),
            (1.0001, "full"),
        ]
        for ratio, harapan in kasus:
            with self.subTest(ratio=ratio):
                self.assertEqual(keterisian_status(ratio), harapan)

    def test_ambang_bisa_diubah(self):
        self.assertEqual(keterisian_status(0.75, (80, 90, 100)), "ok")


class RekonsiliasiDatabaseTest(unittest.TestCase):
    """Cocokkan hasil service dengan fixture laporan Excel 6 November 2026.

    Dilewati otomatis bila database tidak tersedia.
    """

    @classmethod
    def setUpClass(cls):
        import json
        from pathlib import Path

        cls.fixture = json.loads(
            (Path(__file__).parent / "fixtures" / "rekonsiliasi_2026_11_06.json").read_text(
                encoding="utf-8"
            )
        )
        try:
            from app.core.database import SessionLocal
            from app.services.peta_aggregate import load_peta_data

            cls.db = SessionLocal()
            cls.tanggal = date.fromisoformat(cls.fixture["tanggal"])
            cls.gudangs, cls.plant_stocks, cls.produk, cls.anper = load_peta_data(
                cls.db, cls.tanggal
            )
        except Exception as exc:  # noqa: BLE001 - tanpa DB, test ini dilewati
            raise unittest.SkipTest(f"Database tidak tersedia: {exc}")

    @classmethod
    def tearDownClass(cls):
        db = getattr(cls, "db", None)
        if db is not None:
            db.close()

    def _kpi(self, **filter_kwargs):
        data = aggregate_peta(
            self.gudangs,
            self.plant_stocks,
            FilterPeta(**filter_kwargs),
        )
        return data, data["kpi"]

    def test_nasional_sesuai_fixture(self):
        acuan = self.fixture["nasional"]
        _, kpi = self._kpi()
        self.assertEqual(kpi["kapasitas"], acuan["kapasitas"])
        self.assertAlmostEqual(kpi["stok_fisik"], acuan["stok_fisik"], places=2)
        self.assertAlmostEqual(kpi["stok_admin"], acuan["stok_admin"], places=2)
        self.assertAlmostEqual(
            kpi["keterisian_admin"], acuan["keterisian_admin"], places=5
        )

    def test_sumatera_selatan_sesuai_fixture(self):
        acuan = self.fixture["sumatera_selatan"]
        _, kpi = self._kpi(provinsi="SUMATERA SELATAN")
        self.assertEqual(kpi["kapasitas"], acuan["kapasitas"])
        self.assertAlmostEqual(
            kpi["keterisian_admin"], acuan["keterisian_admin"], places=5
        )

    def test_kabupaten_sesuai_fixture(self):
        acuan = self.fixture["kabupaten"]
        _, kpi = self._kpi(provinsi=acuan["provinsi"], kabupaten=acuan["nama"])
        self.assertEqual(kpi["kapasitas"], acuan["kapasitas"])
        self.assertAlmostEqual(kpi["stok_fisik"], acuan["stok_fisik"], places=2)
        self.assertAlmostEqual(kpi["outstanding_so"], acuan["outstanding_so"], places=2)
        self.assertAlmostEqual(
            kpi["keterisian_admin"], acuan["keterisian_admin"], places=5
        )

    def test_default_tidak_memotong_so(self):
        _, kpi = self._kpi()
        self.assertIsNotNone(kpi["outstanding_so"])
        self.assertAlmostEqual(
            kpi["outstanding_so"],
            self.fixture["nasional"]["outstanding_so"],
            places=2,
        )


if __name__ == "__main__":
    unittest.main()
