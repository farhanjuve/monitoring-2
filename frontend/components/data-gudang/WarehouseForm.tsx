"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { Warehouse } from "./types";

interface Props {
  warehouse: Warehouse | null;
  onClose: () => void;
  onSaved: () => void;
}

interface KabupatenOption {
  kota: string;
  kode_kab: number;
}

interface ReferenceProvinsi {
  provinsi: string;
  kabupaten: KabupatenOption[];
}

export function WarehouseForm({ warehouse, onClose, onSaved }: Props) {
  const isEdit = Boolean(warehouse);
  const [namaGudang, setNamaGudang] = useState(warehouse?.nama_gudang ?? "");
  const [kota, setKota] = useState(warehouse?.kota ?? "");
  const [provinsi, setProvinsi] = useState(warehouse?.provinsi ?? "");
  const [kodeKab, setKodeKab] = useState(
    warehouse?.kode_kab != null ? String(warehouse.kode_kab) : ""
  );
  const [kodeKabLocked, setKodeKabLocked] = useState(false);
  const [kodePlants, setKodePlants] = useState(warehouse?.kode_plants.join("/") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reference data for dropdowns from /reference endpoint
  const [reference, setReference] = useState<ReferenceProvinsi[]>([]);
  const [refLoading, setRefLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/master-data/reference`)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data)) setReference(data);
      })
      .catch(console.error)
      .finally(() => { if (active) setRefLoading(false); });
    return () => { active = false; };
  }, []);

  const kabupatenOptions = useCallback(
    (prov: string) => {
      const entry = reference.find((p) => p.provinsi === prov);
      return entry ? entry.kabupaten : [];
    },
    [reference]
  );

  // Pilihan kabupaten untuk provinsi yang dipilih
  const currentKabupaten = kabupatenOptions(provinsi);
  const kotaIsInList = currentKabupaten.some((k) => k.kota === kota);

  const handleProvinsiChange = useCallback((value: string) => {
    setProvinsi(value);
    setKota("");
    if (!kodeKabLocked) setKodeKab("");
  }, [kodeKabLocked]);

  const handleKotaChange = useCallback((value: string) => {
    setKota(value);
    if (!kodeKabLocked) {
      const match = currentKabupaten.find((k) => k.kota === value);
      setKodeKab(match ? String(match.kode_kab) : "");
    }
  }, [kodeKabLocked, currentKabupaten]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!namaGudang.trim()) { setError("Nama gudang wajib diisi."); return; }
    if (!kota.trim()) { setError("Kota/kabupaten wajib diisi."); return; }
    if (!provinsi.trim()) { setError("Provinsi wajib diisi."); return; }

    const body: Record<string, unknown> = {
      nama_gudang: namaGudang.trim(),
      kota: kota.trim(),
      provinsi: provinsi.trim(),
      kode_plants: kodePlants.split("/").map(s => s.trim().toUpperCase()).filter(Boolean),
    };
    if (kodeKab.trim() !== "") {
      if (isNaN(Number(kodeKab))) { setError("Kode kabupaten harus berupa angka."); return; }
      body.kode_kab = Number(kodeKab);
    }

    setLoading(true);
    try {
      const res = await fetch(
        warehouse ? `${API_BASE_URL}/api/master-data/warehouses/${warehouse.id}` : `${API_BASE_URL}/api/master-data/warehouses`,
        {
          method: warehouse ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        onSaved();
      } else {
        const err = await res.json();
        setError(err.detail || "Gagal menyimpan gudang.");
      }
    } catch {
      setError("Gagal koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, [namaGudang, kota, provinsi, kodeKab, kodePlants, warehouse, onSaved]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-pupuk-darkBlue">
            {isEdit ? "Edit Gudang" : "Tambah Gudang Baru"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Nama Gudang *</label>
            <input
              value={namaGudang}
              onChange={(e) => setNamaGudang(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Provinsi *</label>
              <select
                value={provinsi}
                onChange={(e) => handleProvinsiChange(e.target.value)}
                disabled={refLoading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise bg-white disabled:bg-gray-50"
              >
                <option value="">-- Pilih Provinsi --</option>
                {reference.map((p) => (
                  <option key={p.provinsi} value={p.provinsi}>{p.provinsi}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Kota / Kabupaten *</label>
              <select
                value={kota}
                onChange={(e) => handleKotaChange(e.target.value)}
                disabled={refLoading || !provinsi}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise bg-white disabled:bg-gray-50"
              >
                <option value="">-- Pilih Kota/Kab --</option>
                {currentKabupaten.map((k) => (
                  <option key={k.kota} value={k.kota}>
                    {k.kota} ({k.kode_kab})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!refLoading && provinsi && !kotaIsInList && kota !== "" && (
            <p className="text-[10px] text-amber-600 -mt-2">
              Kota "{kota}" tidak ada di daftar referensi untuk provinsi ini.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Kode Kabupaten
                <button
                  type="button"
                  onClick={() => setKodeKabLocked(!kodeKabLocked)}
                  className="ml-2 text-[10px] font-medium underline text-pupuk-blue"
                  title={kodeKabLocked ? "Buka kunci untuk autofill" : "Kunci supaya bisa diisi manual"}
                >
                  {kodeKabLocked ? "manual" : "otomatis"}
                </button>
              </label>
              <input
                type="number"
                value={kodeKab}
                onChange={(e) => setKodeKab(e.target.value)}
                disabled={!kodeKabLocked}
                placeholder={kodeKabLocked ? "Isi manual" : "Otomatis dari kota"}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Kode Plant (pisahkan dengan /)
              </label>
              <input
                value={kodePlants}
                onChange={(e) => setKodePlants(e.target.value)}
                placeholder="mis. F001/F002"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || refLoading}
              className="bg-pupuk-darkBlue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-pupuk-darkBlue/90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isEdit ? "Simpan Perubahan" : "Simpan Gudang"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
