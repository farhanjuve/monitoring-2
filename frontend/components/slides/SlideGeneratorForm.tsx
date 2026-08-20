"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

interface WarehouseOption {
  id: number;
  nama_gudang: string;
  kota: string;
  provinsi: string;
  kode_plants: string[];
  has_stok: boolean;
  has_photo: boolean;
}

interface Preset {
  id: number;
  name: string;
  warehouse_ids: number[];
  created_at: string | null;
}

interface GeneratedSlide {
  id: number;
  filename: string;
  tanggal: string;
  gudang_count: number;
  slide_count: number;
  created_at: string | null;
}

export function SlideGeneratorForm() {
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState<GeneratedSlide | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Data from API
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [history, setHistory] = useState<GeneratedSlide[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Preset form
  const [presetName, setPresetName] = useState("");
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);

  // ── Fetch warehouses ──────────────────────────────────────────────────
  useEffect(() => {
    setWarehousesLoading(true);
    fetch(`${API_BASE_URL}/api/slides/gudang-options?tanggal=${tanggal}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setWarehouses(data);
      })
      .catch(console.error)
      .finally(() => setWarehousesLoading(false));
  }, [tanggal]);

  // ── Fetch presets ─────────────────────────────────────────────────────
  const loadPresets = useCallback(() => {
    setPresetsLoading(true);
    fetch(`${API_BASE_URL}/api/slides/presets`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPresets(data);
      })
      .catch(console.error)
      .finally(() => setPresetsLoading(false));
  }, []);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  // ── Fetch history ─────────────────────────────────────────────────────
  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch(`${API_BASE_URL}/api/slides/history`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Filter warehouses ─────────────────────────────────────────────────
  const filteredWarehouses = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return warehouses.filter(
      (w) =>
        w.nama_gudang.toLowerCase().includes(q) ||
        w.kota.toLowerCase().includes(q) ||
        w.provinsi.toLowerCase().includes(q) ||
        w.kode_plants.some((p) => p.toLowerCase().includes(q))
    );
  }, [warehouses, searchQuery]);

  const visibleWarehouses = showAll ? filteredWarehouses : filteredWarehouses.slice(0, 6);

  // ── Selection helpers ─────────────────────────────────────────────────
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setGenerateSuccess(null);
    setGenerateError(null);
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = new Set(filteredWarehouses.map((w) => w.id));
      if (prev.size === allIds.size) return new Set();
      return allIds;
    });
    setGenerateSuccess(null);
  }, [filteredWarehouses]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setGenerateSuccess(null);
  }, []);

  const slideCount = Math.ceil(selectedIds.size / 4);
  const fmt = (n: number) => n.toLocaleString("id-ID");

  // ── Preset actions ────────────────────────────────────────────────────
  const savePreset = useCallback(async () => {
    if (!presetName.trim() || selectedIds.size === 0) return;
    setSavingPreset(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/slides/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: presetName.trim(), warehouse_ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setPresetName("");
        setShowPresetInput(false);
        loadPresets();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPreset(false);
    }
  }, [presetName, selectedIds, loadPresets]);

  const loadPreset = useCallback((preset: Preset) => {
    setSelectedIds(new Set(preset.warehouse_ids));
    setGenerateSuccess(null);
    setGenerateError(null);
  }, []);

  const deletePreset = useCallback(async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/slides/presets/${id}`, { method: "DELETE" });
      if (res.ok) loadPresets();
    } catch (e) {
      console.error(e);
    }
  }, [loadPresets]);

  // ── Generate ──────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsGenerating(true);
    setGenerateSuccess(null);
    setGenerateError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/slides/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal,
          warehouse_ids: Array.from(selectedIds),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Gagal generate slide.");
      }

      setGenerateSuccess(data);
      loadHistory();
    } catch (err: unknown) {
      setGenerateError((err as Error).message || "Terjadi kesalahan saat generate.");
    } finally {
      setIsGenerating(false);
    }
  }, [selectedIds, tanggal, loadHistory]);

  // ── Download ──────────────────────────────────────────────────────────
  const handleDownload = useCallback((slideId: number) => {
    window.open(`${API_BASE_URL}/api/slides/download/${slideId}`, "_blank");
  }, []);

  return (
    <div className="space-y-6">
      {/* ───── Form Section ───── */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-pupuk-darkBlue mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-pupuk-turquoise" />
          Konfigurasi Slide
        </h3>

        {/* Date Picker */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <CalendarDays className="w-4 h-4 text-pupuk-turquoise" />
            Tanggal Laporan
          </label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise w-full max-w-xs"
          />
        </div>

        {/* Warehouse Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">
              Pilih Gudang
              {selectedIds.size > 0 && (
                <span className="ml-2 text-xs bg-pupuk-turquoise/10 text-pupuk-darkBlue px-2 py-0.5 rounded-full font-medium">
                  {fmt(selectedIds.size)} dipilih
                </span>
              )}
            </label>
            <div className="flex gap-2 text-xs">
              <button onClick={toggleAll} className="text-pupuk-blue hover:underline font-medium">
                {selectedIds.size === filteredWarehouses.length ? "Batal Pilih" : "Pilih Semua"}
              </button>
              {selectedIds.size > 0 && (
                <button onClick={clearSelection} className="text-red-500 hover:underline font-medium">
                  Hapus Pilihan
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama gudang, kota, provinsi, atau kode plant..."
              className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Warehouse List */}
          {warehousesLoading ? (
            <div className="border border-gray-200 rounded-lg p-6 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Memuat daftar gudang...</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {visibleWarehouses.length === 0 ? (
                <div className="p-4 text-sm text-gray-400 text-center">Tidak ada gudang ditemukan.</div>
              ) : (
                visibleWarehouses.map((w) => {
                  const isSelected = selectedIds.has(w.id);
                  return (
                    <button
                      key={w.id}
                      onClick={() => toggleSelect(w.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isSelected ? "bg-pupuk-turquoise/5" : "hover:bg-gray-50"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "bg-pupuk-turquoise border-pupuk-turquoise" : "border-gray-300"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 truncate">{w.nama_gudang}</p>
                          {w.has_stok && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium shrink-0">stok</span>}
                          {w.has_photo && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium shrink-0">foto</span>}
                        </div>
                        <p className="text-xs text-gray-500">
                          {w.kota}, {w.provinsi} · {w.kode_plants.join("/")}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {filteredWarehouses.length > 6 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-xs text-pupuk-blue hover:underline font-medium flex items-center gap-1"
            >
              {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showAll ? "Sembunyikan" : `Tampilkan semua (${filteredWarehouses.length})`}
            </button>
          )}
        </div>
      </div>

      {/* ───── Preset Manager ───── */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">Preset Pilihan Gudang</h3>
          <button
            onClick={() => setShowPresetInput(!showPresetInput)}
            className="text-xs text-pupuk-blue hover:underline font-medium"
          >
            {showPresetInput ? "Batal" : "+ Simpan Pilihan Saat Ini"}
          </button>
        </div>

        {showPresetInput && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Nama preset (mis. Gudang Kalimantan Utara)"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
            <button
              onClick={savePreset}
              disabled={!presetName.trim() || selectedIds.size === 0 || savingPreset}
              className="bg-pupuk-darkBlue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-pupuk-darkBlue/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {savingPreset && <Loader2 className="w-3 h-3 animate-spin" />}
              Simpan
            </button>
          </div>
        )}

        {presetsLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Memuat preset...
          </div>
        ) : presets.length === 0 ? (
          <p className="text-xs text-gray-400">Belum ada preset tersimpan. Pilih gudang lalu simpan sebagai preset.</p>
        ) : (
          <div className="space-y-2">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{preset.name}</p>
                  <p className="text-xs text-gray-500">
                    {preset.warehouse_ids.length} gudang{preset.created_at ? ` · dibuat ${preset.created_at}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  <button
                    onClick={() => loadPreset(preset)}
                    className="text-xs bg-white border border-pupuk-darkBlue text-pupuk-darkBlue px-3 py-1.5 rounded-md font-medium hover:bg-blue-50 transition-colors"
                  >
                    Muat
                  </button>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    className="text-xs text-red-500 hover:text-red-700 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ───── Preview & Generate ───── */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-600">
              {selectedIds.size > 0 ? (
                <>
                  <span className="font-bold text-pupuk-darkBlue">{fmt(selectedIds.size)} gudang</span>
                  {" "}dipilih →{" "}
                  <span className="font-bold text-pupuk-darkBlue">{fmt(slideCount)} slide</span>
                  {" "}akan dibuat (4 gudang/slide)
                </>
              ) : (
                <span className="text-gray-400">Pilih gudang terlebih dahulu untuk menghasilkan slide.</span>
              )}
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={selectedIds.size === 0 || isGenerating}
            className="bg-pupuk-turquoise hover:bg-pupuk-turquoise/90 text-pupuk-darkBlue px-6 py-2.5 rounded-md font-semibold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Membuat Slide...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                Generate PPTX
              </>
            )}
          </button>
        </div>

        {generateSuccess && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
            <Check className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Slide berhasil dibuat!</p>
              <p className="text-xs text-emerald-700 mt-1">
                {generateSuccess.filename} · {generateSuccess.gudang_count} gudang · {generateSuccess.slide_count} slide
              </p>
            </div>
          </div>
        )}

        {generateError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <X className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800">{generateError}</p>
          </div>
        )}
      </div>

      {/* ───── History ───── */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 text-pupuk-darkBlue" />
          Riwayat Laporan
        </h3>

        {historyLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Memuat riwayat...
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada laporan yang dihasilkan.</p>
        ) : (
          <div className="space-y-3">
            {history.map((slide) => (
              <div key={slide.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{slide.filename}</p>
                  <p className="text-xs text-gray-500">
                    {slide.tanggal} · {slide.gudang_count} gudang · {slide.slide_count} slide{slide.created_at ? ` · ${slide.created_at}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(slide.id)}
                  className="shrink-0 ml-3 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
