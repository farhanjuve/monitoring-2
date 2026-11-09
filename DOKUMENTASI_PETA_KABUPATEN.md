# Dokumentasi Peta Kabupaten — Phase 0 s.d. Selesai

Dokumen ini merangkum pekerjaan **Phase 0 (audit data & fixture)**, **Phase 1 (backend agregasi)**, dan **Phase 2 (frontend dashboard)** untuk halaman `/peta-kabupaten`, termasuk hal yang sudah selesai, batasan yang masih ada, dan pekerjaan lanjutan yang direncanakan.

- **Status:** Phase 0, 1, dan 2 selesai dan tervalidasi.
- **Commit:** `d116dd8` — `feat: dashboard peta kabupaten interaktif dan agregasi Anper/SO`
- **Terakhir diverifikasi:** 9 November 2026
- **Snapshot acuan rekonsiliasi:** 6 November 2026

---

## 1. Ringkasan eksekutif

Halaman `/peta-kabupaten` diubah dari peta kapasitas statis menjadi dashboard interaktif yang dapat dikonfigurasi. Seluruh angka KPI, warna peta, ranking, tooltip, drawer, dan Stok Pabrik berasal dari satu endpoint agregasi:

```text
GET /api/peta/aggregate
```

Prinsip utama:

1. **Satu sumber angka.** Peta, KPI, ranking, dan drawer tidak menghitung ulang secara terpisah.
2. **Kapasitas dihitung sekali per gudang.** Kapasitas tidak mengecil ketika filter produk/subsidi aktif.
3. **Stok Pabrik dipisah.** Stok pabrik selalu berskala nasional dan tidak dicampur ke KPI gudang.
4. **Filter yang tidak tersedia tidak ditebak.** Lini II/III dan SO historis per produk/subsidi ditampilkan sebagai peringatan, bukan angka palsu.
5. **Rekonsiliasi dikunci.** Angka nasional, Sumatera Selatan, dan OKU Timur untuk 6 November 2026 diuji otomatis.

---

## 2. Ruang lingkup

### Yang diubah

- `frontend/app/peta-kabupaten/page.tsx`
- `frontend/components/peta/KabupatenMap.tsx`
- `frontend/components/peta/DashboardConfigPanel.tsx` (baru)
- `frontend/lib/dashboard-config.ts` (baru)
- `frontend/lib/peta-aggregate.ts` (baru)
- `frontend/app/peta-kabupaten/peta.css` (penyesuaian tema/status)
- Backend: model, migrasi, service agregasi, route, importer Anper, parser SO, test, fixture

### Yang tidak diubah

- Halaman `/` dan komponen `MapDashboard`.
- Tema gelap, layout map-first, panel kiri, drawer, zoom, pencarian, dan ekspor Excel tetap dipertahankan.

---

## 3. Phase 0 — Audit data & fixture

### 3.1 Tujuan

- Memastikan sumber data dan definisi angka resmi sebelum membangun UI.
- Menemukan celah data yang membuat filter tertentu tidak dapat dihitung.
- Membuat angka rekonsiliasi yang bisa dipakai sebagai regression test.

### 3.2 Sumber data yang diaudit

| Sumber | Fungsi |
|---|---|
| MB52 / `sap_stock` | Stok fisik dan intransit per plant/material |
| ZSD_SODO / `sap_outstanding_do` | Outstanding SO per plant |
| `plant_capacity` | Kapasitas fisik gudang per kode plant |
| CSV Anper | Relasi gudang dengan Anper yang dilayani |
| Master material | Klasifikasi produk, subsidi/non subsidi, dan satuan |

### 3.3 Temuan utama

- Cakupan Anper: **771 dari 814 plant** memiliki data Anper.
- Impor Anper menghasilkan **489 gudang** dan **766 relasi gudang–Anper**.
- Denominator kapasitas nasional: **1.792.165,46 ton** dari **501 gudang**.
- Beberapa gudang memiliki lebih dari satu Anper (mis. PKG dan PSP), sehingga relasi disimpan di tabel terpisah.
- Satuan liter tidak boleh dicampur ke total ton. Nilai liter dicatat sebagai pengecualian di metadata.
- Nama wilayah tidak konsisten antarsumber (huruf besar/kecil, spasi), sehingga pencocokan memakai normalisasi kunci.
- SO lama belum memiliki `material_code`, sehingga pemisahan SO per produk/subsidi belum dapat dilakukan untuk data historis.

### 3.4 Keputusan angka resmi

```text
Total Stok      = Stok Fisik + Intransit
Stok Admin      = Stok Fisik − Outstanding SO + Intransit
Sisa Ruang      = Kapasitas − Stok Admin
Keterisian      = Stok / Kapasitas
```

Aturan tambahan:

- Kapasitas `0` menghasilkan rasio `null` (N/A), bukan pembagian tak hingga.
- Rasio dikirim sebagai pecahan `0..1`; ambang warna dikirim dalam persen.
- Ambang default: **≤70% Lega**, **70–90% Waspada**, **90–100% Kritis**, **>100% Penuh**.
- Indikator persentase memakai `status_indikator` dari backend.
- Indikator ton memakai kuantil lokal 25/50/75 karena tidak punya ambang resmi.
- `kapasitas_tersisa` memakai skala terbalik: ruang tersisa sedikit = warna lebih kritis.

### 3.5 Output Phase 0

- Fixture rekonsiliasi: `backend/tests/fixtures/rekonsiliasi_2026_11_06.json`.
- Angka acuan:
  - Nasional: kapasitas **1.792.165,46 t**, fisik **1.236.405,29 t**, admin **1.173.805,99 t**.
  - Sumatera Selatan: **8 gudang**, kapasitas **23.350 t**, admin **20.368,55 t**, rasio **87,23%**.
  - Kab. OKU Timur: **2 gudang**, kapasitas **6.800 t**, admin **8.727 t**, rasio **128,34%**, sisa ruang **−1.927 t**.

### 3.6 Status

**Selesai.** Audit dan fixture sudah dipakai oleh test backend.

---

## 4. Phase 1 — Backend agregasi

### 4.1 Perubahan utama

| File | Peran |
|---|---|
| `backend/alembic_migrations/versions/9f4c1a7b2d10_add_anper_and_so_material.py` | Migrasi tabel `warehouse_anper` dan kolom `material_code` |
| `backend/app/models/models.py` | Model `WarehouseAnper`, kolom `SAPOutstandingDO.material_code` |
| `backend/scripts/import_anper.py` | Importer relasi gudang–Anper dan kapasitas per Anper |
| `backend/app/services/peta_aggregate.py` | Mesin agregasi KPI, level wilayah, ranking, pabrik, metadata |
| `backend/app/api/routes/peta.py` | Endpoint `GET /api/peta/aggregate` |
| `backend/app/services/sap_parser.py` | Menyimpan nomor material SO |
| `backend/tests/test_peta_aggregate.py` | Test agregasi dan rekonsiliasi |
| `backend/tests/test_sap_parser_filter.py` | Test `material_code` pada parser SO |

### 4.2 Kontrak endpoint

```text
GET /api/peta/aggregate
```

Parameter:

| Parameter | Keterangan |
|---|---|
| `tanggal` | Tanggal snapshot (`YYYY-MM-DD`); default tanggal stok terbaru |
| `produk` | Daftar kategori produk dipisah koma |
| `subsidi` | `SEMUA`, `SUBSIDI`, atau `NON_SUBSIDI` |
| `anper` | Daftar Anper dipisah koma |
| `lini` | Diterima, tetapi belum tersedia |
| `provinsi` | Filter provinsi |
| `kabupaten` | Filter kabupaten/kota |
| `gudang_id` | Filter satu gudang |
| `indikator` | Indikator peta/KPI aktif |
| `lega`, `waspada`, `kritis` | Ambang warna dalam persen |

Response utama:

- `filters` — filter yang benar-benar dipakai.
- `kpi` — kapasitas, stok fisik, intransit, total stok, stok admin, outstanding SO, sisa ruang, dan rasio.
- `levels.provinsi`, `levels.kabupaten`, `levels.gudang` — node peta dan drawer.
- `ranking.penuh` dan `ranking.kosong` — Top 10 sesuai filter.
- `pabrik` — stok pabrik nasional dan kontribusinya.
- `meta` — cakupan gudang, sumber, basis kapasitas, satuan, status kelengkapan SO, dan peringatan.

### 4.3 Semantik penting

- Filter produk/subsidi mempersempit **stok**, tetapi kapasitas tetap penuh per gudang.
- Filter Anper dan wilayah mempersempit **gudang**.
- Produk dan subsidi digabung dengan logika `AND`.
- `meta.pabrik_scope = "nasional"`: pabrik mengikuti produk/subsidi, tetapi mengabaikan filter wilayah.
- Jika SO lama tidak lengkap dan filter subsidi aktif, KPI admin/SO dan ranking admin menjadi `N/A` dengan alasan yang jelas.
- Ranking memakai level aktif:
  - tanpa filter wilayah → kabupaten,
  - filter provinsi → kabupaten di provinsi tersebut,
  - filter kabupaten → gudang.

### 4.4 Validasi backend

```powershell
cd backend
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

Hasil: **82 test lulus**, termasuk rekonsiliasi nasional, Sumatera Selatan, dan OKU Timur.

### 4.5 Batasan yang masih ada

- **Lini II/III** belum memiliki sumber data. Filter tetap dinonaktifkan dengan peringatan.
- **SO historis per produk/subsidi** belum tersedia karena baris lama memiliki `material_code` NULL. Diperlukan unggah ulang ZSD_SODO.
- Kapasitas per Anper tersimpan, tetapi keterisian resmi memakai kapasitas fisik gudang agar tidak terjadi penghitungan ganda.

### 4.6 Status

**Selesai.** Backend menjadi satu sumber angka untuk seluruh tampilan.

---

## 5. Phase 2 — Frontend dashboard

### 5.1 Model konfigurasi

Satu objek `DashboardConfig` menyimpan:

```text
tanggal, produk[], subsidi, anper[], lini[],
provinsi, kabupaten, indikator, thresholds[3]
```

Konfigurasi diserialisasi ke:

- **URL** — agar tautan dapat dibagikan dan filter dapat dipulihkan.
- **localStorage** — kunci `peta-kabupaten:config:v1` untuk kunjungan berikutnya.
- **Preset tersimpan** — kunci `peta-kabupaten:presets:v1`, berlaku lokal di browser.

### 5.2 Fitur yang sudah berjalan

#### Filter global

- Tanggal snapshot.
- Produk (multi-pilih).
- Subsidi / non subsidi.
- Anper PIM, PKT, PKG, PSP, PKC.
- Provinsi dan kabupaten/kota.
- Chip filter aktif dan tombol hapus/reset.
- Opsi wilayah diambil dari panggilan agregat tanpa filter agar tidak mengecil setelah memilih.

#### KPI

- Kapasitas.
- Stok fisik.
- Intransit.
- Total stok.
- Stok admin.
- Outstanding SO.
- Sisa ruang.
- Persentase keterisian.
- Nilai `N/A` ketika kapasitas nol atau SO tidak lengkap.

#### Peta

- Indikator: Keterisian Fisik, Total, Admin, Kapasitas Tersisa, Total Stok Fisik, Outstanding SO.
- Tooltip mengikuti indikator aktif.
- Warna persentase mengikuti ambang backend.
- Warna ton memakai kuantil lokal.
- Legenda berubah sesuai indikator dan ambang.
- Zoom, reset tampilan, pencarian, dan klik wilayah ke drawer tetap berfungsi.

#### Ranking

- Tab **Paling Penuh** dan **Ruang Kosong**.
- Top 10 mengikuti filter aktif.
- Warna ranking mengikuti indikator rasio yang aktif.
- Ranking disembunyikan dengan alasan jika SO tidak lengkap.

#### Stok Pabrik

- Selalu berlabel **Nasional** dan **di luar KPI gudang**.
- Menampilkan fisik, intransit, jumlah plant, dan kontribusi.
- Kontribusi dihitung terhadap **stok gudang cakupan + pabrik nasional**, bukan sekadar total SAP.
- Tidak pernah masuk ke KPI gudang.

#### Preset

- Preset A–E:
  - A · Ringkasan Nasional
  - B · Stok Fisik
  - C · Pupuk Subsidi
  - D · Non Subsidi
  - E · Ambang Ketat
- Preset kustom: simpan, terapkan, hapus.
- Nama preset yang sama menimpa preset lama.
- Reset semua filter.

#### Mode laporan

- Menyembunyikan konfigurasi, pencarian, dan chip.
- Membuka panel ringkasan.
- Di layar kecil, panel ringkasan dibuka otomatis.
- Tombol “Keluar Laporan” mengembalikan tampilan normal.

#### State dan responsivitas

- Loading, kosong, dan error ditangani.
- Panel konfigurasi dapat ditutup.
- Drawer menampilkan ringkasan wilayah dan daftar gudang.
- Sumber data dan basis kapasitas ditampilkan di panel ringkasan serta tooltip header.

### 5.3 Validasi frontend

```powershell
cd frontend
node node_modules\typescript\bin\tsc --noEmit --incremental false
cmd /c npm run build
```

Hasil:

- Typecheck bersih.
- Build produksi sukses; `/peta-kabupaten` menghasilkan sekitar **16,4 kB** halaman.
- Tidak ada error console saat halaman dimuat dan digunakan.

Uji manual yang sudah dilakukan:

| Skenario | Hasil |
|---|---|
| Nasional 6 Nov 2026 | 501 gudang, kapasitas 1.792.165,5 t, admin 1.173.806 t, rasio 65,5% |
| Filter Sumatera Selatan | 8 gudang, kapasitas 23.350 t, admin 20.368,55 t, rasio 87,23% |
| Kab. OKU Timur | 2 gudang, rasio admin 128,3%, sisa ruang −1.927 t |
| Indikator stok fisik | Legenda kuantil muncul dan warna peta berubah |
| Filter subsidi | SO/admin N/A, ranking disembunyikan, peringatan tampil |
| Threshold 50/90/100 | Legenda, warna, URL, dan localStorage berubah; Default memulihkan 70/90/100 |
| Preset kustom | Simpan, terapkan, dan hapus berhasil |
| Report mode | Konfigurasi tersembunyi, ringkasan terbuka |
| Drawer | Nilai kapasitas, admin, SO, sisa ruang, dan daftar gudang sesuai fixture |
| URL/localStorage | Filter bertahan setelah reload; reset mengembalikan default |

### 5.4 Status

**Selesai.** Phase 2 sudah di-commit dan siap dipakai.

---

## 6. Phase 3 — Pekerjaan lanjutan

Prioritas berikutnya, diurutkan dari yang paling berdampak.

### P0 — Kelengkapan data SO

- Unggah ulang ZSD_SODO yang menyertakan `material_code` untuk seluruh baris historis.
- Setelah itu, aktifkan KPI admin/SO dan ranking per produk/subsidi.
- Tambahkan validasi impor yang menolak atau menandai file SO tanpa `material_code`.

### P1 — Sumber data Lini II/III

- Cari dan sepakati sumber data lini.
- Tambahkan pemetaan lini ke gudang/plant.
- Aktifkan filter lini beserta test rekonsiliasi.
- Sampai data tersedia, filter tetap nonaktif dengan peringatan.

### P2 — Penguatan frontend

- Tambahkan label aksesibilitas pada input ambang warna.
- Tambahkan test komponen/end-to-end untuk preset, threshold, report mode, dan drawer.
- Uji responsif di perangkat nyata (mobile/tablet), termasuk buka-tutup drawer dan panel.
- Tinjau performa render peta saat filter berubah cepat (debounce/abort request bila perlu).

### P3 — Peningkatan lanjutan

- Ekspor ranking dan ringkasan KPI ke Excel/PDF.
- Dukungan preset yang dapat dibagikan lintas browser (mis. server-side preset).
- Opsi cakupan pabrik per wilayah bila dibutuhkan.
- Audit ulang angka kapasitas ketika ada pembaruan master gudang.
- Pertimbangkan satu sumber kebenaran untuk logika ambang (backend vs frontend) agar tidak ada duplikasi aturan warna.

---

## 7. Peta file penting

```text
backend/
  alembic_migrations/versions/9f4c1a7b2d10_add_anper_and_so_material.py
  app/api/routes/peta.py
  app/models/models.py
  app/services/peta_aggregate.py
  app/services/sap_parser.py
  scripts/import_anper.py
  tests/fixtures/rekonsiliasi_2026_11_06.json
  tests/test_peta_aggregate.py
  tests/test_sap_parser_filter.py

frontend/
  app/peta-kabupaten/page.tsx
  app/peta-kabupaten/peta.css
  components/peta/KabupatenMap.tsx
  components/peta/DashboardConfigPanel.tsx
  lib/dashboard-config.ts
  lib/peta-aggregate.ts
  lib/kabupaten.ts
```

---

## 8. Cara menjalankan

### Backend

```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn api.index:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
cmd /c npm run dev
```

Buka:

```text
http://localhost:3000/peta-kabupaten?tanggal=2026-11-06
```

### Test backend

```powershell
cd backend
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

### Typecheck dan build frontend

```powershell
cd frontend
node node_modules\typescript\bin\tsc --noEmit --incremental false
cmd /c npm run build
```

---

## 9. Checklist penutup

### Selesai

- [x] Audit sumber data dan definisi angka resmi.
- [x] Fixture rekonsiliasi 6 November 2026.
- [x] Migrasi `warehouse_anper` dan `material_code`.
- [x] Importer Anper.
- [x] Service agregasi KPI, level, ranking, dan pabrik.
- [x] Endpoint `/api/peta/aggregate`.
- [x] Dashboard konfigurasi dengan URL/localStorage.
- [x] Filter produk, subsidi, Anper, provinsi, kabupaten.
- [x] KPI lengkap dengan `N/A` yang jelas.
- [x] Enam indikator peta dan legenda dinamis.
- [x] Ranking Top 10 “Paling Penuh” dan “Ruang Kosong”.
- [x] Stok Pabrik terpisah dan berlabel nasional.
- [x] Preset A–E dan preset kustom.
- [x] Mode laporan dan state loading/kosong/error.
- [x] Typecheck, build, dan 82 test backend lulus.

### Belum selesai / menunggu data

- [ ] Unggah ulang ZSD_SODO dengan `material_code`.
- [ ] Sumber data Lini II/III.
- [ ] Test frontend otomatis (component/e2e).
- [ ] Audit responsif perangkat nyata.
- [ ] Ekspor ranking/KPI di luar Excel yang sudah ada.
