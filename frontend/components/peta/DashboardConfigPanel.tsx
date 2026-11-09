"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Info,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  DEFAULT_THRESHOLDS,
  INDIKATOR_OPTIONS,
  PRESETS,
  normalizeConfig,
  type DashboardConfig,
  type SavedPreset,
  type SubsidiPeta,
  type Thresholds,
} from "@/lib/dashboard-config";
import { normalizeWilayah } from "@/lib/peta-aggregate";

interface DashboardConfigPanelProps {
  open: boolean;
  config: DashboardConfig;
  produkTersedia: string[];
  anperTersedia: string[];
  provinsiTersedia: string[];
  kabupatenTersedia: Array<{ nama: string; provinsi: string }>;
  savedPresets: SavedPreset[];
  onClose: () => void;
  onChange: (next: DashboardConfig) => void;
  onReset: () => void;
  onApplyPatch: (patch: Partial<DashboardConfig>) => void;
  onApplySaved: (preset: SavedPreset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
}

const SUBSIDI_OPTIONS: Array<{ value: SubsidiPeta; label: string }> = [
  { value: "SEMUA", label: "Semua" },
  { value: "SUBSIDI", label: "Subsidi" },
  { value: "NON_SUBSIDI", label: "Non subsidi" },
];

const toggleItem = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export function DashboardConfigPanel({
  open,
  config,
  produkTersedia,
  anperTersedia,
  provinsiTersedia,
  kabupatenTersedia,
  savedPresets,
  onClose,
  onChange,
  onReset,
  onApplyPatch,
  onApplySaved,
  onSavePreset,
  onDeletePreset,
}: DashboardConfigPanelProps) {
  const [presetName, setPresetName] = useState("");
  const [tersimpan, setTersimpan] = useState(false);

  const provinsiOptions = useMemo(() => {
    const list = [...provinsiTersedia];
    if (config.provinsi && !list.includes(config.provinsi)) list.push(config.provinsi);
    return list.sort((a, b) => a.localeCompare(b));
  }, [provinsiTersedia, config.provinsi]);

  const kabupatenOptions = useMemo(() => {
    const list = config.provinsi
      ? kabupatenTersedia.filter(
          (item) => normalizeWilayah(item.provinsi) === normalizeWilayah(config.provinsi),
        )
      : kabupatenTersedia;
    const hasil = [...list];
    if (
      config.kabupaten &&
      !hasil.some((item) => item.nama === config.kabupaten)
    ) {
      hasil.push({ nama: config.kabupaten, provinsi: config.provinsi });
    }
    return hasil.sort((a, b) => a.nama.localeCompare(b.nama));
  }, [kabupatenTersedia, config.provinsi, config.kabupaten]);

  const updateThreshold = (index: number, value: string) => {
    const angka = Number(value);
    if (!Number.isFinite(angka)) return;
    const next = [...config.thresholds] as Thresholds;
    next[index] = angka;
    onChange(
      normalizeConfig({
        ...config,
        thresholds: next,
      }),
    );
  };

  const simpanPreset = (event: React.FormEvent) => {
    event.preventDefault();
    if (!presetName.trim()) return;
    onSavePreset(presetName.trim());
    setPresetName("");
    setTersimpan(true);
    window.setTimeout(() => setTersimpan(false), 2200);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/45 p-3 backdrop-blur-[2px] sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Konfigurasi dashboard peta"
        className="peta-scroll flex max-h-full w-full max-w-[390px] flex-col overflow-y-auto rounded-xl border border-[var(--peta-border-strong)] bg-[var(--peta-surface)] shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--peta-border)] bg-[var(--peta-surface)] px-4 py-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--peta-text)]">
              Konfigurasi Dashboard
            </h2>
            <p className="mt-0.5 text-[10px] text-[var(--peta-mute)]">
              Filter, indikator peta, dan ambang warna.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="peta-focus -mr-1 -mt-1 rounded-md p-1.5 text-[var(--peta-mute)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
            aria-label="Tutup konfigurasi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Indikator peta & KPI
            </h3>
            <select
              value={config.indikator}
              onChange={(event) =>
                onChange({
                  ...config,
                  indikator: event.target.value as DashboardConfig["indikator"],
                })
              }
              aria-label="Pilih indikator peta"
              className="mt-1.5 w-full rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2.5 py-2 text-xs text-[var(--peta-text)] focus:border-[var(--peta-accent)] focus:outline-none"
            >
              {INDIKATOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--peta-mute)]">
              Indikator persentase memakai ambang warna. Indikator ton memakai skala relatif
              antarwilayah pada tanggal yang sama.
            </p>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Status subsidi
            </h3>
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-[var(--peta-border)] bg-[var(--peta-surface-2)] p-1">
              {SUBSIDI_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange({ ...config, subsidi: option.value })}
                  aria-pressed={config.subsidi === option.value}
                  className={`peta-focus rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                    config.subsidi === option.value
                      ? "bg-[var(--peta-accent)] text-[var(--peta-accent-ink)]"
                      : "text-[var(--peta-dim)] hover:text-[var(--peta-text)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                Produk
              </h3>
              {config.produk.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...config, produk: [] })}
                  className="text-[10px] text-[var(--peta-mute)] underline-offset-2 hover:text-[var(--peta-text)] hover:underline"
                >
                  Kosongkan
                </button>
              )}
            </div>
            <div className="mt-1.5 grid max-h-40 grid-cols-2 gap-x-2 gap-y-1 overflow-y-auto rounded-lg border border-[var(--peta-border)] bg-[var(--peta-surface-2)] p-2">
              {produkTersedia.length === 0 && (
                <p className="col-span-2 text-[10px] text-[var(--peta-mute)]">
                  Belum ada daftar produk.
                </p>
              )}
              {produkTersedia.map((produk) => (
                <label
                  key={produk}
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--peta-dim)]"
                >
                  <input
                    type="checkbox"
                    checked={config.produk.includes(produk)}
                    onChange={() =>
                      onChange({
                        ...config,
                        produk: toggleItem(config.produk, produk),
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-[var(--peta-border-strong)] bg-[var(--peta-surface)] accent-[var(--peta-accent)]"
                  />
                  <span className="truncate" title={produk}>
                    {produk}
                    {produk === "Organik Cair" ? " (liter)" : ""}
                  </span>
                </label>
              ))}
            </div>
            {config.produk.includes("Organik Cair") && (
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--peta-mute)]">
                Organik Cair bersatuan liter dan tidak dihitung ke total ton.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Anper
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {anperTersedia.length === 0 && (
                <p className="text-[10px] text-[var(--peta-mute)]">Belum ada data Anper.</p>
              )}
              {anperTersedia.map((anper) => {
                const active = config.anper.includes(anper);
                return (
                  <button
                    key={anper}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...config,
                        anper: toggleItem(config.anper, anper),
                      })
                    }
                    aria-pressed={active}
                    className={`peta-focus rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                      active
                        ? "border-[var(--peta-accent)] bg-[var(--peta-accent)]/15 text-[var(--peta-accent)]"
                        : "border-[var(--peta-border-strong)] text-[var(--peta-dim)] hover:bg-white/5"
                    }`}
                  >
                    {anper}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--peta-mute)]">
              Anper adalah label wilayah kerja; kapasitas tetap dihitung sekali per gudang.
            </p>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Wilayah
            </h3>
            <div className="mt-1.5 space-y-2">
              <label className="block text-[10px] text-[var(--peta-mute)]">
                Provinsi
                <select
                  value={config.provinsi}
                  aria-label="Filter provinsi"
                  onChange={(event) =>
                    onChange({
                      ...config,
                      provinsi: event.target.value,
                      kabupaten: "",
                    })
                  }
                  className="mt-1 w-full rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2.5 py-2 text-xs text-[var(--peta-text)] focus:border-[var(--peta-accent)] focus:outline-none"
                >
                  <option value="">Semua provinsi</option>
                  {provinsiOptions.map((provinsi) => (
                    <option key={provinsi} value={provinsi}>
                      {provinsi}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] text-[var(--peta-mute)]">
                Kabupaten/Kota
                <select
                  value={config.kabupaten}
                  aria-label="Filter kabupaten atau kota"
                  onChange={(event) => {
                    const nama = event.target.value;
                    const opsi = kabupatenOptions.find((item) => item.nama === nama);
                    onChange({
                      ...config,
                      kabupaten: nama,
                      provinsi: opsi?.provinsi || config.provinsi,
                    });
                  }}
                  className="mt-1 w-full rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2.5 py-2 text-xs text-[var(--peta-text)] focus:border-[var(--peta-accent)] focus:outline-none"
                >
                  <option value="">Semua kabupaten/kota</option>
                  {kabupatenOptions.map((item) => (
                    <option key={`${item.provinsi}-${item.nama}`} value={item.nama}>
                      {item.nama}
                      {config.provinsi ? "" : ` — ${item.provinsi}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Lini
            </h3>
            <div className="mt-1.5 flex items-start gap-2 rounded-md border border-dashed border-[var(--peta-border-strong)] px-2.5 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--st-warn)]" />
              <p className="text-[10px] leading-relaxed text-[var(--peta-mute)]">
                Lini II/III belum bisa dipilih karena belum ada sumber data lini di sistem.
                Filter ini tidak dipakai agar angka tidak menebak.
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
                Ambang warna (%)
              </h3>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...config, thresholds: DEFAULT_THRESHOLDS })
                }
                className="text-[10px] text-[var(--peta-mute)] underline-offset-2 hover:text-[var(--peta-text)] hover:underline"
              >
                Default
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(
                [
                  ["Lega ≤", 0, "ok"],
                  ["Waspada ≤", 1, "warn"],
                  ["Kritis ≤", 2, "low"],
                ] as const
              ).map(([label, index]) => (
                <label key={label} className="block text-[10px] text-[var(--peta-mute)]">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={300}
                    step={1}
                    value={config.thresholds[index]}
                    onChange={(event) => updateThreshold(index, event.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2 py-1.5 text-xs tabular-nums text-[var(--peta-text)] focus:border-[var(--peta-accent)] focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--peta-mute)]">
              Nilai di atas ambang kritis dianggap Penuh. Default 70 / 90 / 100.
            </p>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Preset cepat
            </h3>
            <div className="mt-1.5 space-y-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPatch(preset.patch)}
                  className="peta-focus w-full rounded-lg border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-[var(--peta-border-strong)] hover:bg-white/[0.05]"
                >
                  <span className="block text-[11px] font-medium text-[var(--peta-text)]">
                    {preset.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-[var(--peta-mute)]">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--peta-mute)]">
              Preset tersimpan
            </h3>
            {savedPresets.length === 0 ? (
              <p className="mt-1.5 text-[10px] text-[var(--peta-mute)]">
                Belum ada preset tersimpan.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {savedPresets.map((preset) => (
                  <li
                    key={preset.id}
                    className="flex items-center gap-1 rounded-md border border-[var(--peta-border)] bg-white/[0.02] px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onApplySaved(preset)}
                      className="peta-focus min-w-0 flex-1 truncate text-left text-[11px] text-[var(--peta-dim)] hover:text-[var(--peta-text)]"
                      title={`Terapkan ${preset.name}`}
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePreset(preset.id)}
                      className="peta-focus rounded p-1 text-[var(--peta-mute)] hover:bg-red-500/10 hover:text-red-300"
                      aria-label={`Hapus preset ${preset.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={simpanPreset} className="mt-2 flex gap-1.5">
              <input
                value={presetName}
                onChange={(event) => {
                  setPresetName(event.target.value);
                  setTersimpan(false);
                }}
                placeholder="Nama preset…"
                aria-label="Nama preset baru"
                className="min-w-0 flex-1 rounded-md border border-[var(--peta-border-strong)] bg-[var(--peta-surface-2)] px-2 py-1.5 text-[11px] text-[var(--peta-text)] placeholder:text-[var(--peta-mute)] focus:border-[var(--peta-accent)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!presetName.trim()}
                className="peta-focus inline-flex items-center gap-1 rounded-md bg-[var(--peta-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--peta-accent-ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {tersimpan ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                Simpan
              </button>
            </form>
            {tersimpan && (
              <p className="mt-1 text-[10px] text-[var(--st-ok)]">Preset tersimpan di browser ini.</p>
            )}
          </section>

          <div className="flex items-start gap-2 rounded-md border border-[var(--peta-border)] bg-white/[0.02] px-2.5 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--peta-mute)]" />
            <p className="text-[10px] leading-relaxed text-[var(--peta-mute)]">
              Kapasitas dihitung sekali per gudang dan tidak mengecil saat filter produk aktif.
              Stok admin = fisik − outstanding SO + intransit.
            </p>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="peta-focus inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--peta-border-strong)] px-3 py-2 text-[11px] font-medium text-[var(--peta-dim)] transition-colors hover:bg-white/5 hover:text-[var(--peta-text)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset semua filter
          </button>
        </div>
      </section>
    </div>
  );
}
