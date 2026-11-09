/**
 * Satu sumber kebenaran untuk filter dashboard /peta-kabupaten.
 *
 * Konfigurasi disimpan ke URL (shareable) dan localStorage (kembali ke
 * tampilan terakhir). Semua angka peta, KPI, ranking, dan Stok Pabrik
 * dihitung backend dari konfigurasi yang sama.
 */

export type IndikatorPeta =
  | "keterisian_fisik"
  | "keterisian_total"
  | "keterisian_admin"
  | "kapasitas_tersisa"
  | "stok_fisik"
  | "outstanding_so";

export type SubsidiPeta = "SEMUA" | "SUBSIDI" | "NON_SUBSIDI";

export type Thresholds = [number, number, number];

export interface DashboardConfig {
  /** Kosong berarti "tanggal terbaru" dari backend. */
  tanggal: string;
  produk: string[];
  subsidi: SubsidiPeta;
  anper: string[];
  /** Belum ada sumber data lini di sistem; dipertahankan agar URL lama aman. */
  lini: string[];
  provinsi: string;
  kabupaten: string;
  indikator: IndikatorPeta;
  thresholds: Thresholds;
}

export interface DashboardPreset {
  id: string;
  label: string;
  description: string;
  patch: Partial<DashboardConfig>;
}

export interface SavedPreset {
  id: string;
  name: string;
  savedAt: string;
  config: DashboardConfig;
}

export const DEFAULT_THRESHOLDS: Thresholds = [70, 90, 100];

export const DEFAULT_CONFIG: DashboardConfig = {
  tanggal: "",
  produk: [],
  subsidi: "SEMUA",
  anper: [],
  lini: [],
  provinsi: "",
  kabupaten: "",
  indikator: "keterisian_admin",
  thresholds: DEFAULT_THRESHOLDS,
};

export const INDIKATOR_OPTIONS: Array<{
  value: IndikatorPeta;
  label: string;
  short: string;
  ratio: boolean;
}> = [
  {
    value: "keterisian_admin",
    label: "Keterisian Admin",
    short: "Admin",
    ratio: true,
  },
  {
    value: "keterisian_fisik",
    label: "Keterisian Fisik",
    short: "Fisik",
    ratio: true,
  },
  {
    value: "keterisian_total",
    label: "Keterisian Total",
    short: "Total",
    ratio: true,
  },
  {
    value: "kapasitas_tersisa",
    label: "Kapasitas Tersisa",
    short: "Sisa ruang",
    ratio: false,
  },
  {
    value: "stok_fisik",
    label: "Total Stok Fisik",
    short: "Stok fisik",
    ratio: false,
  },
  {
    value: "outstanding_so",
    label: "Outstanding SO",
    short: "SO",
    ratio: false,
  },
];

export const INDIKATOR_LABEL: Record<IndikatorPeta, string> = Object.fromEntries(
  INDIKATOR_OPTIONS.map((item) => [item.value, item.label]),
) as Record<IndikatorPeta, string>;

export function isRatioIndikator(indikator: IndikatorPeta): boolean {
  return INDIKATOR_OPTIONS.find((item) => item.value === indikator)?.ratio ?? true;
}

/** Preset bawaan. Tanggal tidak diubah supaya snapshot tetap milik pengguna. */
export const PRESETS: DashboardPreset[] = [
  {
    id: "nasional",
    label: "A · Ringkasan Nasional",
    description: "Semua produk, seluruh wilayah, keterisian admin.",
    patch: {
      produk: [],
      subsidi: "SEMUA",
      anper: [],
      provinsi: "",
      kabupaten: "",
      indikator: "keterisian_admin",
      thresholds: DEFAULT_THRESHOLDS,
    },
  },
  {
    id: "fisik",
    label: "B · Stok Fisik",
    description: "Warna peta memakai stok fisik tanpa outstanding SO.",
    patch: { indikator: "keterisian_fisik" },
  },
  {
    id: "subsidi",
    label: "C · Pupuk Subsidi",
    description: "Hanya material berstatus subsidi.",
    patch: { subsidi: "SUBSIDI", indikator: "keterisian_admin" },
  },
  {
    id: "non-subsidi",
    label: "D · Non Subsidi",
    description: "Hanya material non subsidi.",
    patch: { subsidi: "NON_SUBSIDI", indikator: "keterisian_admin" },
  },
  {
    id: "ambang-ketat",
    label: "E · Ambang Ketat",
    description: "Lega ≤ 60%, waspada 60–80%, kritis 80–95%.",
    patch: { indikator: "keterisian_admin", thresholds: [60, 80, 95] },
  },
];

const LAST_CONFIG_KEY = "peta-kabupaten:config:v1";
const SAVED_PRESETS_KEY = "peta-kabupaten:presets:v1";

const URL_KEYS = [
  "tanggal",
  "produk",
  "subsidi",
  "anper",
  "lini",
  "provinsi",
  "kabupaten",
  "indikator",
  "lega",
  "waspada",
  "kritis",
] as const;

const INDICATOR_VALUES = new Set(INDIKATOR_OPTIONS.map((item) => item.value));

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(300, Math.max(0, value));
}

function normalizeThresholds(
  lega: number,
  waspada: number,
  kritis: number,
): Thresholds {
  const a = clampPercent(lega, DEFAULT_THRESHOLDS[0]);
  const b = Math.max(a, clampPercent(waspada, DEFAULT_THRESHOLDS[1]));
  const c = Math.max(b, clampPercent(kritis, DEFAULT_THRESHOLDS[2]));
  return [a, b, c];
}

function splitList(value: string | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeSubsidi(value: string | null): SubsidiPeta {
  const key = (value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (key === "SUBSIDI") return "SUBSIDI";
  if (key === "NON_SUBSIDI" || key === "NONSUBSIDI") return "NON_SUBSIDI";
  return "SEMUA";
}

function normalizeIndikator(value: string | null): IndikatorPeta {
  return INDICATOR_VALUES.has(value as IndikatorPeta)
    ? (value as IndikatorPeta)
    : DEFAULT_CONFIG.indikator;
}

function numberOr(value: string | null, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  return Number(value.replace(",", "."));
}

export function hasConfigParams(params: URLSearchParams): boolean {
  return URL_KEYS.some((key) => params.has(key));
}

export function configFromSearchParams(params: URLSearchParams): DashboardConfig {
  return {
    tanggal: params.get("tanggal")?.trim() ?? "",
    produk: splitList(params.get("produk")),
    subsidi: normalizeSubsidi(params.get("subsidi")),
    anper: splitList(params.get("anper")),
    lini: splitList(params.get("lini")),
    provinsi: params.get("provinsi")?.trim() ?? "",
    kabupaten: params.get("kabupaten")?.trim() ?? "",
    indikator: normalizeIndikator(params.get("indikator")),
    thresholds: normalizeThresholds(
      numberOr(params.get("lega"), DEFAULT_THRESHOLDS[0]),
      numberOr(params.get("waspada"), DEFAULT_THRESHOLDS[1]),
      numberOr(params.get("kritis"), DEFAULT_THRESHOLDS[2]),
    ),
  };
}

export function configToSearchParams(config: DashboardConfig): URLSearchParams {
  const params = new URLSearchParams();
  if (config.tanggal) params.set("tanggal", config.tanggal);
  if (config.produk.length) params.set("produk", [...config.produk].sort().join(","));
  if (config.subsidi !== "SEMUA") params.set("subsidi", config.subsidi);
  if (config.anper.length) params.set("anper", [...config.anper].sort().join(","));
  if (config.lini.length) params.set("lini", [...config.lini].sort().join(","));
  if (config.provinsi) params.set("provinsi", config.provinsi);
  if (config.kabupaten) params.set("kabupaten", config.kabupaten);
  if (config.indikator !== DEFAULT_CONFIG.indikator) {
    params.set("indikator", config.indikator);
  }
  const [lega, waspada, kritis] = config.thresholds;
  if (
    lega !== DEFAULT_THRESHOLDS[0] ||
    waspada !== DEFAULT_THRESHOLDS[1] ||
    kritis !== DEFAULT_THRESHOLDS[2]
  ) {
    params.set("lega", String(lega));
    params.set("waspada", String(waspada));
    params.set("kritis", String(kritis));
  }
  return params;
}

/** Query untuk GET /api/peta/aggregate. */
export function configToApiQuery(config: DashboardConfig): string {
  const params = new URLSearchParams();
  if (config.tanggal) params.set("tanggal", config.tanggal);
  if (config.produk.length) params.set("produk", [...config.produk].sort().join(","));
  if (config.subsidi !== "SEMUA") params.set("subsidi", config.subsidi);
  if (config.anper.length) params.set("anper", [...config.anper].sort().join(","));
  if (config.lini.length) params.set("lini", [...config.lini].sort().join(","));
  if (config.provinsi) params.set("provinsi", config.provinsi);
  if (config.kabupaten) params.set("kabupaten", config.kabupaten);
  if (config.indikator !== DEFAULT_CONFIG.indikator) {
    params.set("indikator", config.indikator);
  }
  const [lega, waspada, kritis] = config.thresholds;
  if (
    lega !== DEFAULT_THRESHOLDS[0] ||
    waspada !== DEFAULT_THRESHOLDS[1] ||
    kritis !== DEFAULT_THRESHOLDS[2]
  ) {
    params.set("lega", String(lega));
    params.set("waspada", String(waspada));
    params.set("kritis", String(kritis));
  }
  return params.toString();
}

export function normalizeConfig(input: Partial<DashboardConfig>): DashboardConfig {
  const merged = { ...DEFAULT_CONFIG, ...input };
  return {
    tanggal: merged.tanggal?.trim() ?? "",
    produk: Array.from(new Set(merged.produk ?? [])).filter(Boolean).sort(),
    subsidi: normalizeSubsidi(merged.subsidi),
    anper: Array.from(new Set(merged.anper ?? [])).filter(Boolean).sort(),
    lini: Array.from(new Set(merged.lini ?? [])).filter(Boolean).sort(),
    provinsi: merged.provinsi?.trim() ?? "",
    kabupaten: merged.kabupaten?.trim() ?? "",
    indikator: normalizeIndikator(merged.indikator),
    thresholds: normalizeThresholds(...(merged.thresholds ?? DEFAULT_THRESHOLDS)),
  };
}

export function applyPreset(
  current: DashboardConfig,
  patch: Partial<DashboardConfig>,
): DashboardConfig {
  return normalizeConfig({ ...current, ...patch, tanggal: current.tanggal });
}

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadLastConfig(): DashboardConfig | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(LAST_CONFIG_KEY);
    if (!raw) return null;
    return normalizeConfig(JSON.parse(raw) as Partial<DashboardConfig>);
  } catch {
    return null;
  }
}

export function saveLastConfig(config: DashboardConfig): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* penyimpanan penuh / diblokir: URL tetap menjadi sumber utama. */
  }
}

export function loadSavedPresets(): SavedPreset[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(SAVED_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedPreset =>
          Boolean(item) &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.savedAt === "string" &&
          Boolean(item.config),
      )
      .map((item) => ({ ...item, config: normalizeConfig(item.config) }));
  } catch {
    return [];
  }
}

function persistSavedPresets(presets: SavedPreset[]): SavedPreset[] {
  if (storageAvailable()) {
    try {
      window.localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
    } catch {
      /* abaikan */
    }
  }
  return presets;
}

export function saveNamedPreset(
  name: string,
  config: DashboardConfig,
): SavedPreset[] {
  const list = loadSavedPresets();
  const clean = name.trim();
  if (!clean) return list;
  const preset: SavedPreset = {
    id: `preset-${Date.now()}`,
    name: clean,
    savedAt: new Date().toISOString(),
    config: normalizeConfig(config),
  };
  // Nama sama menimpa preset lama supaya daftar tidak menumpuk.
  return persistSavedPresets([
    preset,
    ...list.filter((item) => item.name.toLowerCase() !== clean.toLowerCase()),
  ]);
}

export function deleteNamedPreset(id: string): SavedPreset[] {
  return persistSavedPresets(loadSavedPresets().filter((item) => item.id !== id));
}

export function countActiveFilters(config: DashboardConfig): number {
  let total =
    config.produk.length +
    config.anper.length +
    config.lini.length +
    (config.subsidi !== "SEMUA" ? 1 : 0) +
    (config.provinsi ? 1 : 0) +
    (config.kabupaten ? 1 : 0);
  if (config.indikator !== DEFAULT_CONFIG.indikator) total += 1;
  const [a, b, c] = config.thresholds;
  if (
    a !== DEFAULT_THRESHOLDS[0] ||
    b !== DEFAULT_THRESHOLDS[1] ||
    c !== DEFAULT_THRESHOLDS[2]
  ) {
    total += 1;
  }
  return total;
}
