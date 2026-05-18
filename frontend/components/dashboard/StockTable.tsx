"use client";

import { useState, useEffect, useMemo } from "react";
import { API_BASE_URL } from "@/lib/api";
import { ChevronDown, ChevronRight, PackageOpen } from "lucide-react";
import Link from "next/link";

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

type GroupedData = {
  [provinsi: string]: {
    [kota: string]: {
      [gudangId: string]: StockCalc[];
    };
  };
};

export function StockTable() {
  const [data, setData] = useState<StockCalc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPupuk, setFilterPupuk] = useState("Semua");
  
  const [expandedProv, setExpandedProv] = useState<Record<string, boolean>>({});
  const [expandedKota, setExpandedKota] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/stocks/`)
      .then((res) => res.json())
      .then((d) => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredData = useMemo(() => {
    return filterPupuk === "Semua" ? data : data.filter((r) => r.tipe_pupuk === filterPupuk);
  }, [data, filterPupuk]);

  const grouped = useMemo(() => {
    const g: GroupedData = {};
    filteredData.forEach((row) => {
      const prov = row.provinsi || "Tidak Diketahui";
      const kota = row.kota || "Tidak Diketahui";
      const gudangKey = `${row.gudang_id}|${row.nama_gudang || 'Gudang ID: ' + row.gudang_id}|${row.kode_plants || ''}`;
      
      if (!g[prov]) g[prov] = {};
      if (!g[prov][kota]) g[prov][kota] = {};
      if (!g[prov][kota][gudangKey]) g[prov][kota][gudangKey] = [];
      
      g[prov][kota][gudangKey].push(row);
    });
    return g;
  }, [filteredData]);

  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const toggleProv = (prov: string) => {
    setExpandedProv((prev) => ({ ...prev, [prov]: !prev[prov] }));
  };

  const toggleKota = (prov: string, kota: string) => {
    const key = `${prov}-${kota}`;
    setExpandedKota((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <PackageOpen className="w-5 h-5 text-pupuk-darkBlue" />
          Detail Stok Per Lokasi
        </h3>
        <select
          value={filterPupuk}
          onChange={(e) => setFilterPupuk(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise bg-white"
        >
          <option>Semua</option>
          <option>Urea</option>
          <option>NPK</option>
          <option>ZA</option>
          <option>SP-36</option>
          <option>Organik</option>
        </select>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Memuat data...</div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            Belum ada data stok untuk hari ini. Silakan upload file MB52 & ZSD_SODO terlebih dahulu.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(grouped).sort().map((prov) => (
              <div key={prov} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Header Provinsi */}
                <button
                  onClick={() => toggleProv(prov)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left font-semibold text-gray-800"
                >
                  <div className="flex items-center gap-2">
                    {expandedProv[prov] ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                    {prov}
                  </div>
                  <span className="text-xs bg-white px-2 py-1 rounded-full border text-gray-500 font-medium">
                    {Object.keys(grouped[prov]).length} Kota
                  </span>
                </button>

                {/* Konten Provinsi (Daftar Kota) */}
                {expandedProv[prov] && (
                  <div className="bg-white">
                    {Object.keys(grouped[prov]).sort().map((kota) => {
                      const kotaKey = `${prov}-${kota}`;
                      return (
                        <div key={kotaKey} className="border-t border-gray-100">
                          <button
                            onClick={() => toggleKota(prov, kota)}
                            className="w-full flex items-center justify-between p-3 pl-10 hover:bg-gray-50 transition-colors text-left text-sm font-medium text-gray-700"
                          >
                            <div className="flex items-center gap-2">
                              {expandedKota[kotaKey] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                              {kota}
                            </div>
                            <span className="text-xs text-gray-400">
                              {Object.keys(grouped[prov][kota]).length} Gudang
                            </span>
                          </button>

                          {/* Konten Kota (Daftar Gudang) */}
                          {expandedKota[kotaKey] && (
                            <div className="bg-gray-50/50 p-4 pl-16 border-t border-gray-100">
                              <div className="space-y-4">
                                {Object.keys(grouped[prov][kota]).sort().map((gudangKey) => {
                                  const [gudangId, namaGudang, kodePlants] = gudangKey.split('|');
                                  const stocks = grouped[prov][kota][gudangKey];
                                  const displayName = kodePlants ? `${namaGudang} - ${kodePlants}` : namaGudang;
                                  
                                  return (
                                    <div key={gudangId} className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
                                      <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                        <Link href={`/dashboard/gudang/${gudangId}`} className="text-sm font-bold text-pupuk-darkBlue hover:underline hover:text-pupuk-turquoise flex items-center gap-2">
                                          {displayName}
                                          <span className="text-xs bg-pupuk-darkBlue text-white px-2 py-0.5 rounded-full font-normal">Lihat Detail & CCTV &rarr;</span>
                                        </Link>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left text-gray-500">
                                          <thead className="text-gray-700 uppercase bg-gray-50 border-b">
                                            <tr>
                                              <th className="px-4 py-2">Jenis</th>
                                              <th className="px-4 py-2 text-right">Fisik (Ton)</th>
                                              <th className="px-4 py-2 text-right">Out. SO (Ton)</th>
                                              <th className="px-4 py-2 text-right">Admin (T. Intransit)</th>
                                              <th className="px-4 py-2 text-right">Intransit (Ton)</th>
                                              <th className="px-4 py-2 text-right text-pupuk-darkBlue">Admin (Ton)</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {stocks.map((row) => (
                                              <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                                                <td className="px-4 py-2">
                                                  <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                                                    row.tipe_pupuk === "Urea" ? "bg-blue-100 text-blue-800"
                                                    : row.tipe_pupuk === "NPK" ? "bg-green-100 text-green-800"
                                                    : "bg-gray-100 text-gray-800"
                                                  }`}>
                                                    {row.tipe_pupuk}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-2 text-right">{fmt(row.stok_fisik)}</td>
                                                <td className="px-4 py-2 text-right">{fmt(row.outstanding_so)}</td>
                                                <td className="px-4 py-2 text-right">{fmt(row.stok_admin_tanpa_intransit)}</td>
                                                <td className="px-4 py-2 text-right">{fmt(row.intransit)}</td>
                                                <td className="px-4 py-2 text-right font-bold text-pupuk-darkBlue">{fmt(row.stok_admin)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
