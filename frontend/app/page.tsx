"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { StockSummaryCards } from "@/components/dashboard/StockSummaryCards";
import { StockTable, type StockCalc } from "@/components/dashboard/StockTable";
import { MapDashboard } from "@/components/dashboard/MapDashboard";
import { UnmappedPlantsBanner } from "@/components/dashboard/UnmappedPlantsBanner";
import {
  UploadCompletenessBadge,
  UploadCompletenessBanner,
  type UploadCompletenessStatus,
} from "@/components/dashboard/UploadCompletenessBanner";
import { API_BASE_URL } from "@/lib/api";

const PUPUK_OPTIONS = ["Semua", "Urea", "NPK", "ZA", "SP-36", "Organik"];

const PROVINSI_ALIAS: Record<string, string> = {
  "di yogyakarta": "daerah istimewa yogyakarta",
  "dki jakarta": "daerah khusus ibukota jakarta",
};

const normalizeProvince = (name: string) => {
  const base = name.trim().toLowerCase().replace(/\s+/g, " ");
  return PROVINSI_ALIAS[base] || base;
};

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const [latestDateStr, setLatestDateStr] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState("");
  const [tipePupuk, setTipePupuk] = useState("Semua");
  const [searchGudang, setSearchGudang] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [rawData, setRawData] = useState<StockCalc[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadCompletenessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Record<string, StockCalc[]>>({});
  const uploadStatusCacheRef = useRef<Record<string, UploadCompletenessStatus>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setTanggal(params.get("tanggal") || "");
    setTipePupuk(params.get("tipe_pupuk") || "Semua");
    setSearchGudang(params.get("q") || "");
    setProvinceFilter(params.get("provinsi") || "");
  }, []);

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

  const syncUrl = (next: { tanggal?: string; tipe_pupuk?: string; q?: string; provinsi?: string }) => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const entries = Object.entries(next) as Array<[string, string | undefined]>;
    entries.forEach(([key, value]) => {
      if (value && value.trim() !== "") params.set(key, value);
      else params.delete(key);
    });
    router.replace(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (!tanggal && latestDateStr) {
      setTanggal(latestDateStr);
      syncUrl({
        tanggal: latestDateStr,
        tipe_pupuk: tipePupuk,
        q: searchGudang,
        provinsi: provinceFilter,
      });
    }
  }, [latestDateStr, tanggal, tipePupuk, searchGudang, provinceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const selectedDate = tanggal || latestDateStr || "";
    if (!selectedDate) return;

    const cached = cacheRef.current[selectedDate];
    if (cached) {
      setRawData(cached);
      return;
    }

    const loadByDate = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/stocks/?tanggal=${selectedDate}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        cacheRef.current[selectedDate] = rows;
        setRawData(rows);
      } catch (e) {
        console.error(e);
        setRawData([]);
      } finally {
        setLoading(false);
      }
    };
    loadByDate();
  }, [tanggal, latestDateStr]);

  useEffect(() => {
    const selectedDate = tanggal || latestDateStr || "";
    if (!selectedDate) return;

    const cached = uploadStatusCacheRef.current[selectedDate];
    if (cached) {
      setUploadStatus(cached);
      return;
    }

    const loadUploadStatus = async () => {
      setUploadStatus(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/stocks/upload-status?tanggal=${selectedDate}`);
        if (!res.ok) throw new Error("Gagal mengambil status upload SAP.");
        const data = await res.json();
        uploadStatusCacheRef.current[selectedDate] = data;
        setUploadStatus(data);
      } catch (e) {
        console.error(e);
        setUploadStatus(null);
      }
    };

    loadUploadStatus();
  }, [tanggal, latestDateStr]);

  const mapData = useMemo(() => {
    const needle = searchGudang.trim().toLowerCase();
    return rawData.filter((row) => {
      if (tipePupuk !== "Semua" && row.tipe_pupuk !== tipePupuk) return false;
      if (!needle) return true;
      const haystack = `${row.nama_gudang || ""} ${row.kode_plants || ""} ${row.kota || ""} ${row.provinsi || ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [rawData, searchGudang, tipePupuk]);

  const filteredData = useMemo(() => {
    if (!provinceFilter) return mapData;
    return mapData.filter((row) => normalizeProvince(row.provinsi || "") === provinceFilter);
  }, [mapData, provinceFilter]);

  const updateTanggal = (value: string) => {
    setTanggal(value);
    syncUrl({ tanggal: value, tipe_pupuk: tipePupuk, q: searchGudang, provinsi: provinceFilter });
  };

  const updatePupuk = (value: string) => {
    setTipePupuk(value);
    syncUrl({ tanggal: tanggal || latestDateStr || "", tipe_pupuk: value, q: searchGudang, provinsi: provinceFilter });
  };

  const updateSearch = (value: string) => {
    setSearchGudang(value);
    syncUrl({ tanggal: tanggal || latestDateStr || "", tipe_pupuk: tipePupuk, q: value, provinsi: provinceFilter });
  };

  const updateProvince = (value: string) => {
    setProvinceFilter(value);
    syncUrl({ tanggal: tanggal || latestDateStr || "", tipe_pupuk: tipePupuk, q: searchGudang, provinsi: value });
  };

  const displayDate = latestDateStr
    ? new Date(latestDateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "Belum ada data";

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-pupuk-darkBlue dark:text-pupuk-turquoise mb-1">Dashboard Stok Gudang</h1>
          <p className="text-muted-foreground">Ringkasan data stok fisik dan SAP terbaru.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-sm bg-blue-50 text-pupuk-blue px-4 py-2 rounded-md font-medium">Update Terakhir: {displayDate}</div>
          <UploadCompletenessBadge status={uploadStatus} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tanggal Data</label>
          <input
            type="date"
            value={tanggal || latestDateStr || ""}
            onChange={(e) => updateTanggal(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Jenis Pupuk</label>
          <select
            value={tipePupuk}
            onChange={(e) => updatePupuk(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise bg-white"
          >
            {PUPUK_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[260px] flex-1">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Cari Gudang / Plant / Kota</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              value={searchGudang}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Contoh: Gudang A / F332 / Surabaya"
              className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
          </div>
        </div>
        {provinceFilter && (
          <div className="text-xs px-3 py-2 border rounded-md bg-emerald-50 text-emerald-800 border-emerald-200">
            Provinsi aktif: <b>{provinceFilter}</b>{" "}
            <button onClick={() => updateProvince("")} className="underline ml-1">
              reset
            </button>
          </div>
        )}
      </div>

      <div className="mb-6">
        <UploadCompletenessBanner status={uploadStatus} />
      </div>

      <UnmappedPlantsBanner />
      <MapDashboard data={mapData} selectedProvince={provinceFilter} onSelectProvince={updateProvince} />
      <StockSummaryCards data={filteredData} loading={loading} />
      <StockTable data={filteredData} loading={loading} tipePupuk={tipePupuk} />
    </div>
  );
}
