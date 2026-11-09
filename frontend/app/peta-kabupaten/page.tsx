"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Crosshair,
  Download,
  FileText,
  Globe2,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { KabupatenMap } from "@/components/peta/KabupatenMap";
import { DashboardConfigPanel } from "@/components/peta/DashboardConfigPanel";
import {
  type GeoCollection,
  type GeoFeature,
  type KabupatenStatus,
  STATUS_LABEL,
  displayKabupaten,
  featureCenter,
  featureKey,
  formatPercent,
  formatTanggal,
  formatTon,
  kabupatenKey,
  titleCaseName,
} from "@/lib/kabupaten";
import {
  DEFAULT_CONFIG,
  INDIKATOR_LABEL,
  applyPreset,
  configFromSearchParams,
  configToSearchParams,
  countActiveFilters,
  deleteNamedPreset,
  hasConfigParams,
  isRatioIndikator,
  loadLastConfig,
  loadSavedPresets,
  normalizeConfig,
  saveLastConfig,
  saveNamedPreset,
  type DashboardConfig,
  type SavedPreset,
} from "@/lib/dashboard-config";
import {
  type PetaAggregate,
  type PetaMapView,
  type PetaNode,
  type PetaRankingItem,
  PABRIK_BUCKET_LABEL,
  PABRIK_BUCKET_ORDER,
  computeQuantiles,
  fetchPetaAggregate,
  fetchPetaScopeOptions,
  formatIndicatorValue,
  formatPercentOrNA,
  formatTonOrNA,
  geoKeyForNode,
  nodeMetricValue,
  nodeRatioValue,
  normalizeWilayah,
} from "@/lib/peta-aggregate";
import { API_BASE_URL } from "@/lib/api";
import "./peta.css";

const HOME_CENTER: [number, number] = [118, -2.4];
const HOME_ZOOM = 1;

const STATUS_ORDER: KabupatenStatus[] = ["ok", "warn", "low", "full", "na", "none"];

const STATUS_VAR: Record<string, string> = {
  ok: "var(--st-ok)",
  warn: "var(--st-warn)",
  low: "var(--st-low)",
  full: "var(--st-full)",
  na: "var(--st-na)",
  none: "var(--st-none)",
};

interface ScopeOptions {
  provinsi: string[];
  kabupaten: Array<{ nama: string; provinsi: string }>;
  produk: string[];
  anper: string[];
}

const EMPTY_OPTIONS: ScopeOptions = {
  provinsi: [],
  kabupaten: [],
  produk: [],
  anper: [],
};

interface LegendItem {
  status: KabupatenStatus;
  label: string;
}

interface MapScale {
  ratio: boolean;
  quantiles: [number, number, number] | null;
  inverted: boolean;
  legends: LegendItem[];
}

function bucketTon(
  value: number,
  quantiles: [number, number, number] | null,
  inverted: boolean,
): KabupatenStatus {
  if (!quantiles) return "ok";
  const [q1, q2, q3] = quantiles;
  if (!inverted) {
    if (value <= q1) return "ok";
    if (value <= q2) return "warn";
    if (value <= q3) return "low";
    return "full";
  }
  if (value <= q1) return "full";
  if (value <= q2) return "low";
  if (value <= q3) return "warn";
  return "ok";
}

function statusForRatio(
  ratio: number | null,
  thresholds: DashboardConfig["thresholds"],
): KabupatenStatus {
  if (ratio == null) return "na";
  const [lega, waspada, kritis] = thresholds;
  const persen = ratio * 100;
  if (persen <= lega) return "ok";
  if (persen <= waspada) return "warn";
  if (persen <= kritis) return "low";
  return "full";
}

function buildMapScale(
  indikator: DashboardConfig["indikator"],
  thresholds: DashboardConfig["thresholds"],
  values: number[],
): MapScale {
  if (isRatioIndikator(indikator)) {
    const [lega, waspada, kritis] = thresholds;
    return {
      ratio: true,
      quantiles: null,
      inverted: false,
      legends: [
        { status: "ok", label: `Lega · ≤ ${lega}%` },
        { status: "warn", label: `Waspada · ${lega}–${waspada}%` },
        { status: "low", label: `Kritis · ${waspada}–${kritis}%` },
        { status: "full", label: `Penuh · > ${kritis}%` },
      ],
    };
  }

  const inverted = indikator === "kapasitas_tersisa";
  let quantiles = computeQuantiles(values);
  if (!quantiles && values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    quantiles = [min + (max - min) / 3, min + (2 * (max - min)) / 3, max];
  }

  const label = (value: number) => `${formatTonOrNA(value)} t`;
  if (!quantiles) {
    return {
      ratio: false,
      quantiles: null,
      inverted,
      legends: [
        { status: "ok", label: "Nilai terendah" },
        { status: "warn", label: "Nilai rendah" },
        { status: "low", label: "Nilai tinggi" },
        { status: "full", label: "Nilai tertinggi" },
      ],
    };
  }

  const [q1, q2, q3] = quantiles;
  return {
    ratio: false,
    quantiles,
    inverted,
    legends: inverted
      ? [
          { status: "ok", label: `> ${label(q3)}` },
          { status: "warn", label: `${label(q2)}–${label(q3)}` },
          { status: "low", label: `${label(q1)}–${label(q2)}` },
          { status: "full", label: `≤ ${label(q1)}` },
        ]
      : [
          { status: "ok", label: `≤ ${label(q1)}` },
          { status: "warn", label: `${label(q1)}–${label(q2)}` },
          { status: "low", label: `${label(q2)}–${label(q3)}` },
          { status: "full", label: `> ${label(q3)}` },
        ],
  };
}

export default function PetaKabupatenPage() {
  const [geo, setGeo] = useState<GeoCollection | null>(null);
  const [data, setData] = useState<PetaAggregate | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [options, setOptions] = useState<ScopeOptions>(EMPTY_OPTIONS);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [center, setCenter] = useState<[number, number]>(HOME_CENTER);
  const [zoom, setZoom] = useState(HOME_ZOOM);
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [rankingTab, setRankingTab] = useState<"penuh" | "kosong">("penuh");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const searchRef = useRef<HTMLDivElement | null>(null);

  // Konfigurasi awal: URL menang atas localStorage supaya tautan bisa dibagikan.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dariUrl = hasConfigParams(params) ? configFromSearchParams(params) : null;
    const tersimpan = loadLastConfig();
    setConfig(dariUrl ?? tersimpan ?? DEFAULT_CONFIG);
    setSavedPresets(loadSavedPresets());
    setConfigReady(true);
  }, []);

  // Simpan konfigurasi ke URL + localStorage.
  useEffect(() => {
    if (!configReady || typeof window === "undefined") return;
    saveLastConfig(config);
    const queryString = configToSearchParams(config).toString();
    const next = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) window.history.replaceState(null, "", next);
  }, [config, configReady]);

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
        setError(err instanceof Error ? err.message : "Gagal memuat batas kabupaten.");
      });

    return () => {
      active = false;
    };
  }, []);

  // Daftar tanggal snapshot.
  useEffect(() => {
    let active = true;

    fetch(`${API_BASE_URL}/api/stocks/dates`)
      .then((res) => (res.ok ? res.json() : []))
      .then((dates) => {
        if (!active) return;
        const list = Array.isArray(dates) ? (dates as string[]) : [];
        setAvailableDates(list);
        setConfig((current) => {
          if (!current.tanggal) return current;
          if (list.length === 0 || list.includes(current.tanggal)) return current;
          return { ...current, tanggal: list[0] };
        });
      })
      .catch(() => {
        if (active) setAvailableDates([]);
      });

    return () => {
      active = false;
    };
  }, []);

  // Pilihan filter wilayah/produk/Anper. Dimuat sekali per tanggal supaya
  // pilihan provinsi tidak mengecil setelah provinsi dipilih.
  useEffect(() => {
    if (!configReady) return;
    let active = true;
    const controller = new AbortController();

    fetchPetaScopeOptions(config.tanggal, controller.signal)
      .then((hasil) => {
        if (!active) return;
        setOptions({
          provinsi: hasil.provinsi,
          kabupaten: hasil.kabupaten,
          produk: hasil.produk,
          anper: hasil.anper,
        });
      })
      .catch(() => {
        /* biarkan pilihan lama; endpoint agregat tetap bisa dipakai */
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [config.tanggal, configReady]);

  // Satu panggilan untuk KPI, peta, ranking, dan Stok Pabrik.
  useEffect(() => {
    if (!configReady) return;
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetchPetaAggregate(config, controller.signal)
      .then((hasil) => {
        if (!active) return;
        setData(hasil);
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Gagal memuat data peta.");
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [config, configReady, reloadKey]);

  // Setelah filter berubah, jangan biarkan drawer menampilkan wilayah yang
  // sudah keluar dari cakupan.
  useEffect(() => {
    if (!data) return;
    setSelectedKey((current) => {
      if (!current) return current;
      return data.levels.kabupaten.some((node) => geoKeyForNode(node) === current)
        ? current
        : null;
    });
  }, [data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedKey(null);
        setPanelOpen(false);
        setConfigOpen(false);
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

  const tanggalAktif = config.tanggal || data?.tanggal || "";
  const indikator = config.indikator;
  const indikatorLabel = INDIKATOR_LABEL[indikator];
  const activeFilterCount = countActiveFilters(config);
  const warnings = data?.meta.warnings ?? [];

  const nodeByGeo = useMemo(() => {
    const map = new Map<string, PetaNode>();
    (data?.levels.kabupaten ?? []).forEach((node) => {
      const key = geoKeyForNode(node);
      if (key) map.set(key, node);
    });
    return map;
  }, [data]);

  const mapValues = useMemo(() => {
    if (!data || isRatioIndikator(indikator)) return [];
    return data.levels.kabupaten
      .filter((node) => node.has_data)
      .map((node) => nodeMetricValue(node, indikator))
      .filter((value): value is number => value != null && Number.isFinite(value));
  }, [data, indikator]);

  const mapScale = useMemo(
    () => buildMapScale(indikator, config.thresholds, mapValues),
    [indikator, config.thresholds, mapValues],
  );

  const geoViews = useMemo(() => {
    const map = new Map<string, PetaMapView>();
    (data?.levels.kabupaten ?? []).forEach((node) => {
      const key = geoKeyForNode(node);
      if (!key) return;
      const nilai = nodeMetricValue(node, indikator);
      let status: KabupatenStatus;
      let statusLabel: string;

      if (!node.has_data) {
        status = "none";
        statusLabel = "Belum ada data";
      } else if (nilai == null) {
        status = "na";
        statusLabel = "Nilai tidak tersedia";
      } else if (mapScale.ratio) {
        status = (node.status_indikator ?? node.status) as KabupatenStatus;
        if (status === "none") status = "na";
        statusLabel = STATUS_LABEL[status];
      } else {
        status = bucketTon(nilai, mapScale.quantiles, mapScale.inverted);
        statusLabel = mapScale.legends.find((item) => item.status === status)?.label ?? "—";
      }

      map.set(key, {
        key,
        node,
        status,
        statusLabel,
        metricLabel: indikatorLabel,
        metricText: formatIndicatorValue(nilai, indikator),
      });
    });
    return map;
  }, [data, indikator, indikatorLabel, mapScale]);

  const statusCounts = useMemo(() => {
    const counts: Record<KabupatenStatus, number> = {
      ok: 0,
      warn: 0,
      low: 0,
      full: 0,
      na: 0,
      none: 0,
    };
    const features = geo?.features ?? [];
    features.forEach((feature) => {
      const view = geoViews.get(featureKey(feature));
      counts[view?.status ?? "none"] += 1;
    });
    return counts;
  }, [geo, geoViews]);

  const geoKeys = useMemo(
    () => new Set((geo?.features ?? []).map((feature) => featureKey(feature))),
    [geo],
  );

  const selectedView = selectedKey ? geoViews.get(selectedKey) ?? null : null;
  const selectedNode = selectedView?.node ?? null;
  const selectedFeature = useMemo(() => {
    if (!selectedKey || !geo) return null;
    return geo.features.find((feature) => featureKey(feature) === selectedKey) ?? null;
  }, [geo, selectedKey]);

  const selectedMetric = selectedNode ? nodeMetricValue(selectedNode, indikator) : null;
  const selectedRatio = selectedNode ? nodeRatioValue(selectedNode, indikator) : null;

  const gudangList = useMemo(() => {
    if (!selectedNode || !data) return [];
    const provinsi = normalizeWilayah(selectedNode.provinsi);
    return data.levels.gudang
      .filter(
        (gudang) =>
          geoKeyForNode(gudang) === selectedKey &&
          normalizeWilayah(gudang.provinsi) === provinsi,
      )
      .sort((a, b) => {
        const va = nodeMetricValue(a, indikator);
        const vb = nodeMetricValue(b, indikator);
        if (va == null && vb == null) return b.stok_fisik - a.stok_fisik;
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;
      });
  }, [data, selectedNode, selectedKey, indikator]);

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
          view: geoViews.get(key) ?? null,
          feature,
        };
      });
  }, [geo, query, geoViews]);

  const kpi = data?.kpi ?? null;
  const kpiMetric = kpi ? nodeMetricValue(kpi, indikator) : null;
  const scopeLabel = kpi
    ? kpi.nama === "Nasional"
      ? "Nasional"
      : config.kabupaten
        ? displayKabupaten(kpi.nama)
        : titleCaseName(kpi.nama)
    : "—";

  const ranking = data?.ranking ?? null;
  const rankingItems: PetaRankingItem[] =
    rankingTab === "penuh" ? ranking?.penuh ?? [] : ranking?.kosong ?? [];

  const updateConfig = (next: DashboardConfig) => setConfig(next);

  const patchConfig = (patch: Partial<DashboardConfig>) =>
    setConfig((current) => applyPreset(current, patch));

  const resetDashboard = () => {
    setConfig((current) => ({ ...DEFAULT_CONFIG, tanggal: current.tanggal }));
    setSelectedKey(null);
    setQuery("");
    setReportMode(false);
  };

  const handleSelect = (key: string | null) => {
    setSelectedKey(key);
  };

  const focusGeoKey = (key: string) => {
    if (!geoKeys.has(key)) return;
    handleSelect(key);
    const feature = geo?.features.find((item) => featureKey(item) === key);
    const point = feature ? featureCenter(feature) : null;
    if (point) {
      setCenter(point);
      setZoom((current) => Math.max(current, 5));
    }
    setQuery("");
    setPanelOpen(false);
  };

  const focusRankingItem = (item: PetaRankingItem) => {
    const key = kabupatenKey(item.kota ?? item.nama);
    focusGeoKey(key);
  };

  const exportOccupancy = () => {
    const queryString = tanggalAktif
      ? `?tanggal=${encodeURIComponent(tanggalAktif)}`
      : "";
    window.open(
      `${API_BASE_URL}/api/stocks/export-occupancy-excel${queryString}`,
      "_blank",
      "noopener",
    );
  };

  const chips = useMemo(() => {
    const list: Array<{ id: string; label: string; clear: () => void }> = [];
    config.produk.forEach((produk) => {
      list.push({
        id: `produk-${produk}`,
        label: produk,
        clear: () =>
          setConfig((current) => ({
            ...current,
            produk: current.produk.filter((item) => item !== produk),
          })),
      });
    });
    config.anper.forEach((anper) => {
      list.push({
        id: `anper-${anper}`,
        label: `Anper ${anper}`,
        clear: () =>
          setConfig((current) => ({
            ...current,
            anper: current.anper.filter((item) => item !== anper),
          })),
      });
    });
    if (config.subsidi !== "SEMUA") {
      list.push({
        id: "subsidi",
        label: config.subsidi === "SUBSIDI" ? "Subsidi" : "Non subsidi",
        clear: () => setConfig((current) => ({ ...current, subsidi: "SEMUA" })),
      });
    }
    if (config.provinsi) {
      list.push({
        id: "provinsi",
        label: config.provinsi,
        clear: () =>
          setConfig((current) => ({ ...current, provinsi: "", kabupaten: "" })),
      });
    }
    if (config.kabupaten) {
      list.push({
        id: "kabupaten",
        label: displayKabupaten(config.kabupaten),
        clear: () => setConfig((current) => ({ ...current, kabupaten: "" })),
      });
    }
    if (config.indikator !== DEFAULT_CONFIG.indikator) {
      list.push({
        id: "indikator",
        label: `Peta: ${INDIKATOR_LABEL[config.indikator]}`,
        clear: () =>
          setConfig((current) => ({
            ...current,
            indikator: DEFAULT_CONFIG.indikator,
          })),
      });
    }
    const [a, b, c] = config.thresholds;
    if (
      a !== DEFAULT_CONFIG.thresholds[0] ||
      b !== DEFAULT_CONFIG.thresholds[1] ||
      c !== DEFAULT_CONFIG.thresholds[2]
    ) {
      list.push({
        id: "ambang",
        label: `Ambang ${a}/${b}/${c}%`,
        clear: () =>
          setConfig((current) => ({
            ...current,
            thresholds: DEFAULT_CONFIG.thresholds,
          })),
      });
    }
    return list;
  }, [config]);

  const drawerOpen = Boolean(selectedNode || selectedFeature);
  const empty = Boolean(data && data.meta.gudang_scope === 0);

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
            {reportMode ? "Laporan Manajemen Kapasitas Gudang" : "Kapasitas Gudang per Kabupaten/Kota"}
          </h1>
          <p
            className="mt-0.5 truncate text-[11px] text-[var(--peta-mute)]"
            title={
              data
                ? `Sumber: ${data.meta.sumber} · ${data.meta.kapasitas_basis}`
                : undefined
            }
          >
            {tanggalAktif
              ? `Snapshot ${formatTanggal(tanggalAktif)}`
              : loading
                ? "Memuat periode…"
                : "Belum ada data"}
            {data ? ` · ${data.meta.gudang_scope} gudang · ${scopeLabel}` : ""}
          </p>
        </div>

        <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--peta-mute)]">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Tanggal data</span>
            <select
              value={config.tanggal || data?.tanggal || ""}
              onChange={(event) =>
                setConfig((current) => ({ ...current, tanggal: event.target.value }))
              }
              disabled={availableDates.length === 0}
              aria-label="Pilih tanggal data"
              className="rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2 py-1.5 text-[11px] text-[var(--peta-text)] focus:border-[var(--peta-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {availableDates.length === 0 && <option value="">Belum ada data</option>}
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {formatTanggal(date)}
                </option>
              ))}
            </select>
          </label>

          {!reportMode && (
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
                        onClick={() => focusGeoKey(item.key)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                      >
                        <span className="truncate">
                          <span className="text-[var(--peta-text)]">{item.name}</span>
                          <span className="ml-1.5 text-[var(--peta-mute)]">{item.provinsi}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-[var(--peta-mute)]">
                          {item.view ? item.view.metricText : "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!reportMode && (
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="peta-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--peta-border-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              Konfigurasi
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-[var(--peta-accent)] px-1.5 py-px text-[9px] font-bold text-[var(--peta-accent-ink)]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {!reportMode && activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetDashboard}
              title="Reset semua filter"
              className="peta-focus inline-flex items-center gap-1 rounded-md border border-[var(--peta-border-strong)] px-2 py-1.5 text-[10px] font-medium text-[var(--peta-mute)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const next = !reportMode;
              setReportMode(next);
              if (next) setPanelOpen(true);
              setConfigOpen(false);
            }}
            aria-pressed={reportMode}
            className={`peta-focus inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              reportMode
                ? "border-[var(--peta-accent)] bg-[var(--peta-accent)]/10 text-[var(--peta-accent)]"
                : "border-[var(--peta-border-strong)] text-[var(--peta-dim)] hover:bg-white/5 hover:text-[var(--peta-text)]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {reportMode ? "Keluar Laporan" : "Laporan"}
          </button>

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
            disabled={!tanggalAktif}
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

      {!reportMode && chips.length > 0 && (
        <div className="peta-scroll relative z-20 flex items-center gap-1.5 overflow-x-auto border-b border-[var(--peta-border)] bg-[var(--peta-surface)]/60 px-4 py-1.5 sm:px-6">
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
            Filter aktif
          </span>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.clear}
              title={`Hapus filter ${chip.label}`}
              className="peta-focus inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2 py-0.5 text-[10px] text-[var(--peta-dim)] transition-colors hover:border-[var(--peta-accent)]/60 hover:text-[var(--peta-text)]"
            >
              {chip.label}
              <X className="h-2.5 w-2.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={resetDashboard}
            className="peta-focus ml-auto shrink-0 text-[10px] text-[var(--peta-mute)] underline-offset-2 hover:text-[var(--peta-text)] hover:underline"
          >
            Hapus semua
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside
          className={`peta-panel absolute left-3 top-3 z-20 w-[300px] max-w-[calc(100%-1.5rem)] rounded-xl border border-[var(--peta-border)] bg-[var(--peta-panel)] p-4 backdrop-blur-md sm:left-4 sm:top-4 lg:static lg:w-[320px] lg:max-w-none lg:shrink-0 lg:rounded-none lg:border-0 lg:border-r lg:border-[var(--peta-border)] lg:bg-[var(--peta-surface)]/40 lg:p-5 lg:backdrop-blur-none ${
            panelOpen ? "block" : "hidden"
          } lg:block`}
        >
          {reportMode && (
            <div className="mb-3 rounded-lg border border-[var(--peta-accent)]/30 bg-[var(--peta-accent)]/[0.06] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-accent)]">
                Laporan Manajemen
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--peta-dim)]">
                Snapshot {tanggalAktif ? formatTanggal(tanggalAktif) : "—"} · {scopeLabel}
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--peta-mute)]">
                Sumber: {data?.meta.sumber ?? "MB52 + ZSD_SODO + master kapasitas"}
              </p>
            </div>
          )}

          <h2 className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
            {indikatorLabel} · {scopeLabel}
          </h2>

          <div className="mt-2 flex items-end gap-2">
            <span className="font-display text-[32px] font-semibold leading-none tracking-tight text-[var(--peta-text)] tabular-nums">
              {kpiMetric == null
                ? "N/A"
                : isRatioIndikator(indikator)
                  ? formatPercent(kpiMetric)
                  : formatTon(kpiMetric)}
            </span>
            <span className="pb-1 text-[10px] leading-tight text-[var(--peta-mute)]">
              {isRatioIndikator(indikator) ? (
                <>
                  terisi dari
                  <br />
                  kapasitas gudang
                </>
              ) : (
                <>
                  ton
                  <br />
                  indikator aktif
                </>
              )}
            </span>
          </div>

          {kpi && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { label: "Kapasitas", value: `${formatTonOrNA(kpi.kapasitas)} t` },
                  { label: "Stok fisik", value: `${formatTonOrNA(kpi.stok_fisik)} t` },
                  { label: "Intransit", value: `${formatTonOrNA(kpi.intransit)} t` },
                  { label: "Total stok", value: `${formatTonOrNA(kpi.total_stok)} t` },
                  { label: "Stok admin", value: `${formatTonOrNA(kpi.stok_admin)} t` },
                  { label: "Outstanding SO", value: `${formatTonOrNA(kpi.outstanding_so)} t` },
                  { label: "Sisa ruang", value: `${formatTonOrNA(kpi.sisa_ruang)} t` },
                  {
                    label: "Keterisian admin",
                    value: formatPercentOrNA(kpi.keterisian_admin),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg bg-white/[0.03] px-2.5 py-2"
                    title={
                      item.label === "Sisa ruang"
                        ? "Sisa ruang = kapasitas - stok admin"
                        : undefined
                    }
                  >
                    <div className="text-[10px] text-[var(--peta-mute)]">{item.label}</div>
                    <div className="mt-0.5 font-display text-sm text-[var(--peta-text)] tabular-nums">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-lg border border-[var(--peta-border)] bg-white/[0.02] px-2 py-1.5 text-[10px]">
                <div>
                  <span className="block text-[var(--peta-mute)]">Admin</span>
                  <span className="font-display tabular-nums text-[var(--peta-dim)]">
                    {formatPercentOrNA(kpi.keterisian_admin)}
                  </span>
                </div>
                <div>
                  <span className="block text-[var(--peta-mute)]">Fisik</span>
                  <span className="font-display tabular-nums text-[var(--peta-dim)]">
                    {formatPercentOrNA(kpi.keterisian_fisik)}
                  </span>
                </div>
                <div>
                  <span className="block text-[var(--peta-mute)]">Total</span>
                  <span className="font-display tabular-nums text-[var(--peta-dim)]">
                    {formatPercentOrNA(kpi.keterisian_total)}
                  </span>
                </div>
              </div>

              {kpi.outstanding_so == null && (
                <p className="mt-2 flex items-start gap-1.5 rounded-md border border-[var(--st-warn)]/30 bg-[var(--st-warn)]/[0.07] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--peta-dim)]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--st-warn)]" />
                  Stok admin dan sisa ruang N/A karena Outstanding SO belum bisa dipisah
                  untuk filter ini.
                </p>
              )}
            </>
          )}

          <div className="mt-4 border-t border-[var(--peta-border)] pt-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Sebaran status peta
            </h3>
            <ul className="mt-2 space-y-1">
              {[...mapScale.legends, { status: "na" as const, label: "Tanpa nilai" }, { status: "none" as const, label: "Belum ada data" }].map(
                (item) => (
                  <li key={item.status} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`peta-dot peta-fill-${item.status}`}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-[var(--peta-dim)]" title={item.label}>
                      {item.label}
                    </span>
                    <span className="font-display text-[var(--peta-text)] tabular-nums">
                      {statusCounts[item.status]}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>

          {ranking && (
            <div className="mt-4 border-t border-[var(--peta-border)] pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                  Peringkat {ranking.level === "gudang" ? "gudang" : "kabupaten"}
                </h3>
                <span className="text-[9px] text-[var(--peta-mute)]">Top 10</span>
              </div>
              <div className="mt-2 flex gap-1 rounded-md border border-[var(--peta-border)] bg-[var(--peta-surface-2)] p-0.5">
                {(
                  [
                    ["penuh", "Paling penuh"],
                    ["kosong", "Ruang kosong"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRankingTab(value)}
                    aria-pressed={rankingTab === value}
                    className={`peta-focus flex-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
                      rankingTab === value
                        ? "bg-[var(--peta-accent)] text-[var(--peta-accent-ink)]"
                        : "text-[var(--peta-dim)] hover:text-[var(--peta-text)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {!ranking.tersedia ? (
                <p className="mt-2 rounded-md border border-[var(--st-warn)]/30 bg-[var(--st-warn)]/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--peta-dim)]">
                  {ranking.alasan}
                </p>
              ) : rankingItems.length === 0 ? (
                <p className="mt-2 text-[10px] text-[var(--peta-mute)]">
                  Belum ada wilayah yang memenuhi syarat peringkat.
                </p>
              ) : (
                <ul className="mt-2 space-y-0.5">
                  {rankingItems.map((item, index) => (
                    <li key={`${rankingTab}-${item.key}`}>
                      <button
                        type="button"
                        onClick={() => focusRankingItem(item)}
                        className="peta-focus flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
                      >
                        <span className="w-3 shrink-0 text-[9px] tabular-nums text-[var(--peta-mute)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={item.nama}>
                          {ranking.level === "gudang"
                            ? item.nama
                            : displayKabupaten(item.kota ?? item.nama)}
                        </span>
                        <span className="shrink-0 text-right">
                          <span
                            className="block font-display tabular-nums"
                            style={{
                              color:
                                rankingTab === "penuh"
                                  ? isRatioIndikator(indikator)
                                    ? STATUS_VAR[
                                        statusForRatio(item.nilai, config.thresholds)
                                      ]
                                    : "var(--peta-dim)"
                                  : "var(--st-ok)",
                            }}
                          >
                            {rankingTab === "penuh"
                              ? formatIndicatorValue(item.nilai, indikator)
                              : `${formatTonOrNA(item.nilai)} t`}
                          </span>
                          {rankingTab === "penuh" && (
                            <span className="block text-[9px] tabular-nums text-[var(--peta-mute)]">
                              admin {formatPercentOrNA(item.keterisian_admin)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {data && (
            <div className="mt-4 border-t border-[var(--peta-border)] pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                  Stok Pabrik
                </h3>
                <span className="rounded-full border border-[var(--peta-border-strong)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--peta-mute)]">
                  Nasional · di luar KPI gudang
                </span>
              </div>
              <div className="mt-2 rounded-lg border border-dashed border-[var(--peta-border-strong)] px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-sm text-[var(--peta-text)] tabular-nums">
                    {formatTonOrNA(data.pabrik.total.total_stok)} t
                  </span>
                  <span className="text-[10px] text-[var(--peta-mute)]">
                    {data.pabrik.total.plant} plant
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[var(--peta-mute)]">
                  <span>Fisik {formatTonOrNA(data.pabrik.total.fisik)} t</span>
                  <span>Intransit {formatTonOrNA(data.pabrik.total.intransit)} t</span>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                  Kontribusi {formatPercentOrNA(data.pabrik.kontribusi_nasional)} dari total{" "}
                  {formatTonOrNA(data.pabrik.total_nasional_stok)} t (stok gudang cakupan +
                  pabrik nasional).
                </p>
              </div>

              <ul className="mt-2 space-y-1">
                {PABRIK_BUCKET_ORDER.map((bucket) => {
                  const item = data.pabrik[bucket];
                  return (
                    <li
                      key={bucket}
                      className="flex items-center gap-2 text-[10px] text-[var(--peta-dim)]"
                    >
                      <span className="flex-1 truncate">{PABRIK_BUCKET_LABEL[bucket]}</span>
                      <span className="tabular-nums text-[var(--peta-text)]">
                        {formatTonOrNA(item.fisik)} t
                      </span>
                      <span className="w-10 text-right tabular-nums text-[var(--peta-mute)]">
                        {formatPercentOrNA(item.kontribusi)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[9px] leading-relaxed text-[var(--peta-mute)]">
                Stok pabrik mengikuti filter produk/subsidi, tetapi selalu berskala nasional dan
                tidak dicampur ke KPI gudang.
              </p>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {warnings.map((warning) => (
                <p
                  key={warning}
                  className="flex items-start gap-1.5 rounded-md border border-[var(--st-warn)]/30 bg-[var(--st-warn)]/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--peta-dim)]"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--st-warn)]" />
                  {warning}
                </p>
              ))}
            </div>
          )}

          {data && (
            <p className="mt-3 border-t border-[var(--peta-border)] pt-2 text-[9px] leading-relaxed text-[var(--peta-mute)]">
              Sumber: {data.meta.sumber}. {data.meta.kapasitas_basis}.
            </p>
          )}

          <p className="mt-2 border-t border-[var(--peta-border)] pt-2 text-[9px] leading-relaxed text-[var(--peta-mute)]">
            {data
              ? `${statusCounts.none} dari ${(geo?.features ?? []).length} kabupaten/kota belum punya gudang. ${data.meta.gudang_tanpa_kapasitas} gudang tanpa kapasitas; ${formatTonOrNA(data.meta.liter_dikecualikan)} liter tidak dihitung ke ton. Gudang nonaktif / di luar Lingkup Nasional dikecualikan.`
              : "Memuat cakupan gudang…"}
          </p>
        </aside>

        <div className="relative min-h-0 flex-1">
          <KabupatenMap
            geo={geo}
            views={geoViews}
            selectedKey={selectedKey}
            onSelect={handleSelect}
            center={center}
            zoom={zoom}
            onMoveEnd={(nextCenter, nextZoom) => {
              setCenter(nextCenter);
              setZoom(nextZoom);
            }}
          />

          {!reportMode && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[240px] rounded-lg border border-[var(--peta-border)] bg-[var(--peta-panel)] px-2.5 py-1.5 text-[10px] text-[var(--peta-dim)] backdrop-blur-md sm:left-4 sm:top-4 lg:left-4">
              <span className="block text-[9px] uppercase tracking-[0.12em] text-[var(--peta-mute)]">
                Warna peta
              </span>
              <span className="mt-0.5 block font-medium text-[var(--peta-text)]">
                {indikatorLabel}
              </span>
              {!isRatioIndikator(indikator) && (
                <span className="mt-0.5 block text-[9px] text-[var(--peta-mute)]">
                  Skala relatif antarwilayah
                </span>
              )}
            </div>
          )}

          {loading && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rounded-full border border-[var(--peta-border-strong)] bg-[var(--peta-surface)]/90 px-4 py-2 text-xs text-[var(--peta-dim)]">
                Memuat peta dan data agregat…
              </span>
            </div>
          )}

          {error && (
            <div className="absolute left-1/2 top-6 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/80 px-4 py-2 text-xs text-red-100">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="peta-focus rounded border border-red-300/30 px-2 py-0.5 text-[10px] hover:bg-red-500/20"
              >
                Coba lagi
              </button>
            </div>
          )}

          {empty && !loading && !error && (
            <div className="absolute left-1/2 top-6 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[var(--peta-border-strong)] bg-[var(--peta-surface)]/95 px-4 py-2 text-xs text-[var(--peta-dim)]">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Tidak ada gudang yang cocok dengan filter ini.
              <button
                type="button"
                onClick={resetDashboard}
                className="peta-focus rounded border border-[var(--peta-border-strong)] px-2 py-0.5 text-[10px] hover:bg-white/5"
              >
                Reset
              </button>
            </div>
          )}

          <div
            className={`pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4 ${
              drawerOpen ? "sm:pr-[360px]" : ""
            }`}
          >
            <ul className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--peta-border)] bg-[var(--peta-panel)] px-3 py-2 text-[10px] text-[var(--peta-dim)] backdrop-blur-md">
              {mapScale.legends.map((item) => (
                <li key={item.status} className="flex items-center gap-1.5">
                  <span
                    className={`peta-dot peta-fill-${item.status}`}
                    aria-hidden="true"
                  />
                  {item.label}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span className="peta-dot peta-fill-none" aria-hidden="true" />
                Belum ada data
              </li>
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

          {(selectedNode || selectedFeature) && (
            <div className="pointer-events-none absolute inset-0 z-30">
              <aside className="peta-drawer pointer-events-auto absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-hidden rounded-t-2xl border-t border-[var(--peta-border-strong)] bg-[var(--peta-surface)] p-4 sm:inset-y-4 sm:left-auto sm:right-4 sm:max-h-none sm:w-[352px] sm:rounded-xl sm:border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                      {titleCaseName(
                        selectedNode?.provinsi ?? selectedFeature?.properties.WADMPR,
                      )}
                    </p>
                    <h2 className="mt-1 font-display text-lg font-semibold leading-tight text-[var(--peta-text)]">
                      {selectedNode
                        ? displayKabupaten(selectedNode.kota ?? selectedNode.nama)
                        : displayKabupaten(selectedFeature?.properties.WADMKK ?? "Kabupaten")}
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

                {selectedNode ? (
                  <div className="peta-scroll mt-3 max-h-[calc(70dvh-4.5rem)] overflow-y-auto pr-1 sm:max-h-[calc(100dvh-7rem)]">
                    <div className="flex items-start gap-2">
                      <span
                        className={`peta-dot mt-1 peta-fill-${selectedView?.status ?? "none"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-xs leading-tight text-[var(--peta-dim)]">
                          {selectedView?.statusLabel ?? STATUS_LABEL.none}
                        </p>
                        <p className="mt-0.5 text-[10px] leading-snug text-[var(--peta-mute)]">
                          {indikatorLabel} {formatIndicatorValue(selectedMetric, indikator)}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                      {[
                        {
                          label: "Kapasitas",
                          value: `${formatTonOrNA(selectedNode.kapasitas)} t`,
                        },
                        {
                          label: "Stok fisik",
                          value: `${formatTonOrNA(selectedNode.stok_fisik)} t`,
                        },
                        {
                          label: "Intransit",
                          value: `${formatTonOrNA(selectedNode.intransit)} t`,
                        },
                        {
                          label: "Total stok",
                          value: `${formatTonOrNA(selectedNode.total_stok)} t`,
                        },
                        {
                          label: "Stok admin",
                          value: `${formatTonOrNA(selectedNode.stok_admin)} t`,
                        },
                        {
                          label: "Outstanding SO",
                          value: `${formatTonOrNA(selectedNode.outstanding_so)} t`,
                        },
                        {
                          label: "Sisa ruang",
                          value: `${formatTonOrNA(selectedNode.sisa_ruang)} t`,
                        },
                        {
                          label: "Keterisian admin",
                          value: formatPercentOrNA(selectedNode.keterisian_admin),
                        },
                        {
                          label: "Keterisian fisik",
                          value: formatPercentOrNA(selectedNode.keterisian_fisik),
                        },
                        {
                          label: "Keterisian total",
                          value: formatPercentOrNA(selectedNode.keterisian_total),
                        },
                        {
                          label: "Gudang",
                          value: `${selectedNode.gudang_count}`,
                        },
                        {
                          label: "Anper",
                          value: selectedNode.anper?.join(", ") || "—",
                        },
                      ].map((item) => (
                        <div key={item.label} className="min-w-0">
                          <dt className="text-[9px] text-[var(--peta-mute)]">{item.label}</dt>
                          <dd className="mt-0.5 truncate font-display text-[11px] text-[var(--peta-text)] tabular-nums" title={item.value}>
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {selectedNode.kapasitas > 0 && selectedRatio != null && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={`h-full rounded-full peta-fill-${selectedView?.status ?? "ok"}`}
                          style={{ width: `${Math.min(100, selectedRatio * 100)}%` }}
                        />
                      </div>
                    )}

                    {selectedNode.transit_transfer > 0 && (
                      <p className="mt-2 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                        Sekitar{" "}
                        <b className="tabular-nums text-[var(--peta-dim)]">
                          {formatTon(selectedNode.transit_transfer)} ton
                        </b>{" "}
                        berstatus transit transfer — barang menuju gudang ini.
                      </p>
                    )}

                    {selectedNode.kapasitas <= 0 && (
                      <p className="mt-2 rounded-md border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                        Kapasitas gudang di wilayah ini belum ada di master, jadi rasio tidak
                        dihitung. Nilai stok tetap ditampilkan.
                      </p>
                    )}

                    <div className="mt-3 border-t border-[var(--peta-border)] pt-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                          Gudang ({gudangList.length})
                        </h3>
                        <span className="truncate text-[9px] text-[var(--peta-mute)]">
                          urut {indikatorLabel}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-0.5">
                        {gudangList.map((gudang) => {
                          const nilai = nodeMetricValue(gudang, indikator);
                          const rasio = nodeRatioValue(gudang, indikator);
                          return (
                            <li
                              key={gudang.gudang_id ?? gudang.key}
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
                                  {formatIndicatorValue(nilai, indikator)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--peta-mute)]">
                                <span className="truncate">
                                  {gudang.anper?.join("/") || "Tanpa Anper"}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {rasio == null
                                    ? "tanpa kapasitas"
                                    : `${formatPercent(rasio)} dari ${formatTon(gudang.kapasitas)} t`}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                        {gudangList.length === 0 && (
                          <li className="px-1.5 py-1 text-[11px] text-[var(--peta-mute)]">
                            Belum ada gudang terdata.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-md border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--peta-mute)]">
                    Belum ada data gudang untuk wilayah ini pada filter aktif.
                  </p>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>

      <DashboardConfigPanel
        open={configOpen}
        config={config}
        produkTersedia={options.produk}
        anperTersedia={options.anper}
        provinsiTersedia={options.provinsi}
        kabupatenTersedia={options.kabupaten}
        savedPresets={savedPresets}
        onClose={() => setConfigOpen(false)}
        onChange={updateConfig}
        onReset={resetDashboard}
        onApplyPatch={patchConfig}
        onApplySaved={(preset) => {
          setConfig(normalizeConfig(preset.config));
          setConfigOpen(false);
          setSelectedKey(null);
        }}
        onSavePreset={(name) => setSavedPresets(saveNamedPreset(name, config))}
        onDeletePreset={(id) => setSavedPresets(deleteNamedPreset(id))}
      />
    </div>
  );
}
