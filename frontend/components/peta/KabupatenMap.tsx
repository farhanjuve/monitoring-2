"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import {
  type GeoCollection,
  type KabView,
  STATUS_LABEL,
  displayKabupaten,
  featureKey,
  formatPercent,
  formatTon,
  titleCaseName,
} from "@/lib/kabupaten";

interface KabupatenMapProps {
  geo: GeoCollection | null;
  views: Map<string, KabView>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  center: [number, number];
  zoom: number;
  onMoveEnd: (center: [number, number], zoom: number) => void;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STATUS_FILL: Record<string, string> = {
  ok: "var(--st-ok)",
  warn: "var(--st-warn)",
  low: "var(--st-low)",
  full: "var(--st-full)",
  na: "var(--st-na)",
  none: "var(--st-none)",
};

export function KabupatenMap({
  geo,
  views,
  selectedKey,
  onSelect,
  center,
  zoom,
  onMoveEnd,
}: KabupatenMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      // Hindari render ulang bila ukuran tidak berubah.
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Indonesia membentang ±46° bujur dan ±17° lintang; skala dipilih agar
  // kepulauan mengisi kanvas, bukan mengapung di tengah.
  const scale = useMemo(() => {
    if (!size.width || !size.height) return 1050;
    // 0,803 rad ≈ rentang bujur; 0,298 rad ≈ rentang y Mercator.
    return Math.min((size.width * 0.96) / 0.803, (size.height * 0.9) / 0.298);
  }, [size]);

  const tooltipById = useMemo(() => {
    const map = new Map<string, string>();
    views.forEach((view, key) => {
      const hasCapacity = view.kapasitas > 0;
      const sisa = view.kapasitas - view.stokAdmin;
      const rows = [
        `<b>${escapeHtml(displayKabupaten(view.kabupaten))}</b>`,
        `<span class="peta-tip-prov">${escapeHtml(titleCaseName(view.provinsi))}</span>`,
        `<span class="peta-tip-row"><span>Stok admin</span><b>${formatTon(view.stokAdmin)} ton</b></span>`,
        `<span class="peta-tip-row"><span>Kapasitas</span><b>${hasCapacity ? `${formatTon(view.kapasitas)} ton` : "Belum ada data"}</b></span>`,
      ];
      if (hasCapacity) {
        rows.push(
          `<span class="peta-tip-row"><span>${sisa >= 0 ? "Sisa ruang" : "Kelebihan"}</span><b>${formatTon(Math.abs(sisa))} ton</b></span>`,
          `<span class="peta-tip-row"><span>Utilisasi</span><b>${formatPercent(view.ratio)}</b></span>`,
        );
      }
      rows.push(`<span class="peta-tip-status">${STATUS_LABEL[view.status]}</span>`);
      map.set(key, rows.join(""));
    });
    return map;
  }, [views]);

  return (
    <div className="peta-map" ref={containerRef}>
      <Tooltip
        id="peta-kab-tooltip"
        className="peta-tooltip"
        delayShow={90}
        delayHide={40}
      />
      {size.width > 0 && (
        <ComposableMap
          width={size.width}
          height={size.height}
          projection="geoMercator"
          projectionConfig={{ scale, center: [118, -2.4] }}
          className="peta-svg"
          aria-label="Peta utilisasi kapasitas gudang per kabupaten/kota"
        >
          <ZoomableGroup
            center={center}
            zoom={zoom}
            minZoom={1}
            maxZoom={12}
            onMoveEnd={({ coordinates, zoom: nextZoom }) => {
              onMoveEnd(coordinates as [number, number], nextZoom);
            }}
          >
          {geo && (
            <Geographies geography={geo as never}>
              {({ geographies }) =>
                geographies.map((feature) => {
                  const key = featureKey(feature);
                  const view = views.get(key);
                  const status = view?.status ?? "none";
                  const isSelected = key === selectedKey;
                  const label = view
                    ? `${displayKabupaten(view.kabupaten)}, ${titleCaseName(view.provinsi)} — ${STATUS_LABEL[view.status]}${
                        view.ratio == null
                          ? ""
                          : `, ${formatPercent(view.ratio)} kapasitas terpakai`
                      }`
                    : `${feature.properties.WADMKK ?? "Kabupaten"} — belum ada data`;

                  return (
                    <Geography
                      key={feature.rsmKey}
                      geography={feature}
                      tabIndex={-1}
                      role="img"
                      aria-label={label}
                      onClick={() => onSelect(isSelected ? null : key)}
                      className="peta-geo"
                      style={{
                        default: {
                          fill: STATUS_FILL[status],
                          outline: "none",
                          stroke: isSelected ? "var(--peta-accent)" : "var(--peta-stroke)",
                          strokeWidth: isSelected ? 1.6 : 0.35,
                        },
                        hover: {
                          fill: STATUS_FILL[status],
                          outline: "none",
                          stroke: "var(--peta-accent)",
                          strokeWidth: isSelected ? 1.6 : 1,
                        },
                        pressed: {
                          fill: STATUS_FILL[status],
                          outline: "none",
                        },
                      }}
                      data-tooltip-id="peta-kab-tooltip"
                      data-tooltip-html={
                        tooltipById.get(key) ??
                        `<b>${escapeHtml(feature.properties.WADMKK ?? "Kabupaten")}</b><span class="peta-tip-status">Belum ada data gudang</span>`
                      }
                    />
                  );
                })
              }
            </Geographies>
          )}

          <Geographies geography="/indonesia-38-provinces.geojson">
            {({ geographies }) =>
              geographies.map((feature) => (
                <Geography
                  key={`prov-${feature.rsmKey}`}
                  geography={feature}
                  style={{
                    default: {
                      fill: "transparent",
                      stroke: "rgba(148, 163, 184, 0.35)",
                      strokeWidth: 0.7,
                      outline: "none",
                      pointerEvents: "none",
                    },
                    hover: {
                      fill: "transparent",
                      stroke: "rgba(148, 163, 184, 0.35)",
                      strokeWidth: 0.7,
                      outline: "none",
                      pointerEvents: "none",
                    },
                    pressed: {
                      fill: "transparent",
                      outline: "none",
                      pointerEvents: "none",
                    },
                  }}
                />
              ))
            }
          </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      )}
    </div>
  );
}
