"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Search, Truck } from "lucide-react";
import * as XLSX from "xlsx";
import { API_BASE_URL } from "@/lib/api";

type Warehouse = {
  id: number;
  nama_gudang: string;
  kota: string;
  kode_plants: string[];
};

type IntransitRow = {
  tanggal: string;
  gudang_id: number;
  nama_gudang: string | null;
  kode_plants: string | null;
  kota: string | null;
  provinsi: string | null;
  tipe_pupuk: string;
  intransit: number;
};

const MAX_RANGE_DAYS = 31;

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

const diffDays = (start: string, end: string) => {
  const startDate = new Date(`${start}T00:00:00`).getTime();
  const endDate = new Date(`${end}T00:00:00`).getTime();
  return Math.round((endDate - startDate) / 86400000) + 1;
};

const dateRange = (start: string, end: string) => {
  const total = diffDays(start, end);
  return Array.from({ length: Math.max(total, 0) }, (_, idx) => addDays(start, idx));
};

const shortDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function IntransitPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [gudangId, setGudangId] = useState("");
  const [tanggalAwal, setTanggalAwal] = useState("");
  const [tanggalAkhir, setTanggalAkhir] = useState("");
  const [rows, setRows] = useState<IntransitRow[]>([]);
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  useEffect(() => {
    const today = toIsoDate(new Date());
    setTanggalAkhir(today);
    setTanggalAwal(addDays(today, -13));

    const loadWarehouses = async () => {
      setWarehouseLoading(true);
      try {
        const warehouseRes = await fetch(`${API_BASE_URL}/api/master-data/gudang`).then((res) => res.json());
        if (Array.isArray(warehouseRes)) setWarehouses(warehouseRes);
      } catch (e) {
        console.error(e);
        setWarehouses([]);
      } finally {
        setWarehouseLoading(false);
      }
    };

    const loadLatestDate = async () => {
      try {
        const latestRes = await fetch(`${API_BASE_URL}/api/stocks/`).then((res) => res.json());
        const latestDate = Array.isArray(latestRes) && latestRes[0]?.tanggal ? latestRes[0].tanggal : toIsoDate(new Date());
        setTanggalAkhir(latestDate);
        setTanggalAwal(addDays(latestDate, -13));
      } catch (e) {
        console.error(e);
      }
    };

    loadWarehouses();
    loadLatestDate();
  }, []);

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => String(warehouse.id) === gudangId) || null,
    [warehouses, gudangId]
  );

  const filteredWarehouses = useMemo(() => {
    const needle = warehouseSearch.trim().toLowerCase();
    if (!needle) return warehouses.slice(0, 30);
    return warehouses
      .filter((warehouse) => {
        const haystack = `${warehouse.nama_gudang} ${warehouse.kota} ${warehouse.kode_plants.join(" ")}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 30);
  }, [warehouses, warehouseSearch]);

  const validationError = useMemo(() => {
    if (!gudangId) return "Pilih gudang terlebih dahulu.";
    if (!tanggalAwal || !tanggalAkhir) return "Tanggal awal dan akhir wajib diisi.";
    if (tanggalAkhir < tanggalAwal) return "Tanggal akhir tidak boleh lebih awal dari tanggal awal.";
    if (diffDays(tanggalAwal, tanggalAkhir) > MAX_RANGE_DAYS) return "Range tanggal maksimal 31 hari.";
    return null;
  }, [gudangId, tanggalAwal, tanggalAkhir]);

  const dates = useMemo(() => {
    if (!tanggalAwal || !tanggalAkhir || tanggalAkhir < tanggalAwal) return [];
    return dateRange(tanggalAwal, tanggalAkhir);
  }, [tanggalAwal, tanggalAkhir]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    rows.forEach((row) => {
      if (!map.has(row.tipe_pupuk)) map.set(row.tipe_pupuk, new Map());
      map.get(row.tipe_pupuk)!.set(row.tanggal, row.intransit || 0);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const totalIntransit = useMemo(
    () => rows.reduce((acc, row) => acc + (row.intransit || 0), 0),
    [rows]
  );

  const fetchIntransit = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setRows([]);

    try {
      const params = new URLSearchParams({
        gudang_id: gudangId,
        tanggal_awal: tanggalAwal,
        tanggal_akhir: tanggalAkhir,
      });
      const res = await fetch(`${API_BASE_URL}/api/stocks/intransit-range?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Gagal memuat data intransit.");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message || "Gagal memuat data intransit.");
    } finally {
      setLoading(false);
    }
  };

  const buildTable = (tipePupuk: string, values: Map<string, number>) => [
    [`${tipePupuk}`],
    ["Tanggal", ...dates.map(shortDate)],
    ["Intransit (Ton)", ...dates.map((date) => fmt(values.get(date) || 0))],
  ];

  const buildTsv = (tables = grouped) =>
    tables
      .flatMap(([tipePupuk, values]) => [...buildTable(tipePupuk, values).map((row) => row.join("\t")), ""])
      .join("\n")
      .trimEnd();

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    window.setTimeout(() => setCopiedLabel(null), 1600);
  };

  const downloadExcel = () => {
    if (!selectedWarehouse || grouped.length === 0) return;

    const sheetRows: Array<Array<string | number>> = [
      [`Gudang: ${selectedWarehouse.nama_gudang}`],
      [`Kode Plant: ${selectedWarehouse.kode_plants.join(" / ") || "-"}`],
      [`Periode: ${shortDate(tanggalAwal)} - ${shortDate(tanggalAkhir)}`],
      [],
    ];

    grouped.forEach(([tipePupuk, values]) => {
      sheetRows.push([tipePupuk]);
      sheetRows.push(["Tanggal", ...dates.map(shortDate)]);
      sheetRows.push(["Intransit (Ton)", ...dates.map((date) => values.get(date) || 0)]);
      sheetRows.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Intransit");
    XLSX.writeFile(workbook, `intransit-${selectedWarehouse.nama_gudang}-${tanggalAwal}-${tanggalAkhir}.xlsx`);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-pupuk-darkBlue mb-1 flex items-center gap-2">
          <Truck className="w-7 h-7" />
          Rekap Intransit
        </h1>
        <p className="text-muted-foreground">Matrix intransit per gudang, per jenis pupuk, dalam rentang tanggal.</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr] gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Cari & Pilih Gudang</label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                value={warehouseSearch}
                onChange={(e) => setWarehouseSearch(e.target.value)}
                placeholder="Nama gudang, kota, atau kode plant"
                className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
              />
            </div>
            <select
              value={gudangId}
              onChange={(e) => setGudangId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
              disabled={warehouseLoading}
            >
              <option value="">{warehouseLoading ? "Memuat daftar gudang..." : "-- Pilih Gudang --"}</option>
              {filteredWarehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.nama_gudang} - {warehouse.kota} ({warehouse.kode_plants.join(" / ") || "-"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tanggal Awal</label>
            <input
              type="date"
              value={tanggalAwal}
              onChange={(e) => setTanggalAwal(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tanggal Akhir</label>
            <input
              type="date"
              value={tanggalAkhir}
              onChange={(e) => setTanggalAkhir(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={fetchIntransit}
            disabled={loading || Boolean(validationError)}
            className="bg-pupuk-darkBlue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-pupuk-darkBlue/90 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Terapkan"}
          </button>
          <button
            onClick={() => copyText(buildTsv(), "semua")}
            disabled={grouped.length === 0}
            className="border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy Semua
          </button>
          <button
            onClick={downloadExcel}
            disabled={grouped.length === 0}
            className="border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
          {copiedLabel && <span className="text-xs text-emerald-700">Berhasil copy: {copiedLabel}</span>}
        </div>

        {(error || validationError) && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error || validationError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Intransit</p>
          <p className="text-2xl font-bold text-pupuk-darkBlue">{fmt(totalIntransit)} <span className="text-sm font-normal text-gray-400">Ton</span></p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Jenis Pupuk</p>
          <p className="text-2xl font-bold text-pupuk-darkBlue">{grouped.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Periode</p>
          <p className="text-lg font-bold text-pupuk-darkBlue">{tanggalAwal && tanggalAkhir ? `${shortDate(tanggalAwal)} - ${shortDate(tanggalAkhir)}` : "-"}</p>
        </div>
      </div>

      <div className="space-y-4">
        {!loading && rows.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-lg p-8 text-center text-sm text-gray-500">
            Pilih gudang dan periode, lalu klik Terapkan untuk menampilkan matrix intransit.
          </div>
        ) : (
          grouped.map(([tipePupuk, values]) => (
            <div key={tipePupuk} className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h2 className="font-semibold text-pupuk-darkBlue">{tipePupuk}</h2>
                <button
                  onClick={() => copyText(buildTsv([[tipePupuk, values]]), tipePupuk)}
                  className="text-xs border border-gray-300 rounded px-3 py-1.5 bg-white hover:bg-gray-50 flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <th className="sticky left-0 bg-white text-left px-4 py-3 min-w-36 text-gray-700 border-r border-gray-100">
                        Tanggal
                      </th>
                      {dates.map((date) => (
                        <td key={date} className="px-4 py-3 text-center whitespace-nowrap text-gray-700">
                          {shortDate(date)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th className="sticky left-0 bg-white text-left px-4 py-3 min-w-36 text-gray-700 border-r border-gray-100">
                        Intransit (Ton)
                      </th>
                      {dates.map((date) => (
                        <td key={date} className="px-4 py-3 text-center whitespace-nowrap font-semibold text-pupuk-darkBlue">
                          {fmt(values.get(date) || 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
