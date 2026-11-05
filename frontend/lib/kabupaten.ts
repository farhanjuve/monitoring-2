export type KabupatenStatus = "ok" | "warn" | "low" | "full" | "na" | "none";

/** Dasar angka stok yang ditampilkan (lihat panel detail gudang). */
export type StockBasis = "admin" | "fisik";

export interface StockRow {
  tanggal?: string;
  gudang_id: number;
  nama_gudang: string | null;
  kode_plants?: string | null;
  kota: string | null;
  provinsi: string | null;
  is_active?: boolean;
  tipe_pupuk: string;
  stok_admin: number;
  stok_fisik: number;
}

export interface GeoFeature {
  type: string;
  properties: { WADMPR?: string; WADMKK?: string };
  geometry: { type: string; coordinates: unknown };
}

export interface GeoCollection {
  type: string;
  features: GeoFeature[];
}

/** Peta kode plant → kapasitas gudang (ton). Nilai 0 berarti belum ada data. */
export type KapasitasMap = Record<string, number | null>;

export interface GudangView {
  id: number;
  nama: string;
  plant: string;
  stokAdmin: number;
  stokFisik: number;
  kapasitas: number;
}

export interface KabAgg {
  key: string;
  provinsi: string;
  kabupaten: string;
  stokAdmin: number;
  stokFisik: number;
  kapasitas: number;
  gudang: Map<number, GudangView>;
}

export interface KabView {
  key: string;
  provinsi: string;
  kabupaten: string;
  stokAdmin: number;
  stokFisik: number;
  kapasitas: number;
  ratio: number | null;
  status: KabupatenStatus;
  gudang: GudangView[];
}

/**
 * Sebagian nama di DB memakai ejaan lama / typo. Alias ini menyamakan kunci
 * dengan nama yang dipakai geojson kabupaten.
 */
const KABUPATEN_ALIAS: Record<string, string> = {
  "kab:TOBASAMOSIR": "kab:TOBA",
  "kab:POHUWATU": "kab:POHUWATO",
};

/** Kunci gabungan tipe + nama, mis. "kab:BANDUNG" / "kota:BANDUNG". */
export function kabupatenKey(name: string | null | undefined): string {
  if (!name) return "";
  let value = name.trim().toUpperCase().replace(/\s+/g, " ");
  let kind = "kab";

  if (/^KOTA( ADM\.| ADMINISTRASI)? /.test(value)) {
    kind = "kota";
    value = value.replace(/^KOTA( ADM\.| ADMINISTRASI)? /, "");
  } else {
    value = value.replace(/^(KAB\.|KABUPATEN) /, "");
  }

  value = value.replace(/\bKEP\.\s*/g, "KEPULAUAN ");
  const key = `${kind}:${value.replace(/[^A-Z0-9]/g, "")}`;
  return KABUPATEN_ALIAS[key] ?? key;
}

export function featureKey(feature: GeoFeature): string {
  return kabupatenKey(feature.properties.WADMKK);
}

/** Titik tengah kotak pembatas geometri — cukup untuk zoom ke kabupaten. */
export function featureCenter(feature: GeoFeature): [number, number] | null {
  const acc = [Infinity, Infinity, -Infinity, -Infinity];

  const walk = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number];
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        acc[0] = Math.min(acc[0], lon);
        acc[1] = Math.min(acc[1], lat);
        acc[2] = Math.max(acc[2], lon);
        acc[3] = Math.max(acc[3], lat);
      }
      return;
    }
    coords.forEach(walk);
  };

  walk(feature.geometry?.coordinates);
  if (!Number.isFinite(acc[0])) return null;
  return [(acc[0] + acc[2]) / 2, (acc[1] + acc[3]) / 2];
}

/**
 * Kapasitas satu gudang = jumlah kapasitas seluruh kode plant-nya.
 * Satu gudang bisa punya 2–3 plant (218 gudang di data saat ini).
 * Nilai 0 / tidak ada di daftar dianggap "belum ada data", bukan nol ton.
 */
export function capacityForPlants(
  kodePlants: string | null | undefined,
  kapasitas: KapasitasMap,
): number {
  if (!kodePlants) return 0;
  return kodePlants.split("/").reduce((total, raw) => {
    const value = Number(kapasitas[raw.trim()]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function statusFor(stok: number, kapasitas: number): KabupatenStatus {
  if (kapasitas <= 0) return "na";
  const ratio = stok / kapasitas;
  if (ratio > 1) return "full";
  if (ratio >= 0.9) return "low";
  if (ratio >= 0.7) return "warn";
  return "ok";
}

export function buildStockAgg(
  rows: StockRow[],
  kapasitas: KapasitasMap,
): Map<string, KabAgg> {
  const map = new Map<string, KabAgg>();

  rows.forEach((row) => {
    // Gudang nonaktif tidak ditampilkan di peta/drawer.
    if (row.is_active === false) return;

    const key = kabupatenKey(row.kota);
    if (!key) return;

    const admin = Number(row.stok_admin) || 0;
    const fisik = Number(row.stok_fisik) || 0;

    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        provinsi: row.provinsi ?? "Tidak diketahui",
        kabupaten: row.kota ?? "Tidak diketahui",
        stokAdmin: 0,
        stokFisik: 0,
        kapasitas: 0,
        gudang: new Map(),
      };
      map.set(key, agg);
    }

    let gudang = agg.gudang.get(row.gudang_id);
    if (!gudang) {
      gudang = {
        id: row.gudang_id,
        nama: row.nama_gudang ?? `Gudang ${row.gudang_id}`,
        plant: row.kode_plants ?? "",
        stokAdmin: 0,
        stokFisik: 0,
        kapasitas: capacityForPlants(row.kode_plants, kapasitas),
      };
      agg.gudang.set(row.gudang_id, gudang);
      agg.kapasitas += gudang.kapasitas;
    }

    gudang.stokAdmin += admin;
    gudang.stokFisik += fisik;
    agg.stokAdmin += admin;
    agg.stokFisik += fisik;
  });

  return map;
}

const utilization = (stok: number, kapasitas: number) =>
  kapasitas > 0 ? stok / kapasitas : -1;

export function buildViews(stockAgg: Map<string, KabAgg>): Map<string, KabView> {
  const views = new Map<string, KabView>();

  stockAgg.forEach((agg, key) => {
    const ratio = agg.kapasitas > 0 ? agg.stokAdmin / agg.kapasitas : null;

    const gudang = Array.from(agg.gudang.values()).sort((a, b) => {
      const diff =
        utilization(b.stokAdmin, b.kapasitas) - utilization(a.stokAdmin, a.kapasitas);
      return diff !== 0 ? diff : b.stokAdmin - a.stokAdmin;
    });

    views.set(key, {
      key,
      provinsi: agg.provinsi,
      kabupaten: agg.kabupaten,
      stokAdmin: agg.stokAdmin,
      stokFisik: agg.stokFisik,
      kapasitas: agg.kapasitas,
      ratio,
      status: statusFor(agg.stokAdmin, agg.kapasitas),
      gudang,
    });
  });

  return views;
}

export const STATUS_LABEL: Record<KabupatenStatus, string> = {
  ok: "Lega",
  warn: "Waspada",
  low: "Kritis",
  full: "Penuh",
  na: "Tanpa kapasitas",
  none: "Belum ada data",
};

export const STATUS_DESCRIPTION: Record<KabupatenStatus, string> = {
  ok: "Terisi ≤ 70% kapasitas",
  warn: "Terisi 70–90% kapasitas",
  low: "Terisi 90–100% kapasitas",
  full: "Terisi lebih dari kapasitas",
  na: "Ada stok, kapasitas gudang belum ada",
  none: "Belum ada gudang / stok terdata",
};

const ACRONYMS: Record<string, string> = {
  dki: "DKI",
  di: "DI",
  ntb: "NTB",
  ntt: "NTT",
};

/** Nama wilayah di DB ditulis kapital semua; rapikan untuk tampilan. */
export function titleCaseName(name: string | null | undefined, fallback = "—"): string {
  if (!name) return fallback;
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => ACRONYMS[word] ?? word.replace(/^([a-z])/, (huruf) => huruf.toUpperCase()))
    .join(" ");
}

/** "KAB. BANDUNG" → "Kab. Bandung", "KOTA BANDUNG" → "Kota Bandung". */
export function displayKabupaten(name: string | null | undefined, fallback = "—"): string {
  if (!name) return fallback;
  const raw = name.trim().toUpperCase().replace(/\s+/g, " ");
  if (/^KOTA( ADM\.| ADMINISTRASI)? /.test(raw)) {
    return `Kota ${titleCaseName(raw.replace(/^KOTA( ADM\.| ADMINISTRASI)? /, ""))}`;
  }
  return `Kab. ${titleCaseName(raw.replace(/^(KAB\.|KABUPATEN) /, ""))}`;
}

export function formatTon(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

const BULAN = [
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

export function formatTanggal(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${BULAN[month - 1]} ${year}`;
}
