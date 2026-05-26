"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import type { StockCalc } from "./StockTable";

const geoUrl = "/indonesia-province-simple.json";

const PROVINSI_ALIAS: Record<string, string> = {
  "di yogyakarta": "daerah istimewa yogyakarta",
  "dki jakarta": "daerah khusus ibukota jakarta",
};

const normalizeProvince = (name: string) => {
  const base = name.trim().toLowerCase().replace(/\s+/g, " ");
  return PROVINSI_ALIAS[base] || base;
};

interface MapDashboardProps {
  data: StockCalc[];
  selectedProvince?: string;
  onSelectProvince: (provinceKey: string) => void;
}

export function MapDashboard({ data, selectedProvince, onSelectProvince }: MapDashboardProps) {
  const [tooltipContent, setTooltipContent] = useState("");

  const provinceAgg = useMemo(() => {
    const map = new Map<string, { label: string; stokAdmin: number }>();
    data.forEach((row) => {
      const label = row.provinsi || "Tidak Diketahui";
      const key = normalizeProvince(label);
      const prev = map.get(key);
      if (prev) {
        prev.stokAdmin += row.stok_admin;
      } else {
        map.set(key, { label, stokAdmin: row.stok_admin });
      }
    });
    return map;
  }, [data]);

  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-6">
      <h3 className="font-semibold text-gray-800 mb-4 text-xl">Peta Sebaran Stok Nasional</h3>
      <div className="w-full h-[400px] sm:h-[500px] md:h-[600px] relative border border-gray-100 rounded bg-[#f8fafc]">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 1200, center: [118, -2] }}
          className="w-full h-full outline-none"
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const provinceName = geo.properties.Propinsi || "Unknown";
                const provinceKey = normalizeProvince(provinceName);
                const agg = provinceAgg.get(provinceKey);
                const hasData = Boolean(agg);
                const isSelected = selectedProvince === provinceKey;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => {
                      setTooltipContent(
                        `<b>${provinceName}</b><br/>Status: ${hasData ? "Ada Data" : "Belum Ada Data"}<br/>Stok Admin: ${hasData ? `${fmt(agg!.stokAdmin)} Ton` : "-"}`
                      );
                    }}
                    onMouseLeave={() => setTooltipContent("")}
                    onClick={() => onSelectProvince(isSelected ? "" : provinceKey)}
                    style={{
                      default: {
                        fill: hasData ? "#0B4B36" : "#D1D5DB",
                        outline: "none",
                        stroke: isSelected ? "#111827" : "#ffffff",
                        strokeWidth: isSelected ? 1.8 : 0.5,
                      },
                      hover: {
                        fill: hasData ? "#00A859" : "#9CA3AF",
                        outline: "none",
                        stroke: "#111827",
                        strokeWidth: 1,
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: "#007A3F",
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

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#0B4B36]" />
          <span>Ada Data</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#D1D5DB]" />
          <span>Belum Ada Data</span>
        </div>
        {selectedProvince && (
          <button
            onClick={() => onSelectProvince("")}
            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
          >
            Reset Filter Provinsi
          </button>
        )}
      </div>
    </div>
  );
}
