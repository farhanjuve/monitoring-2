"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { formatJakartaDateTime } from "@/lib/time";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import {
  UploadCompletenessBanner,
  type UploadCompletenessStatus,
} from "@/components/dashboard/UploadCompletenessBanner";

interface GudangData {
  id: number;
  nama_gudang: string;
  kota: string;
  provinsi: string;
  kode_plants: string[];
}

interface PhotoData {
  id: number;
  tanggal: string;
  waktu_jepret: string;
  kamera_id: string;
  url: string;
}

interface StockCalc {
  id: number;
  tanggal: string;
  gudang_id: number;
  nama_gudang: string | null;
  kode_plants: string | null;
  kota: string | null;
  provinsi: string | null;
  tipe_pupuk: string;
  stok_fisik: number;
  outstanding_so: number;
  stok_admin_tanpa_intransit: number;
  intransit: number;
  stok_admin: number;
}

interface RecommendationItem {
  gudang_id: number;
  nama_gudang: string;
  kota: string;
  provinsi: string;
}

export default function GudangDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = params.id as string;

  const [gudang, setGudang] = useState<GudangData | null>(null);
  const [stocks, setStocks] = useState<StockCalc[]>([]);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadCompletenessStatus | null>(null);
  const [latestDateStr, setLatestDateStr] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(false);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`${API_BASE_URL}/api/master-data/gudang/${id}`).then((res) => res.json()),
      fetch(`${API_BASE_URL}/api/stocks/`).then((res) => res.json()),
    ])
      .then(([gudangData, latestStockData]) => {
        setGudang(gudangData);
        const latestStockRows = Array.isArray(latestStockData) ? latestStockData : [];
        const latestDate = (latestStockRows[0]?.tanggal as string | undefined) || new Date().toISOString().split("T")[0];
        setLatestDateStr(latestDate);

        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          setSelectedDate(params.get("tanggal") || latestDate);
        } else {
          setSelectedDate(latestDate);
        }
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id || !selectedDate) return;

    const loadDateData = async () => {
      setDateLoading(true);
      if (!gudang) setLoading(true);

      try {
        const [stockData, photoData, allStocksRes, galleryRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/stocks/?gudang_id=${id}&tanggal=${selectedDate}`).then((res) => res.json()),
          fetch(`${API_BASE_URL}/api/photos/gudang/${id}?tanggal=${selectedDate}`).then((res) => res.json()),
          fetch(`${API_BASE_URL}/api/stocks/?tanggal=${selectedDate}`).then((res) => res.json()),
          fetch(`${API_BASE_URL}/api/photos/gallery?tanggal=${selectedDate}`).then((res) => res.json()),
        ]);

        const statusRes = await fetch(`${API_BASE_URL}/api/stocks/upload-status?tanggal=${selectedDate}`);
        setStocks(Array.isArray(stockData) ? stockData : []);
        setPhotos(Array.isArray(photoData) ? photoData : []);
        setUploadStatus(statusRes.ok ? await statusRes.json() : null);

        const allStocks: StockCalc[] = Array.isArray(allStocksRes) ? allStocksRes : [];
        const galleryItems: Array<{ gudang_id: number; photos: string[] }> = Array.isArray(galleryRes) ? galleryRes : [];
        const gudangWithCctv = new Set(
          galleryItems.filter((g) => Array.isArray(g.photos) && g.photos.length > 0).map((g) => g.gudang_id)
        );

        const uniqueByGudang = new Map<number, RecommendationItem>();
        allStocks.forEach((row) => {
          if (row.gudang_id === Number(id)) return;
          if (!gudangWithCctv.has(row.gudang_id)) return;
          if (!uniqueByGudang.has(row.gudang_id)) {
            uniqueByGudang.set(row.gudang_id, {
              gudang_id: row.gudang_id,
              nama_gudang: row.nama_gudang || `Gudang ID ${row.gudang_id}`,
              kota: row.kota || "-",
              provinsi: row.provinsi || "-",
            });
          }
        });

        setRecommendations(Array.from(uniqueByGudang.values()).slice(0, 3));
      } catch (err) {
        console.error(err);
        setStocks([]);
        setPhotos([]);
        setRecommendations([]);
        setUploadStatus(null);
      } finally {
        setLoading(false);
        setDateLoading(false);
      }
    };

    loadDateData();
  }, [id, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSelectedDate = (value: string) => {
    setSelectedDate(value);
    setSelectedPhoto(null);
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (value) params.set("tanggal", value);
    else params.delete("tanggal");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const shiftDate = (days: number) => {
    if (!selectedDate) return;
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    updateSelectedDate(date.toISOString().split("T")[0]);
  };

  const jumpToLatestDate = () => {
    if (latestDateStr) updateSelectedDate(latestDateStr);
  };

  const selectedDateValue = selectedDate ? new Date(`${selectedDate}T00:00:00`) : null;
  const selectedDateLabel = selectedDate
    ? selectedDateValue?.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "Pilih tanggal data";
  const selectedDateParts = selectedDate
    ? {
        day: selectedDateValue?.toLocaleDateString("id-ID", { day: "2-digit" }),
        month: selectedDateValue?.toLocaleDateString("id-ID", { month: "short" }),
      }
    : { day: "--", month: "---" };

  const fotoDepan = photos.find(p => p.kamera_id === "CCTV Pintu Depan");
  const fotoDalam = photos.find(p => p.kamera_id === "CCTV Dalam Area Stok");
  const resolvePhotoUrl = (url: string) => (url.startsWith("http://") || url.startsWith("https://")) ? url : `${API_BASE_URL}${url}`;

  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Memuat data gudang...</div>;
  }

  if (!gudang) {
    return <div className="p-8 text-center text-red-500">Gudang tidak ditemukan.</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Link href={selectedDate ? `/?tanggal=${selectedDate}` : "/"} className="p-2 bg-white rounded-full border shadow-sm hover:bg-gray-50 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-pupuk-darkBlue flex items-center gap-2">
            <PackageOpen className="w-6 h-6" />
            {gudang.nama_gudang}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {gudang.kota}, {gudang.provinsi} | Kode Plant: {gudang.kode_plants.join(" / ") || "-"}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 flex-col overflow-hidden rounded-lg border border-pupuk-turquoise/40 bg-pupuk-darkBlue text-center shadow-sm">
              <div className="bg-pupuk-turquoise px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-pupuk-darkBlue">
                {selectedDateParts.month}
              </div>
              <div className="flex flex-1 items-center justify-center text-3xl font-bold text-white">
                {selectedDateParts.day}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pupuk-blue">
                <CalendarDays className="h-4 w-4" />
                Tanggal Data Aktif
              </div>
              <p className="mt-1 text-xl font-bold text-pupuk-darkBlue">{selectedDateLabel}</p>
              <p className="mt-1 text-sm text-gray-500">
                CCTV, stok, status upload, dan rekomendasi mengikuti tanggal ini.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Pilih tanggal</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => updateSelectedDate(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm focus:border-pupuk-turquoise focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise/30 sm:w-44"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-700 transition hover:border-pupuk-turquoise hover:bg-white"
                title="Tanggal sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-700 transition hover:border-pupuk-turquoise hover:bg-white"
                title="Tanggal berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={jumpToLatestDate}
                disabled={!latestDateStr || selectedDate === latestDateStr}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-pupuk-darkBlue/20 bg-pupuk-darkBlue px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-pupuk-darkBlue/90 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <RotateCcw className="h-4 w-4" />
                Terbaru
              </button>
            </div>
          </div>
        </div>
        {dateLoading && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-pupuk-turquoise" />
          </div>
        )}
      </div>

      <UploadCompletenessBanner status={uploadStatus} compact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CCTV Section */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <Camera className="w-5 h-5 text-pupuk-darkBlue" />
            CCTV Gudang
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Foto Depan */}
            <div className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video flex flex-col items-center justify-center">
              {fotoDepan ? (
                <img src={resolvePhotoUrl(fotoDepan.url)} alt="CCTV Pintu Depan" className="object-cover w-full h-full" />
              ) : (
                <>
                  <Camera className="w-8 h-8 text-gray-400 mb-2 opacity-50" />
                  <span className="text-xs text-gray-500 font-medium text-center px-4">
                    Belum ada foto CCTV Pintu Depan
                  </span>
                </>
              )}
              {fotoDepan && (
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(fotoDepan)}
                  className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <span className="bg-white/90 text-xs px-2 py-1 rounded text-gray-800 font-medium shadow-sm">
                    Lihat Penuh
                  </span>
                  <span className="text-[10px] text-white mt-2">
                    {formatJakartaDateTime(fotoDepan.waktu_jepret)}
                  </span>
                </button>
              )}
            </div>

            {/* Foto Dalam */}
            <div className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video flex flex-col items-center justify-center">
              {fotoDalam ? (
                <img src={resolvePhotoUrl(fotoDalam.url)} alt="CCTV Dalam Area Stok" className="object-cover w-full h-full" />
              ) : (
                <>
                  <Camera className="w-8 h-8 text-gray-400 mb-2 opacity-50" />
                  <span className="text-xs text-gray-500 font-medium text-center px-4">
                    Belum ada foto CCTV Dalam Area Stok
                  </span>
                </>
              )}
              {fotoDalam && (
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(fotoDalam)}
                  className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <span className="bg-white/90 text-xs px-2 py-1 rounded text-gray-800 font-medium shadow-sm">
                    Lihat Penuh
                  </span>
                  <span className="text-[10px] text-white mt-2">
                    {formatJakartaDateTime(fotoDalam.waktu_jepret)}
                  </span>
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4 italic">
            *Menampilkan foto CCTV untuk tanggal data aktif. Anda bisa mengunggah foto manual di menu Upload.
          </p>
        </div>

        {/* Stock Section */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <PackageOpen className="w-5 h-5 text-pupuk-darkBlue" />
            Data Stok Gudang
          </h3>
          
          {stocks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Belum ada data stok untuk gudang ini pada tanggal terkait.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2">Jenis Pupuk</th>
                    <th className="px-4 py-2 text-right">Fisik (Ton)</th>
                    <th className="px-4 py-2 text-right">Out. SO (Ton)</th>
                    <th className="px-4 py-2 text-right">Admin (Ton)</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.tipe_pupuk}</td>
                      <td className="px-4 py-3 text-right">{fmt(s.stok_fisik)}</td>
                      <td className="px-4 py-3 text-right">{fmt(s.outstanding_so)}</td>
                      <td className="px-4 py-3 text-right font-bold text-pupuk-darkBlue">{fmt(s.stok_admin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4">
          Rekomendasi Gudang Lain (Stok & CCTV Tersedia)
        </h3>
        {recommendations.length === 0 ? (
          <p className="text-sm text-gray-500">
            Belum ada minimal 3 gudang lain yang memenuhi kriteria stok dan CCTV pada tanggal yang sama.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recommendations.map((rec) => (
              <Link
                key={rec.gudang_id}
                href={`/dashboard/gudang/${rec.gudang_id}?tanggal=${selectedDate}`}
                className="block border border-gray-200 rounded-lg p-4 hover:border-pupuk-turquoise hover:shadow-sm transition"
              >
                <p className="text-sm font-semibold text-pupuk-darkBlue">{rec.nama_gudang}</p>
                <p className="text-xs text-gray-500 mt-1">{rec.kota}, {rec.provinsi}</p>
                <p className="text-[11px] text-gray-400 mt-2">Lihat detail gudang →</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-6xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -top-10 right-0 text-white text-sm bg-white/20 hover:bg-white/30 rounded px-3 py-1"
              onClick={() => setSelectedPhoto(null)}
            >
              Tutup
            </button>
            <img
              src={resolvePhotoUrl(selectedPhoto.url)}
              alt={selectedPhoto.kamera_id}
              className="w-full max-h-[85vh] object-contain rounded-md"
            />
            <div className="mt-2 text-white text-xs text-right">
              {selectedPhoto.kamera_id} • {formatJakartaDateTime(selectedPhoto.waktu_jepret)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
