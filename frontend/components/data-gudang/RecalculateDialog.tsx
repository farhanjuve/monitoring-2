"use client";

import { useState, useCallback } from "react";
import { Calculator, Loader2, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { Warehouse } from "./types";

interface Props {
  warehouse: Warehouse;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function RecalculateDialog({ warehouse, onClose, onDone }: Props) {
  const [tanggalAwal, setTanggalAwal] = useState("");
  const [tanggalAkhir, setTanggalAkhir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecalculate = useCallback(async () => {
    setError(null);

    if (tanggalAwal && tanggalAkhir && tanggalAkhir < tanggalAwal) {
      setError("Tanggal akhir tidak boleh lebih awal dari tanggal awal.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = {};
      if (tanggalAwal) body.tanggal_awal = tanggalAwal;
      if (tanggalAkhir) body.tanggal_akhir = tanggalAkhir;

      const res = await fetch(
        `${API_BASE_URL}/api/master-data/warehouses/${warehouse.id}/recalculate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (res.ok) {
        const detail =
          data.processed_count != null
            ? ` Berhasil memproses ${data.processed_count} tanggal / ${data.calculation_count} kombinasi stok.`
            : "";
        onDone(data.message || `Stok gudang berhasil dihitung ulang.${detail}`);
      } else {
        setError(data.detail || "Gagal menghitung ulang stok.");
      }
    } catch {
      setError("Gagal koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }, [tanggalAwal, tanggalAkhir, warehouse.id, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-pupuk-darkBlue flex items-center gap-2">
            <Calculator className="w-5 h-5 text-pupuk-turquoise" />
            Hitung Ulang Stok
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Hitung ulang stok untuk gudang <b>{warehouse.nama_gudang}</b>.
          <br />
          Kosongkan tanggal untuk menghitung seluruh tanggal yang memiliki data SAP.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tanggal Awal (opsional)</label>
            <input
              type="date"
              value={tanggalAwal}
              onChange={(e) => setTanggalAwal(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tanggal Akhir (opsional)</label>
            <input
              type="date"
              value={tanggalAkhir}
              onChange={(e) => setTanggalAkhir(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm mb-4">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            onClick={handleRecalculate}
            disabled={loading}
            className="bg-pupuk-darkBlue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-pupuk-darkBlue/90 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {loading ? "Menghitung..." : "Hitung Ulang"}
          </button>
        </div>
      </div>
    </div>
  );
}