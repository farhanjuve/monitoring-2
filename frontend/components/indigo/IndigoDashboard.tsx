"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  UploadCloud, Trash2, RefreshCw, FileSpreadsheet, Truck, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

interface TrendPoint {
  periode: string;
  sap_do_count: number;
  indigo_do_count: number;
  matched_count: number;
  realization_pct: number;
}

interface BreakdownRow {
  ekspeditur?: string;
  plant?: string;
  role?: string;
  sap_do_count: number;
  matched_count: number;
  unmatched_count: number;
  realization_pct: number;
}

interface ReportItem {
  id: number;
  periode: string;
  sap_filename: string;
  indigo_filename: string;
  sap_do_count: number;
  indigo_do_count: number;
  matched_count: number;
  realization_pct: number;
  created_at: string;
}

type Toast = { type: "success" | "error"; message: string } | null;

const SAP_COLOR = "#0f3965";
const INDIGO_COLOR = "#e0a800";
const SUCCESS_COLOR = "#10b981";
const DANGER_COLOR = "#ef4444";

function fmt(n: number) {
  return (n ?? 0).toLocaleString("id-ID");
}

export function IndigoDashboard() {
  const [uploading, setUploading] = useState(false);
  const [sapFile, setSapFile] = useState<File | null>(null);
  const [indigoFile, setIndigoFile] = useState<File | null>(null);
  const [periode, setPeriode] = useState("");
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [ekspeditur, setEkspeditur] = useState<BreakdownRow[]>([]);
  const [plantAsal, setPlantAsal] = useState<BreakdownRow[]>([]);
  const [plantTujuan, setPlantTujuan] = useState<BreakdownRow[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [periodeFilter, setPeriodeFilter] = useState("");
  const [periodeOptions, setPeriodeOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchPeriode = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/indigo/periode-list`);
      const data = await res.json();
      setPeriodeOptions(data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams({ limit: "50" });
      if (periodeFilter) qParams.set("periode", periodeFilter);
      const qs = qParams.toString();
      const [trendRes, eksRes, plantRes, reportsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/indigo/trend`),
        fetch(`${API_BASE_URL}/api/indigo/ekspeditur?${qs}`),
        fetch(`${API_BASE_URL}/api/indigo/plant?${qs}`),
        fetch(`${API_BASE_URL}/api/indigo/reports`),
      ]);
      setTrend(await trendRes.json());
      setEkspeditur(await eksRes.json());
      const plant = await plantRes.json();
      setPlantAsal(plant.asal || []);
      setPlantTujuan(plant.tujuan || []);
      setReports(await reportsRes.json());
      fetchPeriode();
    } catch (e) {
      console.error(e);
      showToast("error", "Gagal memuat data INDIGO.");
    } finally {
      setLoading(false);
    }
  }, [periodeFilter, fetchPeriode, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async () => {
    if (!sapFile || !indigoFile) {
      showToast("error", "Pilih kedua file (SAP & INDIGO) terlebih dahulu.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("sap_file", sapFile);
      form.append("indigo_file", indigoFile);
      if (periode) form.append("periode", periode);

      const res = await fetch(`${API_BASE_URL}/api/indigo/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload gagal.");

      setLastResult(data);
      fetchData();
      showToast("success", "Laporan berhasil diupload dan diproses.");
      setSapFile(null);
      setIndigoFile(null);
      setPeriode("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      showToast("error", e.message || "Upload gagal.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus laporan ini beserta data DO-nya?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/indigo/reports/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal hapus.");
      fetchData();
      showToast("success", "Laporan berhasil dihapus.");
    } catch (e) {
      showToast("error", "Gagal menghapus laporan.");
    }
  };

  const totals = trend.reduce(
    (acc, t) => ({
      sap: acc.sap + t.sap_do_count,
      indigo: acc.indigo + t.indigo_do_count,
      matched: acc.matched + t.matched_count,
    }),
    { sap: 0, indigo: 0, matched: 0 }
  );
  const globalPct = totals.sap ? (totals.matched / totals.sap) * 100 : 0;

  const kpiCards = [
    {
      label: "Jumlah DO di SAP (Acuan)",
      value: fmt(totals.sap),
      sub: `${reports.length} periode terupload`,
      color: SAP_COLOR,
      icon: FileSpreadsheet,
    },
    {
      label: "Jumlah DO di INDIGO",
      value: fmt(totals.indigo),
      sub: "DO yang tercatat di aplikasi",
      color: INDIGO_COLOR,
      icon: Truck,
    },
    {
      label: "DO Menjalankan Aplikasi",
      value: fmt(totals.matched),
      sub: "DO SAP cocok dengan INDIGO",
      color: SUCCESS_COLOR,
      icon: CheckCircle2,
    },
    {
      label: "Persentase Realisasi",
      value: `${globalPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`,
      sub: `Sisa ${fmt(Math.max(0, totals.sap - totals.matched))} DO belum realisasi`,
      color: globalPct >= 70 ? SUCCESS_COLOR : globalPct >= 40 ? "#f59e0b" : DANGER_COLOR,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md text-sm font-medium shadow-lg ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* ── Upload ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-pupuk-darkBlue mb-1 flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-pupuk-turquoise" />
          Upload Laporan Realisasi
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Unggah <b>report SAP (ZMMR22)</b> sebagai acuan &amp; <b>report INDIGO</b> sebagai realisasi.
          Periode dapat diisi manual (YYYY-MM) atau dideteksi otomatis dari Tgl. GI report SAP.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Report SAP (xlsx)</span>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setSapFile(e.target.files?.[0] || null)}
              className="mt-1 w-full text-sm border rounded-md p-2 file:mr-3 file:rounded-md file:border-0 file:bg-pupuk-darkBlue file:text-white file:px-3 file:py-1.5 file:text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Report INDIGO (xlsx)</span>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setIndigoFile(e.target.files?.[0] || null)}
              className="mt-1 w-full text-sm border rounded-md p-2 file:mr-3 file:rounded-md file:border-0 file:bg-pupuk-darkBlue file:text-white file:px-3 file:py-1.5 file:text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">Periode (opsional):</span>
            <input
              type="month"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={handleUpload}
            disabled={uploading || (!sapFile && !indigoFile)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {uploading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4" />
            )}
            {uploading ? "Memproses..." : "Upload & Hitung Realisasi"}
          </button>
        </div>

        {lastResult && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
            <div className="font-semibold text-emerald-800 mb-2">
              Periode {lastResult.report.periode} berhasil dihitung
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-emerald-900">
              <div>DO SAP: <b>{fmt(lastResult.summary.sap_do_count)}</b></div>
              <div>DO INDIGO: <b>{fmt(lastResult.summary.indigo_do_count)}</b></div>
              <div>Cocok: <b>{fmt(lastResult.summary.matched_count)}</b></div>
              <div>Realisasi: <b>{lastResult.summary.realization_pct}%</b></div>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
              </div>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: `${k.color}18` }}>
                <k.icon className="w-5 h-5" style={{ color: k.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter periode ──────────────────────────────────── */}
      {periodeOptions.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-muted-foreground">Filter:</span>
          <select
            value={periodeFilter}
            onChange={(e) => setPeriodeFilter(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm"
          >
            <option value="">Semua Periode</option>
            {periodeOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Grafik kepatuhan per bulan ──────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-pupuk-darkBlue mb-4">
          Grafik Kepatuhan Per Bulan
        </h2>
        {loading ? (
          <div className="h-72 animate-pulse bg-gray-100 rounded-lg" />
        ) : trend.length === 0 ? (
          <p className="text-sm text-muted-foreground py-16 text-center">
            Belum ada data. Upload laporan untuk mulai memantau kepatuhan per bulan.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="periode" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="sap_do_count" name="DO di SAP (acuan)" fill={SAP_COLOR} radius={[4, 4, 0, 0]} />
                <Bar dataKey="indigo_do_count" name="DO di INDIGO" fill={INDIGO_COLOR} radius={[4, 4, 0, 0]} />
                <Bar dataKey="matched_count" name="DO cocok (realisasi)" fill={SUCCESS_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Grafik persentase realisasi per bulan ───────────── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-pupuk-darkBlue mb-4">
          Persentase Realisasi Per Bulan
        </h2>
        {loading ? (
          <div className="h-56 animate-pulse bg-gray-100 rounded-lg" />
        ) : trend.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            Belum ada data.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="periode" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="realization_pct"
                  name="Realisasi (%)"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Breakdown ekspeditur ────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-pupuk-darkBlue mb-4">
            Realisasi per Ekspeditur
          </h2>
          {ekspeditur.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data.</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Ekspeditur</th>
                    <th className="py-2 pr-3 text-right">DO SAP</th>
                    <th className="py-2 pr-3 text-right">Cocok</th>
                    <th className="py-2 pr-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {ekspeditur.map((r) => (
                    <tr key={r.ekspeditur} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{r.ekspeditur}</td>
                      <td className="py-2 pr-3 text-right">{fmt(r.sap_do_count)}</td>
                      <td className="py-2 pr-3 text-right text-emerald-600 font-semibold">{fmt(r.matched_count)}</td>
                      <td className="py-2 pr-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          r.realization_pct >= 70 ? "bg-emerald-100 text-emerald-700"
                          : r.realization_pct >= 40 ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                        }`}>
                          {r.realization_pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Breakdown plant ───────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-pupuk-darkBlue mb-4">
            Realisasi per Plant
          </h2>
          {plantAsal.length === 0 && plantTujuan.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-pupuk-turquoise mb-2">Plant Asal</h3>
                <div className="overflow-x-auto max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b">
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Plant</th>
                        <th className="py-2 pr-3 text-right">DO</th>
                        <th className="py-2 pr-3 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantAsal.slice(0, 10).map((r) => (
                        <tr key={r.plant} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{r.plant}</td>
                          <td className="py-2 pr-3 text-right">{fmt(r.sap_do_count)}</td>
                          <td className="py-2 pr-3 text-right text-emerald-600 font-semibold">
                            {r.realization_pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-pupuk-turquoise mb-2">Plant Tujuan</h3>
                <div className="overflow-x-auto max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b">
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Plant</th>
                        <th className="py-2 pr-3 text-right">DO</th>
                        <th className="py-2 pr-3 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantTujuan.slice(0, 10).map((r) => (
                        <tr key={r.plant} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{r.plant}</td>
                          <td className="py-2 pr-3 text-right">{fmt(r.sap_do_count)}</td>
                          <td className="py-2 pr-3 text-right text-emerald-600 font-semibold">
                            {r.realization_pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Riwayat upload ──────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-pupuk-darkBlue mb-4">Riwayat Upload</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Belum ada laporan yang diupload.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Periode</th>
                  <th className="py-2 pr-3">File Sap</th>
                  <th className="py-2 pr-3">File Indigo</th>
                  <th className="py-2 pr-3 text-right">DO SAP</th>
                  <th className="py-2 pr-3 text-right">DO Indigo</th>
                  <th className="py-2 pr-3 text-right">Cocok</th>
                  <th className="py-2 pr-3 text-right">%</th>
                  <th className="py-2 pr-3">Diunggah</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold">{r.periode}</td>
                    <td className="py-2 pr-3 max-w-[160px] truncate">{r.sap_filename}</td>
                    <td className="py-2 pr-3 max-w-[160px] truncate">{r.indigo_filename}</td>
                    <td className="py-2 pr-3 text-right">{fmt(r.sap_do_count)}</td>
                    <td className="py-2 pr-3 text-right">{fmt(r.indigo_do_count)}</td>
                    <td className="py-2 pr-3 text-right text-emerald-600 font-semibold">{fmt(r.matched_count)}</td>
                    <td className="py-2 pr-3 text-right">{r.realization_pct}%</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.created_at}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-red-500 hover:text-red-700 transition"
                        title="Hapus laporan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}