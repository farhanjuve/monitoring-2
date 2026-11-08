"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Crosshair, Download, Globe2, Minus, Plus, Search, X } from "lucide-react";
import { KabupatenMap } from "@/components/peta/KabupatenMap";
import {
  type GeoCollection,
  type GeoFeature,
  type GudangView,
  type KapasitasMap,
  type StockBasis,
  type StockRow,
  STATUS_DESCRIPTION,
  STATUS_LABEL,
  buildStockAgg,
  buildViews,
  displayKabupaten,
  featureCenter,
  featureKey,
  formatPercent,
  formatTanggal,
  formatTon,
  statusFor,
  titleCaseName,
} from "@/lib/kabupaten";
import kapasitasData from "@/lib/kapasitas-gudang.json";
import { API_BASE_URL } from "@/lib/api";
import "./peta.css";

/**
 * Cadangan bila API kapasitas gagal dimuat. Sumber utama tetap database,
 * karena kapasitas sekarang bisa diubah lewat halaman Data Gudang.
 */
const KAPASITAS_CADANGAN = kapasitasData as KapasitasMap;

const HOME_CENTER: [number, number] = [118, -2.4];
const HOME_ZOOM = 1;

const STATUS_VAR: Record<string, string> = {
  ok: "var(--st-ok)",
  warn: "var(--st-warn)",
  low: "var(--st-low)",
  full: "var(--st-full)",
  na: "var(--st-na)",
  none: "var(--st-none)",
};

const STATUS_ORDER = ["ok", "warn", "low", "full", "na", "none"] as const;

interface CoverageKomoditas {
  tipe_pupuk: string;
  gudang_fisik: number;
  gudang_intransit: number;
  pabrik_fisik: number;
  pabrik_intransit: number;
  total_fisik: number;
}

interface CoverageSummary {
  tanggal: string;
  gudang: {
    total: number;
    aktif: number;
    dengan_stok: number;
    kode_plant: number;
    plant_terpetakan: number;
    plant_pabrik: number;
    plant_sap: number;
  };
  stok_gudang: { fisik: number; admin: number; intransit: number };
  pabrik: { fisik: number; intransit: number; plant: number };
  total_sap: { fisik: number; intransit: number };
  komoditas: CoverageKomoditas[];
}

/** Label ambang batas untuk legenda peta. */
const LEGEND_TEXT: Record<string, string> = {
  ok: "≤ 70%",
  warn: "70–90%",
  low: "90–100%",
  full: "> 100%",
  na: "Tanpa kapasitas",
  none: "Belum ada data",
};

export default function PetaKabupatenPage() {
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [kapasitas, setKapasitas] = useState<KapasitasMap>(KAPASITAS_CADANGAN);
  const [selectedDate, setSelectedDate] = useState("");
  const [basis, setBasis] = useState<StockBasis>("admin");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [center, setCenter] = useState<[number, number]>(HOME_CENTER);
  const [zoom, setZoom] = useState(HOME_ZOOM);
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const tanggal = selectedDate;

  // Batas kabupaten cukup dimuat sekali.
  useEffect(() => {
    let active = true;

    fetch("/indonesia-kabupaten.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("Gagal memuat batas kabupaten.");
        return res.json() as Promise<GeoCollection>;
      })
      .then((geoJson) => {
        if (active) setGeo(geoJson);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Gagal memuat batas kabupaten.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  // Daftar tanggal yang punya hasil kalkulasi stok.
  useEffect(() => {
    let active = true;

    fetch(`${API_BASE_URL}/api/stocks/dates`)
      .then((res) => (res.ok ? res.json() : []))
      .then((dates) => {
        if (!active) return;
        const list = Array.isArray(dates) ? (dates as string[]) : [];
        setAvailableDates(list);
        const fromUrl =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("tanggal") ?? ""
            : "";
        setSelectedDate((current) => {
          if (current && list.includes(current)) return current;
          if (fromUrl && list.includes(fromUrl)) return fromUrl;
          return list[0] ?? "";
        });
        if (list.length === 0) setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setAvailableDates([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Muat ulang stok + coverage setiap tanggal berubah.
  useEffect(() => {
    if (!selectedDate) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [stockRes, summaryRes] = await Promise.all([
          fetch(
            `${API_BASE_URL}/api/stocks/?tanggal=${encodeURIComponent(selectedDate)}`,
          ),
          fetch(
            `${API_BASE_URL}/api/stocks/coverage?tanggal=${encodeURIComponent(selectedDate)}`,
          ).catch(() => null),
        ]);
        if (!stockRes.ok) throw new Error("Gagal memuat data stok.");

        const stocks = await stockRes.json();
        const coverageJson =
          summaryRes && summaryRes.ok
            ? ((await summaryRes.json()) as CoverageSummary)
            : null;

        if (!active) return;
        setStockRows(Array.isArray(stocks) ? (stocks as StockRow[]) : []);
        setSummary(coverageJson);
        setSelectedKey(null);
        setPanelOpen(false);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Gagal memuat data.");
        setStockRows([]);
        setSummary(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [selectedDate]);

  // Kapasitas diambil dari database supaya perubahan di halaman Data Gudang
  // langsung terlihat. JSON bawaan hanya dipakai bila API gagal dimuat.
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/master-data/kapasitas`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("gagal"))))
      .then((items: Array<{ kode_plant: string; kapasitas_ton: number }>) => {
        if (!active || !Array.isArray(items) || items.length === 0) return;
        const peta: KapasitasMap = {};
        items.forEach((item) => {
          peta[item.kode_plant] = item.kapasitas_ton;
        });
        setKapasitas(peta);
      })
      .catch(() => {
        /* biarkan cadangan JSON tetap terpakai */
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDateChange = (value: string) => {
    setSelectedDate(value);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (value) params.set("tanggal", value);
    else params.delete("tanggal");
    const nextQuery = params.toString();
    window.history.replaceState(
      null,
      "",
      nextQuery ? `?${nextQuery}` : window.location.pathname,
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedKey(null);
        setPanelOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const stockAgg = useMemo(() => buildStockAgg(stockRows, kapasitas), [stockRows, kapasitas]);
  const views = useMemo(() => buildViews(stockAgg), [stockAgg]);

  const coverage = useMemo(() => {
    const counts = { ok: 0, warn: 0, low: 0, full: 0, na: 0, none: 0 } as Record<
      string,
      number
    >;
    let stokAdmin = 0;
    let stokFisik = 0;
    let kapasitas = 0;
    let gudang = 0;
    let tanpaKapasitas = 0;
    let stokTanpaKapasitas = 0;

    const features = geo?.features ?? [];
    features.forEach((feature) => {
      const view = views.get(featureKey(feature));
      if (!view) {
        counts.none += 1;
        return;
      }
      counts[view.status] += 1;
      stokAdmin += view.stokAdmin;
      stokFisik += view.stokFisik;
      kapasitas += view.kapasitas;
      gudang += view.gudang.length;
      view.gudang.forEach((item) => {
        if (item.kapasitas <= 0) {
          tanpaKapasitas += 1;
          stokTanpaKapasitas += item.stokAdmin;
        }
      });
    });

    return {
      counts,
      stokAdmin,
      stokFisik,
      kapasitas,
      gudang,
      tanpaKapasitas,
      stokTanpaKapasitas,
      sisa: kapasitas - stokAdmin,
      polygons: features.length,
      ratio: kapasitas > 0 ? stokAdmin / kapasitas : null,
    };
  }, [views, geo]);

  const geoKeys = useMemo(
    () => new Set((geo?.features ?? []).map((feature) => featureKey(feature))),
    [geo],
  );

  const withData = useMemo(
    () =>
      Array.from(views.values()).filter(
        (view) => geoKeys.has(view.key) && view.kapasitas > 0,
      ),
    [views, geoKeys],
  );

  const fullest = useMemo(
    () =>
      [...withData]
        .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
        .slice(0, 4),
    [withData],
  );

  const emptiest = useMemo(
    () =>
      [...withData]
        .sort((a, b) => b.kapasitas - b.stokAdmin - (a.kapasitas - a.stokAdmin))
        .slice(0, 4),
    [withData],
  );

  const selected = selectedKey ? views.get(selectedKey) ?? null : null;
  const selectedFeature = useMemo(() => {
    if (!selectedKey || !geo) return null;
    return geo.features.find((feature) => featureKey(feature) === selectedKey) ?? null;
  }, [geo, selectedKey]);

  const basisStok = selected
    ? basis === "admin"
      ? selected.stokAdmin
      : selected.stokFisikTransit
    : 0;
  const basisRatio =
    selected && selected.kapasitas > 0 ? basisStok / selected.kapasitas : null;
  const basisStatus = selected ? statusFor(basisStok, selected.kapasitas) : "none";

  const gudangList = useMemo(() => {
    if (!selected) return [] as GudangView[];
    const value = (gudang: GudangView) =>
      basis === "admin" ? gudang.stokAdmin : gudang.stokFisikTransit;
    return [...selected.gudang].sort((a, b) => {
      const ua = a.kapasitas > 0 ? value(a) / a.kapasitas : -1;
      const ub = b.kapasitas > 0 ? value(b) / b.kapasitas : -1;
      return ub !== ua ? ub - ua : value(b) - value(a);
    });
  }, [selected, basis]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !geo) return [];
    return geo.features
      .filter((feature) => (feature.properties.WADMKK ?? "").toLowerCase().includes(needle))
      .slice(0, 7)
      .map((feature) => {
        const key = featureKey(feature);
        return {
          key,
          name: feature.properties.WADMKK ?? "Tanpa nama",
          provinsi: feature.properties.WADMPR ?? "",
          view: views.get(key) ?? null,
          feature,
        };
      });
  }, [geo, query, views]);

  // Setiap wilayah yang dibuka mulai dari stok admin (dasar warna peta);
  // pengguna bisa beralih ke fisik di panel detail.
  const handleSelect = (key: string | null) => {
    if (key) setBasis("admin");
    setSelectedKey(key);
  };

  const focusKabupaten = (key: string, feature: GeoFeature) => {
    handleSelect(key);
    const point = featureCenter(feature);
    if (point) {
      setCenter(point);
      setZoom((current) => Math.max(current, 5));
    }
    setQuery("");
    setPanelOpen(false);
  };

  const focusByKey = (key: string) => {
    const feature = geo?.features.find((item) => featureKey(item) === key);
    if (feature) focusKabupaten(key, feature);
  };

  /** Unduh laporan keterisian gudang (Excel) untuk tanggal data yang sedang tampil. */
  const exportOccupancy = () => {
    const query = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : "";
    window.open(
      `${API_BASE_URL}/api/stocks/export-occupancy-excel${query}`,
      "_blank",
      "noopener",
    );
  };

  const drawerOpen = Boolean(selected || selectedFeature);

  return (
    <div className="peta-shell relative flex h-[100dvh] w-full flex-col overflow-hidden">
      <header className="relative z-30 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--peta-border)] bg-[var(--peta-surface)] px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="peta-focus inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-[var(--peta-dim)] transition-colors hover:text-[var(--peta-text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>

        <div className="min-w-0">
          <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-[var(--peta-text)]">
            Kapasitas Gudang per Kabupaten/Kota
          </h1>
          <p className="mt-0.5 truncate text-[11px] text-[var(--peta-mute)]">
            {tanggal
              ? `Stok admin ${formatTanggal(tanggal)}`
              : loading
                ? "Memuat periode…"
                : "Belum ada data"}
            {summary
              ? ` · ${summary.gudang.aktif} gudang · ${summary.gudang.kode_plant} kode plant`
              : coverage.gudang > 0
                ? ` · ${coverage.gudang} gudang`
                : ""}
          </p>
        </div>

        <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--peta-mute)]">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Tanggal data</span>
            <select
              value={selectedDate}
              onChange={(event) => handleDateChange(event.target.value)}
              disabled={availableDates.length === 0}
              aria-label="Pilih tanggal data"
              className="rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2 py-1.5 text-[11px] text-[var(--peta-text)] focus:border-[var(--peta-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {availableDates.length === 0 && (
                <option value="">Belum ada data</option>
              )}
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {formatTanggal(date)}
                </option>
              ))}
            </select>
          </label>

          <div ref={searchRef} className="relative w-full max-w-[220px] sm:w-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--peta-mute)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari kabupaten/kota…"
              aria-label="Cari kabupaten atau kota"
              className="w-full rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] py-1.5 pl-8 pr-2 text-xs text-[var(--peta-text)] placeholder:text-[var(--peta-mute)] focus:border-[var(--peta-accent)] focus:outline-none"
            />
            {results.length > 0 && (
              <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] shadow-2xl">
                {results.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => focusKabupaten(item.key, item.feature)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                    >
                      <span className="truncate">
                        <span className="text-[var(--peta-text)]">{item.name}</span>
                        <span className="ml-1.5 text-[var(--peta-mute)]">{item.provinsi}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--peta-mute)]">
                        {item.view ? formatPercent(item.view.ratio) : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/lingkup-nasional"
            title="Atur gudang yang masuk perhitungan nasional"
            className="peta-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--peta-border-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
          >
            <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
            Lingkup
          </Link>

          <button
            type="button"
            onClick={exportOccupancy}
            disabled={!tanggal}
            title="Unduh laporan keterisian gudang (Excel)"
            className="peta-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--peta-border-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Excel
          </button>

          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            className="peta-focus rounded-md border border-[var(--peta-border-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--peta-dim)] lg:hidden"
            aria-expanded={panelOpen}
          >
            Ringkasan
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside
          className={`peta-panel absolute left-3 top-3 z-20 w-[288px] max-w-[calc(100%-1.5rem)] rounded-xl border border-[var(--peta-border)] bg-[var(--peta-panel)] p-4 backdrop-blur-md sm:left-4 sm:top-4 lg:static lg:w-[300px] lg:max-w-none lg:shrink-0 lg:rounded-none lg:border-0 lg:border-r lg:border-[var(--peta-border)] lg:bg-[var(--peta-surface)]/40 lg:p-5 lg:backdrop-blur-none ${
            panelOpen ? "block" : "hidden"
          } lg:block`}
        >
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
            Kapasitas nasional
          </h2>

          <div className="mt-2 flex items-end gap-2">
            <span className="font-display text-[34px] font-semibold leading-none tracking-tight text-[var(--peta-text)] tabular-nums">
              {formatPercent(coverage.ratio)}
            </span>
            <span className="pb-1 text-[10px] leading-tight text-[var(--peta-mute)]">
              terisi dari
              <br />
              kapasitas gudang
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="text-[10px] text-[var(--peta-mute)]">Kapasitas</div>
              <div className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                {coverage.kapasitas > 0 ? `${formatTon(coverage.kapasitas)} t` : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="text-[10px] text-[var(--peta-mute)]">Stok admin</div>
              <div className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                {formatTon(coverage.stokAdmin)} t
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="text-[10px] text-[var(--peta-mute)]">Sisa ruang</div>
              <div className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                {formatTon(coverage.sisa)} t
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="text-[10px] text-[var(--peta-mute)]">Stok fisik</div>
              <div className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                {formatTon(coverage.stokFisik)} t
              </div>
            </div>
          </div>

          {summary && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2">
                  <div className="text-[10px] text-[var(--peta-mute)]">Gudang dipantau</div>
                  <div className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                    {summary.gudang.aktif}{" "}
                    <span className="text-[10px] font-normal text-[var(--peta-mute)]">
                      / {summary.gudang.total} total
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2">
                  <div className="text-[10px] text-[var(--peta-mute)]">Kode plant</div>
                  <div className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                    {summary.gudang.kode_plant}
                  </div>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-dashed border-[var(--peta-border-strong)] px-2.5 py-2"
                title={summary.komoditas
                  .map((item) => `${item.tipe_pupuk} ${formatTon(item.pabrik_fisik)} t`)
                  .join(" · ")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--peta-mute)]">
                    Stok pabrik
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--peta-mute)]">
                    {summary.pabrik.plant} plant tanpa gudang
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="font-display text-sm text-[var(--peta-text)] tabular-nums">
                    {formatTon(summary.pabrik.fisik)} t
                  </span>
                  <span className="text-[10px] text-[var(--peta-mute)]">
                    intransit {formatTon(summary.pabrik.intransit)} t
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-[var(--peta-mute)]">
                  {formatTon(summary.stok_gudang.fisik)} t gudang +{" "}
                  {formatTon(summary.pabrik.fisik)} t pabrik ={" "}
                  {formatTon(summary.total_sap.fisik)} t total SAP
                </p>
              </div>
            </>
          )}

          <ul className="mt-3 space-y-1.5">
            {STATUS_ORDER.map((status) => (
              <li key={status} className="flex items-center gap-2 text-[11px]">
                <span className={`peta-dot peta-fill-${status}`} aria-hidden="true" />
                <span
                  className="flex-1 truncate text-[var(--peta-dim)]"
                  title={STATUS_DESCRIPTION[status]}
                >
                  {STATUS_LABEL[status]}
                </span>
                <span className="font-display text-[var(--peta-text)] tabular-nums">
                  {coverage.counts[status] ?? 0}
                </span>
              </li>
            ))}
          </ul>

          {fullest.length > 0 && (
            <div className="mt-4 border-t border-[var(--peta-border)] pt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                Paling penuh
              </h3>
              <ul className="mt-2 space-y-1">
                {fullest.map((view) => (
                  <li key={view.key}>
                    <button
                      type="button"
                      onClick={() => focusByKey(view.key)}
                      className="peta-focus flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-[11px] text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                    >
                      <span className="truncate">{displayKabupaten(view.kabupaten)}</span>
                      <span
                        className="shrink-0 font-display tabular-nums"
                        style={{ color: STATUS_VAR[view.status] }}
                      >
                        {formatPercent(view.ratio)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {emptiest.length > 0 && (
            <div className="mt-4 border-t border-[var(--peta-border)] pt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                Ruang kosong terbesar
              </h3>
              <ul className="mt-2 space-y-1">
                {emptiest.map((view) => (
                  <li key={view.key}>
                    <button
                      type="button"
                      onClick={() => focusByKey(view.key)}
                      className="peta-focus flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-[11px] text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                    >
                      <span className="truncate">{displayKabupaten(view.kabupaten)}</span>
                      <span className="shrink-0 font-display tabular-nums text-[var(--st-ok)]">
                        {formatTon(view.kapasitas - view.stokAdmin)} t
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 border-t border-[var(--peta-border)] pt-2 text-[10px] leading-relaxed text-[var(--peta-mute)]">
            {coverage.counts.none} dari {coverage.polygons} kabupaten/kota belum punya
            gudang dan tampil abu-abu.{" "}
            {coverage.tanpaKapasitas > 0
              ? `${coverage.tanpaKapasitas} gudang (${formatTon(coverage.stokTanpaKapasitas)} t stok admin) belum punya data kapasitas, jadi tidak ikut dihitung.`
              : "Semua gudang sudah punya data kapasitas."}{" "}
            Gudang pabrik/pelabuhan dan gudang yang tidak dicentang di Lingkup
            Nasional tidak dihitung.
          </p>
        </aside>

        <div className="relative min-h-0 flex-1">
          <KabupatenMap
            geo={geo}
            views={views}
            selectedKey={selectedKey}
            onSelect={handleSelect}
            center={center}
            zoom={zoom}
            onMoveEnd={(nextCenter, nextZoom) => {
              setCenter(nextCenter);
              setZoom(nextZoom);
            }}
          />

          {loading && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rounded-full border border-[var(--peta-border-strong)] bg-[var(--peta-surface)]/90 px-4 py-2 text-xs text-[var(--peta-dim)]">
                Memuat peta dan data stok…
              </span>
            </div>
          )}

          {error && (
            <div className="absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/80 px-4 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          <div
            className={`pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4 ${
              drawerOpen ? "sm:pr-[360px]" : ""
            }`}
          >
            <ul className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--peta-border)] bg-[var(--peta-panel)] px-3 py-2 text-[10px] text-[var(--peta-dim)] backdrop-blur-md">
              {STATUS_ORDER.map((status) => (
                <li key={status} className="flex items-center gap-1.5">
                  <span className={`peta-dot peta-fill-${status}`} aria-hidden="true" />
                  {LEGEND_TEXT[status]}
                </li>
              ))}
            </ul>

            <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-[var(--peta-border)] bg-[var(--peta-panel)] backdrop-blur-md">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(12, value * 1.4))}
                className="peta-focus p-2 text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                aria-label="Perbesar peta"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(1, value / 1.4))}
                className="peta-focus border-t border-[var(--peta-border)] p-2 text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                aria-label="Perkecil peta"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCenter(HOME_CENTER);
                  setZoom(HOME_ZOOM);
                }}
                className="peta-focus border-t border-[var(--peta-border)] p-2 text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                aria-label="Kembalikan tampilan peta"
              >
                <Crosshair className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {(selected || selectedFeature) && (
            <div className="pointer-events-none absolute inset-0 z-30">
              <aside className="peta-drawer pointer-events-auto absolute inset-x-0 bottom-0 max-h-[68dvh] overflow-hidden rounded-t-2xl border-t border-[var(--peta-border-strong)] bg-[var(--peta-surface)] p-4 sm:inset-y-4 sm:left-auto sm:right-4 sm:max-h-none sm:w-[344px] sm:rounded-xl sm:border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                      {titleCaseName(selected?.provinsi ?? selectedFeature?.properties.WADMPR)}
                    </p>
                    <h2 className="mt-1 font-display text-lg font-semibold leading-tight text-[var(--peta-text)]">
                      {selected
                        ? displayKabupaten(selected.kabupaten)
                        : selectedFeature?.properties.WADMKK ?? "Kabupaten"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(null)}
                    className="peta-focus -mr-1 -mt-1 rounded-md p-1.5 text-[var(--peta-mute)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                    aria-label="Tutup detail"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {selected ? (
                  <>
                    <div className="mt-3 flex items-start gap-2">
                      <span
                        className={`peta-dot mt-1 peta-fill-${basisStatus}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-xs leading-tight text-[var(--peta-dim)]">
                          {STATUS_LABEL[basisStatus]}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-snug text-[var(--peta-mute)]">
                          {STATUS_DESCRIPTION[basisStatus]}
                        </p>
                      </div>
                    </div>

                    <div
                      role="group"
                      aria-label="Pilih dasar stok"
                      className="mt-3 flex items-center gap-1 rounded-lg border border-[var(--peta-border)] bg-[var(--peta-surface-2)] p-1"
                    >
                      {(["admin", "fisik"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={basis === option}
                          onClick={() => setBasis(option)}
                          className={`peta-focus flex-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            basis === option
                              ? "bg-[var(--peta-accent)] text-[var(--peta-accent-ink)]"
                              : "text-[var(--peta-dim)] hover:text-[var(--peta-text)]"
                          }`}
                        >
                          Stok {option}
                        </button>
                      ))}
                    </div>

                    <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <dt className="text-[10px] text-[var(--peta-mute)]">
                          {basis === "admin" ? "Stok admin" : "Stok fisik + transit"}
                        </dt>
                        <dd className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                          {formatTon(basisStok)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[var(--peta-mute)]">Kapasitas</dt>
                        <dd className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                          {selected.kapasitas > 0 ? formatTon(selected.kapasitas) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-[var(--peta-mute)]">Utilisasi</dt>
                        <dd
                          className="mt-0.5 font-display text-sm tabular-nums"
                          style={{ color: STATUS_VAR[basisStatus] }}
                        >
                          {formatPercent(basisRatio)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full peta-fill-${basisStatus}`}
                        style={{ width: `${Math.min(100, (basisRatio ?? 0) * 100)}%` }}
                      />
                    </div>

                    {selected.transitTransfer > 0 && (
                      <p className="mt-2 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                        Sekitar{" "}
                        <b className="tabular-nums text-[var(--peta-dim)]">
                          {formatTon(selected.transitTransfer)} ton
                        </b>{" "}
                        berstatus <b className="text-[var(--peta-dim)]">transit transfer</b> —
                        barang sedang menuju gudang ini. Angka ini sudah termasuk pada basis
                        stok fisik.
                      </p>
                    )}

                    {selected.kapasitas > 0 ? (
                      <p className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--peta-mute)]">
                        <span>
                          {selected.kapasitas >= basisStok ? "Sisa ruang" : "Kelebihan stok"}
                        </span>
                        <span className="font-display text-[11px] tabular-nums text-[var(--peta-dim)]">
                          {formatTon(Math.abs(selected.kapasitas - basisStok))} ton
                        </span>
                      </p>
                    ) : (
                      <p className="mt-3 rounded-md border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                        Kapasitas gudang di wilayah ini belum ada di master, jadi utilisasi
                        tidak dihitung.
                      </p>
                    )}

                    <div className="mt-4 border-t border-[var(--peta-border)] pt-3">
                      <div className="flex items-baseline justify-between">
                        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                          Gudang ({gudangList.length})
                        </h3>
                        <span className="text-[10px] text-[var(--peta-mute)]">
                          stok {basis}
                        </span>
                      </div>
                      <ul className="peta-scroll mt-2 max-h-[34dvh] space-y-0.5 overflow-y-auto pr-1 sm:max-h-[calc(100dvh-27rem)]">
                        {gudangList.map((gudang) => {
                          const stok = basis === "admin" ? gudang.stokAdmin : gudang.stokFisikTransit;
                          const rasio =
                            gudang.kapasitas > 0 ? stok / gudang.kapasitas : null;
                          const status = statusFor(stok, gudang.kapasitas);
                          return (
                            <li
                              key={gudang.id}
                              className="rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]"
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span
                                  className="min-w-0 truncate text-[var(--peta-dim)]"
                                  title={gudang.nama}
                                >
                                  {gudang.nama}
                                </span>
                                <span className="shrink-0 font-display text-[var(--peta-text)] tabular-nums">
                                  {formatTon(stok)} t
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--peta-mute)]">
                                <span className="truncate">
                                  {gudang.plant ? `Plant ${gudang.plant}` : "Tanpa kode plant"}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {rasio == null ? (
                                    "tanpa kapasitas"
                                  ) : (
                                    <span style={{ color: STATUS_VAR[status] }}>
                                      {formatPercent(rasio)} dari{" "}
                                      {formatTon(gudang.kapasitas)} t
                                    </span>
                                  )}
                                </span>
                              </div>
                              {gudang.transitTransfer > 0 && (
                                <div className="mt-0.5 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                                  <span className="tabular-nums">
                                    ± {formatTon(gudang.transitTransfer)} t
                                  </span>{" "}
                                  transit transfer — barang menuju gudang ini
                                </div>
                              )}
                            </li>
                          );
                        })}
                        {gudangList.length === 0 && (
                          <li className="px-1.5 py-1 text-[11px] text-[var(--peta-mute)]">
                            Belum ada gudang terdata.
                          </li>
                        )}
                      </ul>
                      <p className="mt-2 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                        Warna peta memakai stok admin. Kapasitas gudang multi-plant dijumlahkan.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 rounded-md border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--peta-mute)]">
                    Belum ada data gudang untuk wilayah ini.
                  </p>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
