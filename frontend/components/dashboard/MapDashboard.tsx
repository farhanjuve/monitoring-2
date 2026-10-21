"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import type { StockCalc } from "./StockTable";
import { normalizeProvince } from "@/lib/province";

const DEFAULT_GEO_URL = "/indonesia-province-simple.json";

export const MAP_PUPUK_OPTIONS = ["Semua", "Urea", "NPK", "NPK Kakao", "ZA", "SP-36", "Organik"];

const PUPUK_TO_SS: Record<string, keyof SafetyProvinsi> = {
  Urea: "ss_urea",
  NPK: "ss_npk",
  "NPK Kakao": "ss_npk_kakao",
  ZA: "ss_za",
  "SP-36": "ss_sp36",
  Organik: "ss_organik",
};

export interface SafetyProvinsi {
  ss_urea: number;
  ss_npk: number;
  ss_npk_kakao: number;
  ss_za: number;
  ss_sp36: number;
  ss_organik: number;
}

interface MapDashboardProps {
  data: StockCalc[];
  selectedProvince?: string;
  onSelectProvince: (provinceKey: string) => void;
  tipePupuk?: string;
  onTipePupukChange?: (value: string) => void;
  safetyStockByProvinsi?: Record<string, SafetyProvinsi>;
  geoUrl?: string;
}

export function MapDashboard({
  data,
  selectedProvince,
  onSelectProvince,
  tipePupuk = "Semua",
  onTipePupukChange,
  safetyStockByProvinsi,
  geoUrl = DEFAULT_GEO_URL,
}: MapDashboardProps) {
  const [tooltipContent, setTooltipContent] = useState("");

  const provinceAgg = useMemo(() => {
    const map = new Map<string, { label: string; stokAdmin: number; stokUrea: number; stokNpk: number }>();
    data.forEach((row) => {
      const label = row.provinsi || "Tidak Diketahui";
      const key = normalizeProvince(label);
      const prev = map.get(key);
      const rowStok = row.stok_admin || 0;
      if (prev) {
        prev.stokAdmin += rowStok;
        if (row.tipe_pupuk === "Urea") prev.stokUrea += rowStok;
        if (row.tipe_pupuk === "NPK") prev.stokNpk += rowStok;
      } else {
        map.set(key, {
          label,
          stokAdmin: rowStok,
          stokUrea: row.tipe_pupuk === "Urea" ? rowStok : 0,
          stokNpk: row.tipe_pupuk === "NPK" ? rowStok : 0,
        });
      }
    });
    return map;
  }, [data]);

  const ratio = (key: string) => {
    const agg = provinceAgg.get(key);
    const safety = safetyStockByProvinsi?.[key];
    if (!agg) return null;

    let target: number;
    if (tipePupuk === "Semua") {
      target = safety ? safety.ss_urea + safety.ss_npk : 0;
    } else {
      const col = PUPUK_TO_SS[tipePupuk];
      target = safety && col ? safety[col] ?? 0 : 0;
    }
    if (target <= 0) return null;

    const stok = tipePupuk === "Semua" ? agg.stokUrea + agg.stokNpk : agg.stokAdmin;
    return stok / target;
  };

  const fillColor = (key: string, hasStock: boolean) => {
    if (!hasStock) return "var(--map-none)";
    const r = ratio(key);
    if (r == null) return "var(--map-ok)";
    if (r >= 1) return "var(--map-ok)";
    if (r >= 0.7) return "var(--map-warn)";
    return "var(--map-low)";
  };

  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const safetyLabel = (safety: SafetyProvinsi | undefined) => {
    if (!safety) return null;
    if (tipePupuk === "Semua") return { label: "Safety Stock (Urea+NPK)", value: safety.ss_urea + safety.ss_npk };
    const col = PUPUK_TO_SS[tipePupuk];
    if (!col) return null;
    return { label: `Safety Stock (${tipePupuk})`, value: safety[col] ?? 0 };
  };

  const legend = [
    { label: "Stok \u2265 safety stock", color: "bg-map-ok" },
    { label: "Mendekati safety stock", color: "bg-map-warn" },
    { label: "Di bawah safety stock", color: "bg-map-low" },
    { label: "Belum ada data", color: "bg-map-none" },
  ];

  return (
    <section
      aria-labelledby="peta-sebaran"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id="peta-sebaran" className="text-sm font-semibold text-slate-800">
            Peta Sebaran Stok Nasional
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">Klik provinsi untuk memfilter tabel di bawah.</p>
        </div>
        {onTipePupukChange && (
          <div
            role="group"
            aria-label="Pilih jenis pupuk"
            className="inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1"
          >
            {MAP_PUPUK_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={tipePupuk === opt}
                onClick={() => onTipePupukChange(opt)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-darkBlue/40 ${
                  tipePupuk === opt
                    ? "bg-pupuk-darkBlue text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative h-[380px] w-full bg-map-bg sm:h-[480px] md:h-[560px]">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 1200, center: [118, -2] }}
          className="h-full w-full outline-none"
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const provinceName = geo.properties.PROVINSI || geo.properties.Propinsi || "Unknown";
                const provinceKey = normalizeProvince(provinceName);
                const agg = provinceAgg.get(provinceKey);
                const hasData = Boolean(agg);
                const isSelected = selectedProvince === provinceKey;
                const r = ratio(provinceKey);
                const safety = safetyStockByProvinsi?.[provinceKey];

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => {
                      const status = !hasData
                        ? "Belum Ada Data Stok"
                        : r == null
                          ? "Ada Data, Safety Stock N/A"
                          : r >= 1
                            ? "Stok >= Safety Stock"
                            : r >= 0.7
                              ? "Stok Mendekati Safety Stock"
                              : "Stok Di Bawah Safety Stock";
                      const sl = safetyLabel(safety);
                      const safetyLine = sl
                        ? `${sl.label}: ${fmt(sl.value)} Ton<br/>`
                        : "Safety Stock: -<br/>";
                      const ratioLine =
                        r != null ? `Rasio Stok / Safety: ${fmt(r * 100)}%` : `Rasio Stok / Safety: -`;
                      setTooltipContent(
                        `<b>${provinceName}</b><br/>Status: ${status}<br/>Stok Admin: ${
                          hasData ? `${fmt(agg!.stokAdmin)} Ton` : "-"
                        }<br/>${safetyLine}${ratioLine}`
                      );
                    }}
                    onMouseLeave={() => setTooltipContent("")}
                    onClick={() => onSelectProvince(isSelected ? "" : provinceKey)}
                    style={{
                      default: {
                        fill: fillColor(provinceKey, hasData),
                        outline: "none",
                        stroke: isSelected ? "var(--map-ink)" : "var(--map-stroke)",
                        strokeWidth: isSelected ? 1.8 : 0.5,
                      },
                      hover: {
                        fill: hasData
                          ? r != null && r < 1
                            ? "var(--map-hover-low)"
                            : "var(--map-hover-ok)"
                          : "var(--map-hover-none)",
                        outline: "none",
                        stroke: "var(--map-ink)",
                        strokeWidth: 1,
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: "var(--map-ok)",
                        outline: "none",
                      },
                    }}
                    data-tooltip-id="map-tooltip"
                    data-tooltip-html={tooltipContent}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
        <Tooltip id="map-tooltip" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
        {selectedProvince && (
          <button
            type="button"
            onClick={() => onSelectProvince("")}
            className="rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-600 transition-colors hover:border-pupuk-darkBlue hover:text-pupuk-darkBlue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-darkBlue/40"
          >
            Reset filter provinsi
          </button>
        )}
      </div>
    </section>
  );
}
