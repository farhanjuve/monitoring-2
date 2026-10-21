"use client";

import { useEffect, useState } from "react";
import { MapDashboard, type SafetyProvinsi } from "@/components/dashboard/MapDashboard";
import type { StockCalc } from "@/components/dashboard/StockTable";
import { API_BASE_URL } from "@/lib/api";
import { normalizeProvince } from "@/lib/province";

export default function Peta38Page() {
  const [latestDateStr, setLatestDateStr] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState("");
  const [rawData, setRawData] = useState<StockCalc[]>([]);
  const [safetyByProvinsi, setSafetyByProvinsi] = useState<Record<string, SafetyProvinsi>>({});
  const [mapTipePupuk, setMapTipePupuk] = useState("Semua");
  const [provinceFilter, setProvinceFilter] = useState("");

  useEffect(() => {
    const loadLatestDate = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stocks/`);
        const data = await res.json();
        const latest = Array.isArray(data) && data.length > 0 ? data[0].tanggal : null;
        setLatestDateStr(latest);
      } catch (e) {
        console.error(e);
        setLatestDateStr(null);
      }
    };
    loadLatestDate();
  }, []);

  useEffect(() => {
    const selectedDate = tanggal || latestDateStr || "";
    if (!selectedDate) return;

    const loadByDate = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stocks/?tanggal=${selectedDate}`);
        const data = await res.json();
        setRawData(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setRawData([]);
      }
    };
    loadByDate();
  }, [tanggal, latestDateStr]);

  useEffect(() => {
    const selectedDate = tanggal || latestDateStr || "";
    if (!selectedDate) return;
    const parts = selectedDate.split("-");
    if (parts.length !== 3) return;
    const tahun = Number(parts[0]);
    const bulan = Number(parts[1]);
    if (!tahun || !bulan) return;

    let active = true;
    fetch(`${API_BASE_URL}/api/safety-stock/by-provinsi?tahun=${tahun}&bulan=${bulan}`)
      .then((r) => r.json())
      .then((rows: Array<SafetyProvinsi & { provinsi: string }>) => {
        if (!active) return;
        const map: Record<string, SafetyProvinsi> = {};
        rows.forEach((row) => {
          map[normalizeProvince(row.provinsi || "")] = {
            ss_urea: row.ss_urea || 0,
            ss_npk: row.ss_npk || 0,
            ss_npk_kakao: row.ss_npk_kakao || 0,
            ss_za: row.ss_za || 0,
            ss_sp36: row.ss_sp36 || 0,
            ss_organik: row.ss_organik || 0,
          };
        });
        setSafetyByProvinsi(map);
      })
      .catch((e) => {
        console.error(e);
        if (active) setSafetyByProvinsi({});
      });
    return () => { active = false; };
  }, [tanggal, latestDateStr]);

  const displayDate = latestDateStr
    ? new Date(latestDateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "Belum ada data";

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-pupuk-darkBlue mb-1">Peta 38 Provinsi</h1>
          <p className="text-muted-foreground">Sebaran stok nasional dengan batas 38 provinsi terbaru.</p>
        </div>
        <div className="text-sm bg-blue-50 text-pupuk-blue px-4 py-2 rounded-md font-medium">Update Terakhir: {displayDate}</div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tanggal Data</label>
          <input
            type="date"
            value={tanggal || latestDateStr || ""}
            onChange={(e) => setTanggal(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
          />
        </div>
        {provinceFilter && (
          <div className="text-xs px-3 py-2 border rounded-md bg-emerald-50 text-emerald-800 border-emerald-200">
            Provinsi aktif: <b>{provinceFilter}</b>{" "}
            <button onClick={() => setProvinceFilter("")} className="underline ml-1">
              reset
            </button>
          </div>
        )}
      </div>

      <MapDashboard
        data={rawData}
        geoUrl="/indonesia-38-provinces.geojson"
        selectedProvince={provinceFilter}
        onSelectProvince={(p) => setProvinceFilter(p)}
        safetyStockByProvinsi={safetyByProvinsi}
        tipePupuk={mapTipePupuk}
        onTipePupukChange={setMapTipePupuk}
      />
    </div>
  );
}
