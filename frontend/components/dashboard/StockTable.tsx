"use client";

import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";

interface StockCalc {
  id: number;
  tanggal: string;
  kode_plant: string;
  tipe_pupuk: string;
  stok_fisik: number;
  outstanding_so: number;
  stok_admin_tanpa_intransit: number;
  intransit: number;
  stok_admin: number;
}

export function StockTable() {
  const [data, setData] = useState<StockCalc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPupuk, setFilterPupuk] = useState("Semua");

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    fetch(`${API_BASE_URL}/api/stocks/?tanggal=${today}`)
      .then((res) => res.json())
      .then((d) => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filterPupuk === "Semua" ? data : data.filter((r) => r.tipe_pupuk === filterPupuk);
  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Detail Stok Per Gudang</h3>
        <select
          value={filterPupuk}
          onChange={(e) => setFilterPupuk(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
        >
          <option>Semua</option>
          <option>Urea</option>
          <option>NPK</option>
          <option>ZA</option>
          <option>SP-36</option>
          <option>Organik</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-6 py-3">Kode Plant</th>
              <th className="px-6 py-3">Jenis</th>
              <th className="px-6 py-3 text-right">Fisik (Ton)</th>
              <th className="px-6 py-3 text-right">Out. SO (Ton)</th>
              <th className="px-6 py-3 text-right">Admin (T. Intransit)</th>
              <th className="px-6 py-3 text-right">Intransit (Ton)</th>
              <th className="px-6 py-3 text-right text-pupuk-darkBlue">Admin (Ton)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                  Memuat data...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                  Belum ada data stok untuk hari ini. Silakan upload file MB52 & ZSD_SODO terlebih dahulu.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{row.kode_plant}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        row.tipe_pupuk === "Urea"
                          ? "bg-blue-100 text-blue-800"
                          : row.tipe_pupuk === "NPK"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {row.tipe_pupuk}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">{fmt(row.stok_fisik)}</td>
                  <td className="px-6 py-4 text-right">{fmt(row.outstanding_so)}</td>
                  <td className="px-6 py-4 text-right">{fmt(row.stok_admin_tanpa_intransit)}</td>
                  <td className="px-6 py-4 text-right">{fmt(row.intransit)}</td>
                  <td className="px-6 py-4 text-right font-bold text-pupuk-darkBlue">{fmt(row.stok_admin)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
