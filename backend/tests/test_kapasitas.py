"""Test peta kapasitas gudang.

Fokus: salinan backend harus identik dengan sumber tunggal di frontend, supaya
angka Excel tidak menyimpang dari angka peta kabupaten.
"""

import json
import unittest
from pathlib import Path

from app.core.kapasitas import load_kapasitas

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_JSON = ROOT / "frontend" / "lib" / "kapasitas-gudang.json"
BACKEND_JSON = ROOT / "backend" / "app" / "core" / "data" / "kapasitas_gudang.json"


class PetaKapasitasTest(unittest.TestCase):
    def test_peta_terbaca_sebagai_angka(self):
        peta = load_kapasitas()
        self.assertGreater(len(peta), 100)
        self.assertTrue(all(isinstance(nilai, float) for nilai in peta.values()))
        self.assertGreater(sum(peta.values()), 0)

    def test_salinan_backend_sama_dengan_sumber_frontend(self):
        if not FRONTEND_JSON.exists():
            self.skipTest("folder frontend tidak tersedia (deployment backend)")
        self.assertEqual(
            json.loads(FRONTEND_JSON.read_text(encoding="utf-8")),
            json.loads(BACKEND_JSON.read_text(encoding="utf-8")),
            "Peta kapasitas backend tidak sinkron. Jalankan: python scripts/sync_kapasitas.py",
        )


if __name__ == "__main__":
    unittest.main()
