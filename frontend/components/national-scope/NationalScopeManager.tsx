"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

/** Satu baris gudang pada halaman Lingkup Nasional. */
interface ScopeItem {
  id: number;
  nama_gudang: string | null;
  kota: string | null;
  provinsi: string | null;
  kode_plants: string[];
  kategori: string;
  alasan_eksklusi: string[];
  rekomendasi_masuk: boolean;
  is_national_included: boolean;
  kapasitas: number;
  stok_admin: number;
  stok_fisik: number;
}

interface ScopeSummary {
  gudang_aktif: number;
  gudang_dihitung: number;
  gudang_dikecualikan: number;
  kapasitas: number;
  stok_admin: number;
  stok_admin_terhitung: number;
  stok_fisik: number;
  ratio: number | null;
}

interface ScopeResponse {
  tanggal: string | null;
  items: ScopeItem[];
  summary: ScopeSummary;
}

type ViewFilter = "semua" | "masuk" | "keluar" | "saran-keluar";

const VIEW_FILTERS: { value: ViewFilter; label: string }[] = [
  { value: "semua", label: "Semua gudang" },
  { value: "masuk", label: "Masuk perhitungan" },
  { value: "keluar", label: "Dikecualikan" },
  { value: "saran-keluar", label: "Saran dikecualikan" },
];

const KATEGORI_STYLE: Record<string, string> = {
  gudang: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pabrik: "border-rose-200 bg-rose-50 text-rose-700",
  pelabuhan: "border-sky-200 bg-sky-50 text-sky-700",
  kantor: "border-slate-200 bg-slate-100 text-slate-600",
  "lini pabrik": "border-amber-200 bg-amber-50 text-amber-700",
};

const ANGKA = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const PERSEN = new Intl.NumberFormat("id-ID", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatTon = (value: number) => ANGKA.format(value);
const formatPercent = (value: number | null) =>
  value == null ? "—" : PERSEN.format(value);

const formatTanggal = (iso: string | null) => {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const bulan = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return `${Number(parts[2])} ${bulan[Number(parts[1]) - 1] ?? ""} ${parts[0]}`;
};

const ratioClass = (value: number | null) => {
  if (value == null) return "text-gray-500";
  if (value <= 0.7) return "text-emerald-600";
  if (value <= 0.9) return "text-amber-600";
  if (value <= 1) return "text-orange-600";
  return "text-rose-600";
};

const sameSet = (a: Set<number>, b: Set<number>) =>
  a.size === b.size && Array.from(a).every((value) => b.has(value));

export function NationalScopeManager() {
  const [data, setData] = useState<ScopeResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [provinsi, setProvinsi] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("semua");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/master-data/national-inclusion`,
      );
      if (!res.ok) throw new Error("Gagal memuat lingkup nasional.");
      const payload = (await res.json()) as ScopeResponse;
      const included = new Set(
        payload.items
          .filter((item) => item.is_national_included)
          .map((item) => item.id),
      );
      setData(payload);
      setSelectedIds(new Set(included));
      setSavedIds(new Set(included));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dirty = !sameSet(selectedIds, savedIds);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const items = data?.items ?? [];

  const provinsiList = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.provinsi) values.add(item.provinsi);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "id"));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (provinsi && item.provinsi !== provinsi) return false;
      if (viewFilter === "masuk" && !selectedIds.has(item.id)) return false;
      if (viewFilter === "keluar" && selectedIds.has(item.id)) return false;
      if (viewFilter === "saran-keluar" && item.rekomendasi_masuk) return false;
      if (!needle) return true;
      return [
        item.nama_gudang,
        item.kota,
        item.provinsi,
        item.kategori,
        item.kode_plants.join(" "),
      ].some((value) => (value ?? "").toLowerCase().includes(needle));
    });
  }, [items, provinsi, search, selectedIds, viewFilter]);

  const liveSummary = useMemo(() => {
    let dihitung = 0;
    let kapasitas = 0;
    let stokAdmin = 0;
    let stokTerhitung = 0;
    let stokFisik = 0;

    items.forEach((item) => {
      if (!selectedIds.has(item.id)) return;
      dihitung += 1;
      kapasitas += item.kapasitas;
      stokAdmin += item.stok_admin;
      stokFisik += item.stok_fisik;
      if (item.kapasitas > 0) stokTerhitung += item.stok_admin;
    });

    return {
      dihitung,
      dikecualikan: items.length - dihitung,
      kapasitas,
      stokAdmin,
      stokTerhitung,
      stokFisik,
      ratio: kapasitas > 0 ? stokTerhitung / kapasitas : null,
    };
  }, [items, selectedIds]);

  const recommendationCount = useMemo(
    () => items.filter((item) => item.rekomendasi_masuk).length,
    [items],
  );

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const clearFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((item) => next.delete(item.id));
      return next;
    });
  };

  const applyRecommendation = () => {
    setSelectedIds(
      new Set(items.filter((item) => item.rekomendasi_masuk).map((item) => item.id)),
    );
  };

  const resetSelection = () => {
    setSelectedIds(new Set(savedIds));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/master-data/national-inclusion`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ included_ids: Array.from(selectedIds) }),
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || "Gagal menyimpan lingkup nasional.");
      }
      const payload = (await res.json()) as {
        included: number;
        excluded: number;
      };
      setSavedIds(new Set(selectedIds));
      setData((prev) =>
        prev
          ? {
              ...prev,
              summary: {
                ...prev.summary,
                gudang_dihitung: payload.included,
                gudang_dikecualikan: payload.excluded,
              },
            }
          : prev,
      );
      setToast({
        type: "success",
        message: `Tersimpan: ${payload.included} gudang dihitung, ${payload.excluded} dikecualikan.`,
      });
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Gagal menyimpan.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
          role="status"
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* Ringkasan angka nasional berdasarkan centang saat ini. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-gray-500">
            Gudang dihitung
            <Globe2 className="h-4 w-4 text-pupuk-darkGreen" />
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-pupuk-darkBlue">
            {liveSummary.dihitung}
            <span className="ml-1 text-xs font-normal text-gray-400">
              / {items.length} aktif
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {liveSummary.dikecualikan} gudang dikecualikan
          </p>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Kapasitas dihitung</div>
          <div className="mt-1 font-display text-2xl font-bold text-pupuk-darkBlue">
            {formatTon(liveSummary.kapasitas)}
            <span className="ml-1 text-xs font-normal text-gray-400">t</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Stok fisik {formatTon(liveSummary.stokFisik)} t
          </p>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Stok admin berkapasitas</div>
          <div className="mt-1 font-display text-2xl font-bold text-pupuk-darkBlue">
            {formatTon(liveSummary.stokTerhitung)}
            <span className="ml-1 text-xs font-normal text-gray-400">t</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Total stok admin {formatTon(liveSummary.stokAdmin)} t
          </p>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Keterisian nasional</div>
          <div
            className={`mt-1 font-display text-2xl font-bold ${ratioClass(
              liveSummary.ratio,
            )}`}
          >
            {formatPercent(liveSummary.ratio)}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {data?.tanggal ? `Data ${formatTanggal(data.tanggal)}` : "Belum ada data"}
          </p>
        </div>
      </div>

      {/* Penjelasan aturan otomatis. */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-xs leading-relaxed text-amber-900">
          <p className="font-semibold">
            Rekomendasi otomatis mengecualikan gudang pabrik/pelabuhan
          </p>
          <p>
            Plant berkategori pabrik, pelabuhan, atau kantor, kode plant
            berakhiran <span className="font-mono">101</span>, dan kode 3 digit
            berawalan <span className="font-mono">7</span> tidak masuk
            perhitungan nasional. Kamu tetap bisa mencentang ulang gudang yang
            diperlukan sebelum menyimpan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setToast(null)}
          className="ml-auto rounded p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-700"
          aria-label="Tutup penjelasan"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Toolbar filter dan aksi massal. */}
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama gudang, kota, provinsi, atau kode plant..."
              className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
          </div>

          <select
            value={provinsi}
            onChange={(event) => setProvinsi(event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            aria-label="Filter provinsi"
          >
            <option value="">Semua provinsi</option>
            {provinsiList.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={viewFilter}
            onChange={(event) => setViewFilter(event.target.value as ViewFilter)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            aria-label="Filter status"
          >
            {VIEW_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={selectFiltered}
            disabled={filtered.length === 0}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Pilih semua tampil ({filtered.length})
          </button>
          <button
            type="button"
            onClick={clearFiltered}
            disabled={filtered.length === 0}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Kosongkan tampil
          </button>
          <button
            type="button"
            onClick={applyRecommendation}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Pakai rekomendasi ({recommendationCount})
          </button>
          <button
            type="button"
            onClick={resetSelection}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Batalkan perubahan
          </button>
          <span className="ml-auto text-xs text-gray-500">
            Menampilkan {filtered.length} dari {items.length} gudang
          </span>
        </div>
      </div>

      {/* Tabel gudang. */}
      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="max-h-[62vh] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-12 px-3 py-2.5 text-center">Ikut</th>
                <th className="px-3 py-2.5">Gudang</th>
                <th className="px-3 py-2.5">Wilayah</th>
                <th className="px-3 py-2.5">Kategori</th>
                <th className="px-3 py-2.5 text-right">Kapasitas (t)</th>
                <th className="px-3 py-2.5 text-right">Stok Admin (t)</th>
                <th className="px-3 py-2.5">Saran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Memuat data gudang...
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((item) => {
                  const included = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-gray-50 ${
                        included ? "" : "bg-gray-50/60"
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => toggle(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-pupuk-darkGreen focus:ring-pupuk-turquoise"
                          aria-label={`Ikutkan ${item.nama_gudang ?? "gudang"} dalam perhitungan nasional`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-pupuk-darkBlue">
                          {item.nama_gudang ?? "(tanpa nama)"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.kode_plants.length > 0
                            ? item.kode_plants.join(" / ")
                            : "Tanpa kode plant"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-gray-700">{item.provinsi ?? "—"}</div>
                        <div className="text-xs text-gray-400">{item.kota ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                            KATEGORI_STYLE[item.kategori] ??
                            "border-gray-200 bg-gray-50 text-gray-600"
                          }`}
                        >
                          {item.kategori}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {item.kapasitas > 0 ? formatTon(item.kapasitas) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {formatTon(item.stok_admin)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {item.rekomendasi_masuk ? (
                          <span className="text-emerald-600">Masuk</span>
                        ) : (
                          <span className="text-amber-700">
                            Keluar
                            {item.alasan_eksklusi.length > 0 && (
                              <span className="block text-[11px] text-gray-400">
                                {item.alasan_eksklusi[0]}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-500">
                    Tidak ada gudang yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bar simpan. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
          <div className="text-xs text-gray-600">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Ada perubahan belum disimpan.
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pilihan sudah tersimpan.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || !dirty}
            className="inline-flex items-center gap-2 rounded-md bg-pupuk-darkGreen px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#00695c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Menyimpan..." : "Simpan lingkup nasional"}
          </button>
        </div>
      </div>
    </div>
  );
}
