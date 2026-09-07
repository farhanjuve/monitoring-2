"use client";

import { useState, useRef, useCallback } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle, XCircle, Loader2, Plus } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

interface MasterUploadResult {
  message: string;
  warehouses_count: number;
  plants_count: number;
  created_count?: number;
  updated_count?: number;
  merged_count?: number;
  deactivated_count?: number;
  recalculated_dates?: string[];
  merge_details?: string[];
}

interface Props {
  onSuccess: () => void;
  onAddNew?: () => void;
}

export function UploadMasterCSV({ onSuccess, onAddNew }: Props) {
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterResult, setMasterResult] = useState<MasterUploadResult | null>(null);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterProgress, setMasterProgress] = useState(0);
  const masterRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent, fileSetter: (f: File | null) => void) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith(".csv")) {
      fileSetter(f);
      setMasterError(null);
      setMasterResult(null);
      setMasterProgress(0);
    }
  }, []);

  const handleUploadMaster = useCallback(async () => {
    if (!masterFile) return;
    setMasterLoading(true);
    setMasterError(null);
    setMasterResult(null);
    setMasterProgress(0);

    const formData = new FormData();
    formData.append("file", masterFile);

    try {
      const res = await fetch(`${API_BASE_URL}/api/master-data/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setMasterProgress(100);
      if (res.ok) {
        setMasterResult(data);
        onSuccess();
      } else {
        setMasterError(data.detail || "Gagal upload master data.");
      }
    } catch {
      setMasterError("Gagal koneksi ke server.");
    } finally {
      setMasterLoading(false);
      setTimeout(() => setMasterProgress(0), 1000);
    }
  }, [masterFile, onSuccess]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold text-pupuk-darkBlue">Master Data Gudang</h3>
          <p className="text-xs text-gray-500 mt-1">
            Unggah file CSV (gdfix1505.csv) untuk memproses gudang secara massal, atau tambahkan gudang satu per satu.
          </p>
        </div>
        {onAddNew && (
          <button
            onClick={onAddNew}
            className="bg-pupuk-turquoise hover:bg-pupuk-turquoise/90 text-pupuk-darkBlue px-4 py-2 rounded-md font-semibold text-sm transition-colors flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Tambah Gudang
          </button>
        )}
      </div>

      <div className="mt-4">
        <input
          ref={masterRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              setMasterFile(e.target.files[0]);
              setMasterError(null);
              setMasterResult(null);
              setMasterProgress(0);
            }
          }}
        />

        <div
          onClick={() => masterRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, setMasterFile)}
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
            ${masterFile ? "border-pupuk-turquoise bg-emerald-50" : "border-gray-300 hover:bg-gray-50 hover:border-gray-400"}`}
        >
          {masterFile ? (
            <>
              <FileSpreadsheet className="w-10 h-10 text-pupuk-turquoise mb-2" />
              <p className="text-sm font-medium text-gray-800">{masterFile.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(masterFile.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Klik untuk upload atau drag & drop</p>
              <p className="text-xs text-gray-400 mt-1">Format: .csv</p>
            </>
          )}
        </div>

        {masterFile && (
          <button
            onClick={handleUploadMaster}
            disabled={masterLoading}
            className="mt-4 bg-pupuk-darkBlue text-white px-6 py-2.5 rounded-md font-medium hover:bg-pupuk-darkBlue/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {masterLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {masterLoading ? "Memproses..." : "Upload Master Gudang"}
          </button>
        )}

        {masterLoading && (
          <div className="mt-4 border border-blue-100 bg-blue-50 rounded-lg p-3">
            <div className="flex justify-between text-xs font-medium text-blue-800 mb-2">
              <span>Mengunggah & memproses data...</span>
              <span>{masterProgress}%</span>
            </div>
            <div className="h-2 bg-white rounded-full overflow-hidden border border-blue-100">
              <div className="h-full bg-pupuk-turquoise transition-all duration-200" style={{ width: `${masterProgress}%` }} />
            </div>
          </div>
        )}

        {masterResult && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">{masterResult.message}</p>
                {(masterResult.created_count !== undefined || masterResult.merged_count !== undefined) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-emerald-700 md:grid-cols-3">
                    <span>Dibuat: <b>{masterResult.created_count ?? 0}</b></span>
                    <span>Diupdate: <b>{masterResult.updated_count ?? 0}</b></span>
                    <span>Dimerge: <b>{masterResult.merged_count ?? 0}</b></span>
                    <span>Plant: <b>{masterResult.plants_count}</b></span>
                    <span>Dinonaktifkan: <b>{masterResult.deactivated_count ?? 0}</b></span>
                    <span>Tanggal dihitung ulang: <b>{masterResult.recalculated_dates?.length ?? 0}</b></span>
                  </div>
                )}
                {masterResult.merge_details && masterResult.merge_details.length > 0 && (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-white/70 p-3">
                    <p className="text-xs font-semibold text-emerald-800">Merge gudang:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-emerald-700">
                      {masterResult.merge_details.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {masterError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-800">{masterError}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
