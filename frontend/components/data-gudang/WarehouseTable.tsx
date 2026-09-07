"use client";

import { useState, useCallback } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { Warehouse } from "./types";

interface Props {
  warehouses: Warehouse[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  search: string;
  showInactive: boolean;
  onPageChange: (p: number) => void;
  onSearchChange: (v: string) => void;
  onShowInactiveChange: (v: boolean) => void;
  onEdit: (w: Warehouse) => void;
  onDeleted: () => void;
  onPlantsUpdated: () => void;
}

export function WarehouseTable({
  warehouses, loading, page, totalPages, total,
  search, showInactive,
  onPageChange, onSearchChange, onShowInactiveChange,
  onEdit, onDeleted, onPlantsUpdated,
}: Props) {
  const [editingPlantsId, setEditingPlantsId] = useState<number | null>(null);
  const [editingPlantsValue, setEditingPlantsValue] = useState("");
  const [savingPlants, setSavingPlants] = useState(false);

  const startEditPlants = useCallback((w: Warehouse) => {
    setEditingPlantsId(w.id);
    setEditingPlantsValue(w.kode_plants.join("/"));
  }, []);

  const cancelEditPlants = useCallback(() => {
    setEditingPlantsId(null);
    setEditingPlantsValue("");
  }, []);

  const savePlants = useCallback(async (id: number) => {
    setSavingPlants(true);
    try {
      const codes = editingPlantsValue.split("/").map(s => s.trim().toUpperCase()).filter(Boolean);
      const res = await fetch(`${API_BASE_URL}/api/master-data/warehouses/${id}/plants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode_plants: codes }),
      });
      if (res.ok) {
        cancelEditPlants();
        onPlantsUpdated();
      } else {
        const err = await res.json();
        alert(err.detail || "Gagal update kode plant.");
      }
    } catch {
      alert("Gagal koneksi ke server.");
    } finally {
      setSavingPlants(false);
    }
  }, [editingPlantsValue, cancelEditPlants, onPlantsUpdated]);

  const handleDelete = useCallback(async (w: Warehouse) => {
    if (!confirm(`Nonaktifkan gudang "${w.nama_gudang}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/master-data/warehouses/${w.id}`, { method: "DELETE" });
      if (res.ok) onDeleted();
    } catch {
      alert("Gagal menghapus gudang.");
    }
  }, [onDeleted]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-pupuk-darkBlue">Daftar Gudang</h3>
          <p className="text-xs text-gray-500">{total} gudang terdaftar</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => onShowInactiveChange(e.target.checked)}
              className="rounded border-gray-300"
            />
            Tampilkan nonaktif
          </label>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nama gudang, kota, atau provinsi..."
          className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
        />
        {search && (
          <button onClick={() => onSearchChange("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                </div>
                <div className="h-4 bg-gray-200 rounded w-20" />
                <div className="h-4 bg-gray-200 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : warehouses.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Tidak ada gudang ditemukan.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Nama Gudang</th>
                <th className="px-4 py-3">Kota</th>
                <th className="px-4 py-3">Provinsi</th>
                <th className="px-4 py-3">Kode Kab</th>
                <th className="px-4 py-3">Kode Plant</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {warehouses.map((w) => {
                const isEditing = editingPlantsId === w.id;
                return (
                  <tr key={w.id} className={`hover:bg-gray-50 transition-colors ${!w.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{w.nama_gudang}</span>
                      {!w.is_active && (
                        <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                          nonaktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{w.kota}</td>
                    <td className="px-4 py-3 text-gray-600">{w.provinsi}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{w.kode_kab}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editingPlantsValue}
                            onChange={(e) => setEditingPlantsValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") savePlants(w.id);
                              if (e.key === "Escape") cancelEditPlants();
                            }}
                            className="border border-pupuk-turquoise rounded px-2 py-1 text-xs font-mono w-36 focus:outline-none focus:ring-1 focus:ring-pupuk-turquoise"
                            placeholder="F001/F002"
                          />
                          <button onClick={() => savePlants(w.id)} disabled={savingPlants} className="text-emerald-600 hover:text-emerald-800 p-1">
                            {savingPlants ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={cancelEditPlants} className="text-gray-400 hover:text-gray-600 p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditPlants(w)}
                          className="font-mono text-xs text-pupuk-blue hover:underline cursor-pointer"
                          title="Klik untuk edit kode plant"
                        >
                          {w.kode_plants.length > 0 ? w.kode_plants.join("/") : <span className="text-gray-400 italic">kosong</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(w)}
                          className="text-gray-500 hover:text-pupuk-blue p-1.5 rounded hover:bg-blue-50 transition-colors"
                          title="Edit gudang"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {w.is_active && (
                          <button
                            onClick={() => handleDelete(w)}
                            className="text-gray-500 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                            title="Nonaktifkan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    pageNum === page
                      ? "bg-pupuk-darkBlue text-white"
                      : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
