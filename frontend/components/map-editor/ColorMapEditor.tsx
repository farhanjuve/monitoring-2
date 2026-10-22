"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Download, Eraser, RotateCcw, Upload } from "lucide-react";
import { getRegionalLabel } from "@/lib/regions";

type Mode = "kota" | "provinsi" | "regional";

interface FeatureProps {
  WADMPR?: string;
  WADMKK?: string;
  [key: string]: unknown;
}

interface MapFeature {
  type: "Feature";
  properties: FeatureProps;
  geometry: unknown;
}

interface MapCollection {
  type: "FeatureCollection";
  features: MapFeature[];
}

const PALETTE = [
  "#0b4b36",
  "#007a3f",
  "#00a859",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#007bff",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#64748b",
  "#0f172a",
];

const NO_COLOR = "#e2e8f0";

const STORAGE_KEY = "pupuk-monitor-peta-manual-v1";

const MODE_LABEL: Record<Mode, string> = {
  kota: "Per Kota",
  provinsi: "Per Provinsi",
  regional: "Per Regional",
};

const unitKey = (mode: Mode, prov: string, kab: string) => {
  if (mode === "kota") return `kota|${prov}|${kab}`;
  if (mode === "provinsi") return `provinsi|${prov}`;
  return `regional|${getRegionalLabel(prov)}`;
};

export function ColorMapEditor() {
  const [geo, setGeo] = useState<MapCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("kota");
  const [activeColor, setActiveColor] = useState<string>(PALETTE[0]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [hovered, setHovered] = useState<{ nama: string; warna: string | null } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>("");

  useEffect(() => {
    let active = true;
    fetch("/indonesia-kabupaten.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (active) setGeo(data);
      })
      .catch((err) => {
        if (active) setLoadError(`Gagal memuat peta: ${err.message}`);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setAssignments(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next: Record<string, string>) => {
    setAssignments(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const provinces = useMemo(() => {
    if (!geo) return [] as string[];
    return Array.from(new Set(geo.features.map((f) => f.properties.WADMPR ?? "")))
      .filter(Boolean)
      .sort();
  }, [geo]);

  const cities = useMemo(() => {
    if (!geo) return [] as string[];
    return geo.features
      .map((f) => `${f.properties.WADMPR ?? ""}|${f.properties.WADMKK ?? ""}`)
      .filter((v) => v.includes("|"))
      .sort();
  }, [geo]);

  const regionals = useMemo(() => {
    if (!geo) return [] as string[];
    return Array.from(
      new Set(geo.features.map((f) => getRegionalLabel(f.properties.WADMPR ?? "")))
    ).sort();
  }, [geo]);

  const unitOptions = useMemo(() => {
    if (mode === "kota") {
      return cities.map((c) => {
        const [prov, kab] = c.split("|");
        return { value: unitKey(mode, prov, kab), label: `${kab} — ${prov}` };
      });
    }
    if (mode === "provinsi") {
      return provinces.map((p) => ({ value: unitKey(mode, p, p), label: p }));
    }
    return regionals.map((r) => ({ value: `regional|${r}`, label: r }));
  }, [mode, cities, provinces, regionals]);

  const applyColor = useCallback(
    (key: string, color: string | null) => {
      const next = { ...assignments };
      if (color === null || next[key] === color) {
        delete next[key];
      } else {
        next[key] = color;
      }
      persist(next);
    },
    [assignments, persist]
  );

  const handleFeatureClick = (prov: string, kab: string) => {
    applyColor(unitKey(mode, prov, kab), activeColor);
  };

  const colorOf = (prov: string, kab: string) => assignments[unitKey(mode, prov, kab)] ?? null;

  const usedColors = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(assignments).forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [assignments]);

  const handleExport = () => {
    const payload = JSON.stringify({ mode, assignments }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `peta-manual-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && typeof parsed.assignments === "object" && parsed.assignments) {
          persist(parsed.assignments);
        }
      } catch {
        /* ignore file tidak valid */
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Peta:Warna Manual</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Klik wilayah pada peta untuk memberi warna. Klik lagi pada warna yang sama untuk menghapus.
            </p>
          </div>
          <div
            role="group"
            aria-label="Tingkat pewamaan"
            className="inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1"
          >
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-darkBlue/40 ${
                  mode === m ? "bg-pupuk-darkBlue text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="relative h-[420px] w-full bg-map-bg sm:h-[520px] md:h-[620px]">
          {geo ? (
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale: 1200, center: [118, -2] }}
              className="h-full w-full outline-none"
            >
              <Geographies geography={geo}>
                {({ geographies }) =>
                  geographies.map((g) => {
                    const prov = String(g.properties.WADMPR ?? "");
                    const kab = String(g.properties.WADMKK ?? "");
                    const color = colorOf(prov, kab);
                    const nama =
                      mode === "kota" ? `${kab}, ${prov}` : mode === "provinsi" ? prov : getRegionalLabel(prov);
                    return (
                      <Geography
                        key={g.rsmKey}
                        geography={g}
                        onClick={() => handleFeatureClick(prov, kab)}
                        onMouseEnter={() => setHovered({ nama, warna: color })}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          default: {
                            fill: color ?? NO_COLOR,
                            outline: "none",
                            stroke: "var(--map-stroke)",
                            strokeWidth: 0.3,
                          },
                          hover: {
                            fill: color ?? "#cbd5e1",
                            outline: "none",
                            stroke: "var(--map-ink)",
                            strokeWidth: 0.8,
                            cursor: "pointer",
                          },
                          pressed: { fill: "var(--map-ink)", outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {loadError ?? "Memuat peta..."}
            </div>
          )}

          {hovered && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm">
              <p className="font-semibold text-slate-700">{hovered.nama}</p>
              {hovered.warna ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: hovered.warna }} />
                  {hovered.warna}
                </p>
              ) : (
                <p className="mt-0.5 text-slate-400">Belum diwarnai</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Palet</span>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveColor(c)}
              aria-label={`Pilih warna ${c}`}
              aria-pressed={activeColor === c}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${
                activeColor === c ? "scale-110 border-slate-900" : "border-transparent"
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </section>

      <aside className="flex flex-col gap-4 self-start xl:sticky xl:top-4">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Pilih dari daftar</h2>
            <p className="mt-0.5 text-xs text-slate-400">Tentukan warna tanpa klik peta.</p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-colors focus:border-pupuk-darkBlue focus:outline-none focus:ring-2 focus:ring-pupuk-darkBlue/15"
            >
              <option value="">— Pilih wilayah —</option>
              {unitOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!selectedUnit}
                onClick={() => applyColor(selectedUnit, activeColor)}
                className="inline-flex items-center gap-1.5 rounded-md bg-pupuk-darkBlue px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Warnai
              </button>
              <button
                type="button"
                disabled={!selectedUnit}
                onClick={() => applyColor(selectedUnit, null)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 disabled:opacity-40"
              >
                <Eraser className="h-3.5 w-3.5" />
                Hapus
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Warna terpakai</h2>
            <span className="text-[11px] text-slate-400">{Object.keys(assignments).length} wilayah</span>
          </div>
          <div className="px-5 py-4">
            {usedColors.length === 0 ? (
              <p className="text-xs text-slate-400">Belum ada wilayah yang diwarnai.</p>
            ) : (
              <ul className="space-y-2">
                {usedColors.map(([color, count]) => (
                  <li key={color} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                      <span className="tabular-nums">{count}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        persist(
                          Object.fromEntries(
                            Object.entries(assignments).filter(([, v]) => v !== color)
                          )
                        )
                      }
                      className="text-[11px] text-slate-400 underline underline-offset-2 transition-colors hover:text-slate-700"
                    >
                      hapus warna ini
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Simpan &amp; ekspor</h2>
            <p className="mt-0.5 text-xs text-slate-400">Otomatis tersimpan di browser ini.</p>
          </div>
          <div className="flex flex-wrap gap-2 px-5 py-4">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-pupuk-darkBlue hover:text-pupuk-darkBlue"
            >
              <Download className="h-3.5 w-3.5" />
              Ekspor JSON
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-pupuk-darkBlue hover:text-pupuk-darkBlue">
              <Upload className="h-3.5 w-3.5" />
              Impor JSON
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImport(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => persist({})}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-red-500 hover:text-red-600"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset semua
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
