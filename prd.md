\# PRD — Project Requirements Document



\## 1. Overview

Aplikasi ini dibangun untuk menggantikan proses pelaporan stok pupuk bersubsidi (Urea \& NPK) dan foto CCTV gudang yang saat ini masih dilakukan secara manual. Tim harus mengekspor data dari SAP (file MB52 dan zsd\_sodo), menghitung manual menggunakan Pivot/Rumus di Excel, lalu screenshot angka hasil hitungan, menggabungkannya ke PowerPoint, dan menambahkan foto CCTV harian. Proses ini memakan waktu, rentan human error, dan menyulitkan pencarian data cepat.



\*\*Tujuan utama:\*\* Menyediakan dashboard terintegrasi yang otomatis memproses data SAP, menghitung metrik stok secara real-time, menampilkan 2 foto CCTV per gudang, serta menyediakan antar muka pencarian instan. Aplikasi ini bertujuan mewujudkan "satu sumber kebenaran", menghilangkan pekerjaan hitung-menghitung manual, dan mempercepat penyusunan laporan harian.



\## 2. Requirements

\*\*Persyaratan Fungsional:\*\*

\- Upload dan parsing file MB52 serta zsd\_sodo dari SAP.

\- Kalkulasi otomatis: Stok Fisik, Outstanding SO, Stok Admin Tanpa Intransit, Intransit, Stok Admin.

\- Upload \& manajemen foto CCTV (maks. 2 foto per gudang) dengan penandaan tanggal/waktu.

\- Tampilan dashboard ringkasan stok per gudang (Urea \& NPK) yang terupdate otomatis.

\- Fitur pencarian dan filter cepat berdasarkan nama/kode gudang, tanggal, atau jenis pupuk.

\- Catatan riwayat upload dan perubahan data untuk keperluan audit.



\*\*Persyaratan Non-Fungsional:\*\*

\- Responsif dan ringan: dashboard utama termuat dalam waktu <2 detik.

\- Keamanan: autentikasi pengguna, kontrol akses berbasis peran, dan enkripsi data sensitif.

\- Skalabilitas: menggunakan TiDB untuk mendukung pertumbuhan data gudang nasional tanpa penurunan performa.

\- Kemudahan penggunaan: antarmuka intuitif, tidak memerlukan pengetahuan Excel atau rumus manual.

\- Kelola file: penyimpanan foto CCTV di cloud storage terpisah agar tidak membebani database inti.



\## 3. Core Features

\- \*\*Dashboard Stok Gudang:\*\* Tabel interaktif \& kartu ringkasan menampilkan 5 metrik utama stok (Fisik, SO, Admin Tanpa Intransit, Intransit, Admin) untuk Urea dan NPK, dikelompokkan per gudang.

\- \*\*Galeri CCTV Terpadu:\*\* Tampilan 2 foto CCTV per gudang yang dapat diupload secara berkala, ditagging dengan tanggal pelaporan, dan dapat diperbesar (zoom) untuk keperluan verifikasi.

\- \*\*Mesin Upload \& Hitung Otomatis:\*\* Formulir drag-and-drop untuk file MB52 dan zsd\_sodo. Sistem secara otomatis memvalidasi format, mengekstrak data, dan menjalankan rumus stok tanpa intervensi pengguna.

\- \*\*Pencarian \& Filter Instan:\*\* Box pencarian global dengan autofill nama gudang, filter rentang tanggal, dan toggle jenis pupuk untuk memunculkan data target dalam hitungan detik.

\- \*\*Log Aktivitas \& Audit Trail:\*\* Riwayat lengkap setiap file yang diupload, perubahan angka stok, dan pembaruan foto CCTV, mencakup ID pengunggah, waktu, dan aksi yang dilakukan.



\## 4. User Flow

1\. \*\*Login:\*\* Pengguna masuk dengan kredensial terotorisasi.

2\. \*\*Akses Dashboard:\*\* Melihat ringkasan stok seluruh gudang untuk hari/tanggal pilihan.

3\. \*\*Upload Data:\*\* Klik tombol "Upload Data SAP" → pilih file MB52/zsd\_sodo → sistem memproses \& memberikan notifikasi sukses/gagal.

4\. \*\*Upload Foto:\*\* Klik "Upload CCTV" → pilih 2 foto per gudang → sistem menyimpan \& menautkan foto ke gudang terkait.

5\. \*\*Verifikasi \& Cari:\*\* Gunakan kolom pencarian atau filter untuk mengecek detail stok \& foto gudang tertentu secara langsung.

6\. \*\*Laporan \& Bagikan:\*\* Unduh rekap CSV/PDF atau salin link dashboard untuk keperluan rapat atau pelaporan ke manajemen.



\## 5. Architecture

```mermaid

flowchart TD

&#x20;   User\[Admin / Staff Gudang] -->|Akses Dashboard \& Upload| FE\[Frontend App Next.js]

&#x20;   FE -->|Request API \& File Multipart| BE\[Backend API Server]

&#x20;   

&#x20;   subgraph Processing

&#x20;       BE -->|Validasi \& Parsing| Parser\[Data Transform Engine]

&#x20;       Parser -->|Hitung Otomatis| Calc\[Stok Calculator]

&#x20;   end

&#x20;   

&#x20;   Calc -->|Simpan Data Stok \& Log| DB\[(TiDB)]

&#x20;   Parser -->|Upload Media| OBJ\[(Cloud Storage / S3-R2)]

&#x20;   OBJ -->|Servis URL Foto| FE

&#x20;   DB -->|Query \& Render Data| FE

&#x20;   

&#x20;   subgraph Sumber Data

&#x20;       SAP\[File MB52 \& zsd\_sodo] -->|Upload Manual| FE

&#x20;   end

```



\## 6. Database Schema

Berikut adalah tabel utama yang dibutuhkan untuk mendukung operasional aplikasi. Semua tabel dioptimalkan untuk kompatibilitas TiDB (MySQL-compatible, mendukung indeks tinggi \& sharding jika diperlukan).



| Nama Tabel | Kolom Utama | Tipe Data | Kegunaan |

|------------|-------------|-----------|----------|

| `warehouses` | `id`, `kode\_gudang`, `nama\_gudang`, `lokasi`, `created\_at` | UUID, VARCHAR | Data master gudang sebagai referensi utama |

| `sap\_uploads` | `id`, `gudang\_id`, `jenis\_file`, `file\_path`, `status`, `jumlah\_baris`, `uploaded\_by`, `created\_at` | UUID, ENUM, VARCHAR, INT | Mencatat riwayat upload file MB52/zsd\_sodo beserta status keberhasilan |

| `stock\_calculations` | `id`, `gudang\_id`, `tanggal`, `tipe\_pupuk`, `stok\_fisik`, `outstanding\_so`, `stok\_admin\_tanpa\_intransit`, `intransit`, `stok\_admin`, `sumber\_upload\_id` | UUID, DATE, ENUM, DECIMAL | Menyimpan hasil kalkulasi otomatis per gudang, per tanggal, dan per jenis pupuk |

| `cctv\_photos` | `id`, `gudang\_id`, `foto\_1\_url`, `foto\_2\_url`, `tanggal`, `created\_at` | UUID, TEXT, DATE | Menyimpan link foto CCTV yang ditautkan ke gudang \& tanggal pelaporan |

| `users` | `id`, `nama`, `email`, `password\_hash`, `role`, `created\_at` | UUID, VARCHAR, ENUM | Manajemen akun pengguna dengan hak akses berbasis peran |

| `audit\_logs` | `id`, `user\_id`, `aksi`, `detail\_json`, `timestamp` | UUID, TEXT, TIMESTAMP | Pelacakan aktivitas sistem untuk keperluan compliance \& debugging |



\*\*Diagram ERD:\*\*

```mermaid

erDiagram

&#x20;   WAREHOUSES ||--o{ STOCK\_CALCULATIONS : "mempunyai"

&#x20;   WAREHOUSES ||--o{ SAP\_UPLOADS : "menerima"

&#x20;   WAREHOUSES ||--o{ CCT\_PHOTO : "memiliki"

&#x20;   USERS ||--o{ SAP\_UPLOADS : "mengunggah"

&#x20;   USERS ||--o{ AUDIT\_LOGS : "melakukan"



&#x20;   WAREHOUSES {

&#x20;       string id PK

&#x20;       string kode\_gudang

&#x20;       string nama\_gudang

&#x20;       string lokasi

&#x20;       datetime created\_at

&#x20;   }

&#x20;   STOCK\_CALCULATIONS {

&#x20;       string id PK

&#x20;       string gudang\_id FK

&#x20;       date tanggal

&#x20;       string tipe\_pupuk

&#x20;       decimal stok\_fisik

&#x20;       decimal outstanding\_so

&#x20;       decimal stok\_admin\_tanpa\_intransit

&#x20;       decimal intransit

&#x20;       decimal stok\_admin

&#x20;   }

&#x20;   SAP\_UPLOADS {

&#x20;       string id PK

&#x20;       string gudang\_id FK

&#x20;       string jenis\_file

&#x20;       string file\_path

&#x20;       string status

&#x20;   }

&#x20;   CCT\_PHOTO {

&#x20;       string id PK

&#x20;       string gudang\_id FK

&#x20;       string foto\_1\_url

&#x20;       string foto\_2\_url

&#x20;       date tanggal

&#x20;   }

&#x20;   USERS {

&#x20;       string id PK

&#x20;       string email

&#x20;       string role

&#x20;       string password\_hash

&#x20;   }

&#x20;   AUDIT\_LOGS {

&#x20;       string id PK

&#x20;       string user\_id FK

&#x20;       string aksi

&#x20;       text detail\_json

&#x20;       datetime timestamp

&#x20;   }

```



\## 7. Tech Stack

Rekomendasi teknologi dipilih agar selaras dengan kebutuhan performa, kemudahan pengembangan, dan kompatibilitas penuh dengan TiDB:



\- \*\*Frontend:\*\* Next.js (App Router) + Tailwind CSS + shadcn/ui  

&#x20; \*(Memberikan SSR/CSR hybrid untuk loading cepat, UI modern, dan komponen dashboard siap pakai)\*

\- \*\*Backend:\*\* Next.js Server Actions / API Routes + Node.js runtime  

&#x20; \*(Mengeliminasi kompleksitas server terpisah, tetap aman untuk logika bisnis upload \& kalkulasi)\*

\- \*\*Database:\*\* TiDB  

&#x20; \*(Sesuai permintaan user. TiDB kompatibel dengan protokol MySQL, mendukung skalabilitas horizontal, dan ideal untuk data transaksi gudang yang tumbuh cepat)\*

\- \*\*ORM / Query:\*\* Drizzle ORM  

&#x20; \*(Ringan, tipe-data ketat, dukungan TiDB yang solid, dan performa tinggi untuk query dashboard)\*

\- \*\*Autentikasi:\*\* Better Auth  

&#x20; \*(Modern, aman, mendukung session \& JWT, mudah diintegrasikan dengan Next.js \& TiDB)\*

\- \*\*Penyimpanan Foto:\*\* Cloudflare R2 / AWS S3  

&#x20; \*(Storage terdedikasi untuk gambar CCTV agar TiDB tetap fokus pada data relasional dan tetap cepat)\*

\- \*\*Deployment:\*\* Vercel (Frontend \& Backend) + TiDB Cloud + Cloudflare R2  

&#x20; \*(Pipeline CI/CD otomatis, scaling tanpa config server, monitoring terintegrasi)\*

