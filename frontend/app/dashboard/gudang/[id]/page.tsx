"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { ArrowLeft, PackageOpen, Camera } from "lucide-react";
import Link from "next/link";

interface GudangData {
  id: number;
  nama_gudang: string;
  kota: string;
  provinsi: string;
  kode_plants: string[];
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

export default function GudangDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [gudang, setGudang] = useState<GudangData | null>(null);
  const [stocks, setStocks] = useState<StockCalc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`${API_BASE_URL}/api/master-data/gudang/${id}`).then((res) => res.json()),
      fetch(`${API_BASE_URL}/api/stocks/?gudang_id=${id}`).then((res) => res.json()),
    ])
      .then(([gudangData, stockData]) => {
        setGudang(gudangData);
        setStocks(Array.isArray(stockData) ? stockData : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [id]);

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
        <Link href="/" className="p-2 bg-white rounded-full border shadow-sm hover:bg-gray-50 transition-colors">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CCTV Section */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <Camera className="w-5 h-5 text-pupuk-darkBlue" />
            Live CCTV Gudang
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Foto 1 */}
            <div className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video flex flex-col items-center justify-center">
              <Camera className="w-8 h-8 text-gray-400 mb-2 opacity-50" />
              <span className="text-xs text-gray-500 font-medium">CCTV Pintu Depan</span>
              <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="bg-white/90 text-xs px-2 py-1 rounded text-gray-800 font-medium cursor-pointer shadow-sm">Lihat Penuh</span>
              </div>
            </div>
            {/* Foto 2 */}
            <div className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video flex flex-col items-center justify-center">
              <Camera className="w-8 h-8 text-gray-400 mb-2 opacity-50" />
              <span className="text-xs text-gray-500 font-medium">CCTV Dalam Area Stok</span>
              <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="bg-white/90 text-xs px-2 py-1 rounded text-gray-800 font-medium cursor-pointer shadow-sm">Lihat Penuh</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4 italic">
            *Fitur koneksi langsung ke feed CCTV R2 sedang dalam pengembangan. Ini adalah placeholder 2 kamera per gudang.
          </p>
        </div>

        {/* Stock Section */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <PackageOpen className="w-5 h-5 text-pupuk-darkBlue" />
            Data Stok Terbaru
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
    </div>
  );
}
