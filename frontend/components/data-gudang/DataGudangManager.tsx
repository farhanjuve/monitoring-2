"use client";

import { useState, useCallback, useEffect } from "react";
import { WarehouseTable } from "./WarehouseTable";
import { WarehouseForm } from "./WarehouseForm";
import { UploadMasterCSV } from "./UploadMasterCSV";
import { API_BASE_URL } from "@/lib/api";
import { Warehouse } from "./types";

export function DataGudangManager() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: "20",
        show_inactive: String(showInactive),
      });
      if (search) params.set("search", search);
      const res = await fetch(`${API_BASE_URL}/api/master-data/warehouses?${params}`);
      const data = await res.json();
      setWarehouses(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, showInactive]);

  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  const handleSaved = useCallback(() => {
    fetchWarehouses();
    setShowForm(false);
    setEditWarehouse(null);
    showToast("success", editWarehouse ? "Gudang berhasil diupdate." : "Gudang baru berhasil dibuat.");
  }, [fetchWarehouses, editWarehouse, showToast]);

  const handleDeleted = useCallback(() => {
    fetchWarehouses();
    showToast("success", "Gudang berhasil dinonaktifkan.");
  }, [fetchWarehouses, showToast]);

  const handlePlantsUpdated = useCallback(() => {
    fetchWarehouses();
    showToast("success", "Kode plant berhasil diupdate.");
  }, [fetchWarehouses, showToast]);

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md text-sm font-medium shadow-lg transition-all ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      <UploadMasterCSV onSuccess={fetchWarehouses} onAddNew={() => { setEditWarehouse(null); setShowForm(true); }} />

      <WarehouseTable
        warehouses={warehouses}
        loading={loading}
        page={page}
        totalPages={totalPages}
        total={total}
        search={search}
        showInactive={showInactive}
        onPageChange={setPage}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        onShowInactiveChange={(v) => { setShowInactive(v); setPage(1); }}
        onEdit={(w) => { setEditWarehouse(w); setShowForm(true); }}
        onDeleted={handleDeleted}
        onPlantsUpdated={handlePlantsUpdated}
      />

      {showForm && (
        <WarehouseForm
          warehouse={editWarehouse}
          onClose={() => { setShowForm(false); setEditWarehouse(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
