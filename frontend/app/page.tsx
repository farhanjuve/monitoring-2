"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, FileSpreadsheet } from "lucide-react";
import { StockSummaryCards } from "@/components/dashboard/StockSummaryCards";
import { StockTable, type StockCalc } from "@/components/dashboard/StockTable";
import { MapDashboard, type SafetyProvinsi } from "@/components/dashboard/MapDashboard";
import { UnmappedPlantsBanner } from "@/components/dashboard/UnmappedPlantsBanner";
import {
  UploadCompletenessBadge,
  UploadCompletenessBanner,
  type UploadCompletenessStatus,
} from "@/components/dashboard/UploadCompletenessBanner";
import { API_BASE_URL } from "@/lib/api";
import { normalizeProvince } from "@/lib/province";

const PUPUK_OPTIONS = ["Semua", "Urea", "NPK", "ZA", "SP-36", "Organik"];

const fieldLabel = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1";
const fieldControl =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-colors focus:border-pupuk-darkBlue focus:outline-none focus:ring-2 focus:ring-pupuk-darkBlue/15";

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const [latestDateStr, setLatestDateStr] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState("");
  const [tipePupuk, setTipePupuk] = useState("Semua");
  const [searchGudang, setSearchGudang] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [mapTipePupuk, setMapTipePupuk] = useState("Semua");
  const [rawData, setRawData] = useState<StockCalc[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadCompletenessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [safetyByProvinsi, setSafetyByProvinsi] = useState<Record<string, SafetyProvinsi>>({});
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

  const handleExportExcel = () => {
    const selectedDate = tanggal || latestDateStr;
    if (!selectedDate) return;
    window.open(`${API_BASE_URL}/api/stocks/export-excel?tanggal=${selectedDate}`, "_blank");
  };

  const displayDate = latestDateStr
    ? new Date(latestDateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "Belum ada data";

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Monitoring Stok</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-pupuk-darkBlue">Dashboard Stok Gudang</h1>
          <p className="mt-1 text-sm text-slate-500">Ringkasan stok fisik dan stok admin dari data SAP terbaru.</p>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Update terakhir</p>
            <p className="text-sm font-semibold text-slate-700">{displayDate}</p>
          </div>
          <UploadCompletenessBadge status={uploadStatus} />
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-slate-200 py-4">
        <div>
          <label htmlFor="tanggal-data" className={fieldLabel}>
            Tanggal data
          </label>
          <input
            id="tanggal-data"
            type="date"
            value={tanggal || latestDateStr || ""}
            onChange={(e) => updateTanggal(e.target.value)}
            className={fieldControl}
          />
        </div>
        <div>
          <label htmlFor="jenis-pupuk" className={fieldLabel}>
            Jenis pupuk
          </label>
          <select
            id="jenis-pupuk"
            value={tipePupuk}
            onChange={(e) => updatePupuk(e.target.value)}
            className={`${fieldControl} bg-white`}
          >
            {PUPUK_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label htmlFor="cari-gudang" className={fieldLabel}>
            Cari gudang / plant / kota
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              id="cari-gudang"
              value={searchGudang}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Contoh: Gudang A / F332 / Surabaya"
              className={`${fieldControl} w-full pl-9`}
            />
          </div>
        </div>
        {provinceFilter && (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
            Provinsi: <b className="font-semibold">{provinceFilter}</b>
            <button type="button" onClick={() => updateProvince("")} className="underline underline-offset-2 hover:text-emerald-900">
              reset
            </button>
          </div>
        )}
        <div className="ml-auto">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!tanggal && !latestDateStr}
            className="inline-flex h-[38px] items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-pupuk-darkBlue hover:text-pupuk-darkBlue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-darkBlue/30 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Unduh Excel
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <UploadCompletenessBanner status={uploadStatus} />
        <UnmappedPlantsBanner />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <MapDashboard
          data={rawData}
          selectedProvince={provinceFilter}
          onSelectProvince={updateProvince}
          safetyStockByProvinsi={safetyByProvinsi}
          tipePupuk={mapTipePupuk}
          onTipePupukChange={setMapTipePupuk}
        />
        <StockSummaryCards data={filteredData} loading={loading} />
      </div>

      <div className="mt-6">
        <StockTable data={filteredData} loading={loading} tipePupuk={tipePupuk} />
      </div>
    </div>
  );
}
