/**
 * Tipe respons GET /api/peta/aggregate dan helper tampilan.
 *
 * Backend mengirim rasio sebagai pecahan 0..1, bukan persen. Semua formatter
 * di sini memakai konvensi yang sama agar peta, KPI, dan ranking konsisten.
 */

import { API_BASE_URL } from "@/lib/api";
import { kabupatenKey, type KabupatenStatus } from "@/lib/kabupaten";
import {
  configToApiQuery,
  type DashboardConfig,
  type IndikatorPeta,
  type SubsidiPeta,
  type Thresholds,
} from "@/lib/dashboard-config";

export interface PetaNode {
  key: string;
  nama: string;
  provinsi: string | null;
  kota: string | null;
  gudang_id: number | null;
  gudang_count: number;
  plants?: string[];
  anper?: string[];
  /** Kategori produk yang ada di node setelah filter aktif. */
  produk?: string[];
  kapasitas: number;
  stok_fisik: number;
  intransit: number;
  transit_transfer: number;
  total_stok: number;
  outstanding_so: number | null;
  stok_admin: number | null;
  sisa_ruang: number | null;
  sisa_ruang_fisik: number | null;
  sisa_ruang_total: number | null;
  keterisian_fisik: number | null;
  keterisian_total: number | null;
  keterisian_admin: number | null;
  indikator: IndikatorPeta;
  nilai_indikator: number | null;
  status: KabupatenStatus;
  status_indikator: KabupatenStatus | null;
  has_data: boolean;
  has_stock_rows: boolean;
  so_lengkap: boolean;
}

export interface PetaRankingItem {
  key: string;
  nama: string;
  provinsi: string | null;
  kota: string | null;
  gudang_id: number | null;
  nilai: number;
  keterisian_admin: number | null;
  kapasitas: number;
  stok_admin: number | null;
  sisa_ruang: number | null;
}

export interface PetaRanking {
  level: "kabupaten" | "gudang";
  penuh: PetaRankingItem[];
  kosong: PetaRankingItem[];
  tersedia: boolean;
  alasan: string | null;
}

export interface PetaPabrikBucket {
  fisik: number;
  intransit: number;
  total_stok: number;
  plant: number;
  kontribusi?: number | null;
}

export interface PetaPabrik {
  pabrik: PetaPabrikBucket;
  pelabuhan: PetaPabrikBucket;
  kantor: PetaPabrikBucket;
  belum_terpetakan: PetaPabrikBucket;
  total: PetaPabrikBucket;
  kontribusi_nasional: number | null;
  total_nasional_stok: number;
}

export interface PetaMeta {
  gudang_scope: number;
  gudang_tanpa_kapasitas: number;
  gudang_tanpa_stok: number;
  liter_dikecualikan: number;
  produk_tersedia: string[];
  anper_tersedia: string[];
  lini_tersedia: string[];
  sumber: string;
  kapasitas_basis: string;
  satuan: string;
  pabrik_scope: string;
  so_lengkap: boolean;
  warnings: string[];
}

export interface PetaAggregate {
  filters: {
    produk: string[];
    subsidi: SubsidiPeta;
    anper: string[];
    lini: string[];
    provinsi: string | null;
    kabupaten: string | null;
    gudang_id: number | null;
    indikator: IndikatorPeta;
    thresholds: Thresholds;
  };
  kpi: PetaNode;
  levels: {
    provinsi: PetaNode[];
    kabupaten: PetaNode[];
    gudang: PetaNode[];
  };
  ranking: PetaRanking;
  pabrik: PetaPabrik;
  meta: PetaMeta;
  tanggal: string;
}

/** Satu wilayah di peta setelah diberi warna & label indikator aktif. */
export interface PetaMapView {
  key: string;
  node: PetaNode;
  status: KabupatenStatus;
  statusLabel: string;
  metricLabel: string;
  metricText: string;
}

export const PABRIK_BUCKET_LABEL = {
  pabrik: "Pabrik",
  pelabuhan: "Pelabuhan",
  kantor: "Kantor",
  belum_terpetakan: "Belum terpetakan",
} as const;

export const PABRIK_BUCKET_ORDER = [
  "pabrik",
  "pelabuhan",
  "kantor",
  "belum_terpetakan",
] as const;

export function formatTonOrNA(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

export function formatPercentOrNA(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${(value * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

export function formatIndicatorValue(
  value: number | null | undefined,
  indikator: IndikatorPeta,
): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const ratio = [
    "keterisian_admin",
    "keterisian_fisik",
    "keterisian_total",
  ].includes(indikator);
  return ratio ? formatPercentOrNA(value) : `${formatTonOrNA(value)} t`;
}

export function nodeMetricValue(
  node: PetaNode,
  indikator: IndikatorPeta,
): number | null {
  if (node.nilai_indikator != null) return node.nilai_indikator;
  switch (indikator) {
    case "keterisian_admin":
      return node.keterisian_admin;
    case "keterisian_fisik":
      return node.keterisian_fisik;
    case "keterisian_total":
      return node.keterisian_total;
    case "kapasitas_tersisa":
      return node.sisa_ruang;
    case "stok_fisik":
      return node.stok_fisik;
    case "outstanding_so":
      return node.outstanding_so;
    default:
      return null;
  }
}

export function nodeRatioValue(
  node: PetaNode,
  indikator: IndikatorPeta,
): number | null {
  switch (indikator) {
    case "keterisian_fisik":
      return node.keterisian_fisik;
    case "keterisian_total":
      return node.keterisian_total;
    case "keterisian_admin":
      return node.keterisian_admin;
    default:
      return node.keterisian_admin;
  }
}

export function nodeSisaValue(
  node: PetaNode,
  indikator: IndikatorPeta,
): number | null {
  if (indikator === "keterisian_fisik" || indikator === "stok_fisik") {
    return node.sisa_ruang_fisik;
  }
  if (indikator === "keterisian_total") return node.sisa_ruang_total;
  return node.sisa_ruang;
}

export function geoKeyForNode(node: PetaNode): string {
  return kabupatenKey(node.kota);
}

export function normalizeWilayah(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().split(/\s+/).join(" ");
}

export function nodeWilayahLabel(node: PetaNode): string {
  return node.kota ?? node.nama;
}

/** Kuantil 25/50/75 untuk indikator ton (warna relatif antarwilayah). */
export function computeQuantiles(values: number[]): [number, number, number] | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length < 4) return null;
  const at = (p: number) => {
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    if (low === high) return sorted[low];
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
  };
  return [at(0.25), at(0.5), at(0.75)];
}

export async function fetchPetaAggregate(
  config: DashboardConfig,
  signal?: AbortSignal,
): Promise<PetaAggregate> {
  const query = configToApiQuery(config);
  const res = await fetch(
    `${API_BASE_URL}/api/peta/aggregate${query ? `?${query}` : ""}`,
    { signal },
  );
  if (!res.ok) {
    let pesan = `Gagal memuat agregat peta (${res.status}).`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) pesan = body.detail;
    } catch {
      /* biarkan pesan default */
    }
    throw new Error(pesan);
  }
  return (await res.json()) as PetaAggregate;
}

export async function fetchPetaScopeOptions(
  tanggal: string,
  signal?: AbortSignal,
): Promise<{
  provinsi: string[];
  kabupaten: Array<{ nama: string; provinsi: string }>;
  produk: string[];
  anper: string[];
}> {
  const query = tanggal ? `?tanggal=${encodeURIComponent(tanggal)}` : "";
  const res = await fetch(`${API_BASE_URL}/api/peta/aggregate${query}`, { signal });
  if (!res.ok) throw new Error("Gagal memuat pilihan wilayah.");
  const data = (await res.json()) as PetaAggregate;
  return {
    provinsi: data.levels.provinsi.map((node) => node.nama).sort((a, b) => a.localeCompare(b)),
    kabupaten: data.levels.kabupaten
      .map((node) => ({
        nama: node.kota ?? node.nama,
        provinsi: node.provinsi ?? "",
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama)),
    produk: data.meta.produk_tersedia,
    anper: data.meta.anper_tersedia,
  };
}
