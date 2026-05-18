"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle, XCircle, Loader2, CalendarDays } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

interface UploadResult {
  message: string;
  rows_processed: number;
  calculations_updated: number;
  upload: {
    id: number;
    jenis_file: string;
    tanggal_data: string;
    filename: string;
    status: string;
  };
}

export function UploadSAPForm() {
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().split("T")[0]);
  
  // MB52 state
  const [mb52File, setMb52File] = useState<File | null>(null);
  const [mb52Loading, setMb52Loading] = useState(false);
  const [mb52Result, setMb52Result] = useState<UploadResult | null>(null);
  const [mb52Error, setMb52Error] = useState<string | null>(null);
  const mb52Ref = useRef<HTMLInputElement>(null);

  // ZSD_SODO state
  const [zsdFile, setZsdFile] = useState<File | null>(null);
  const [zsdLoading, setZsdLoading] = useState(false);
  const [zsdResult, setZsdResult] = useState<UploadResult | null>(null);
  const [zsdError, setZsdError] = useState<string | null>(null);
  const zsdRef = useRef<HTMLInputElement>(null);

  // Master Gudang state
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterResult, setMasterResult] = useState<{message: string, warehouses_count: number, plants_count: number} | null>(null);
  const [masterError, setMasterError] = useState<string | null>(null);
  const masterRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (
    type: "mb52" | "zsd-sodo",
    file: File,
    setLoading: (v: boolean) => void,
    setResult: (v: UploadResult | null) => void,
    setError: (v: string | null) => void,
  ) => {
    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tanggal", tanggal);

    try {
      const res = await fetch(`${API_BASE_URL}/api/stocks/upload/${type}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Upload gagal");
      }
      setResult(data);
    } catch (err: unknown) {
      setError((err as Error).message || "Terjadi kesalahan saat mengupload file.");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (
    e: React.DragEvent,
    setFile: (f: File) => void,
    acceptsCsv: boolean = false
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if ((!acceptsCsv && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) ||
          (acceptsCsv && file.name.endsWith(".csv"))) {
        setFile(file);
      }
    }
  };

  const handleUploadMaster = async () => {
    if (!masterFile) return;
    setMasterLoading(true);
    setMasterResult(null);
    setMasterError(null);

    const formData = new FormData();
    formData.append("file", masterFile);

    try {
      const res = await fetch(`${API_BASE_URL}/api/master-data/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Upload gagal");
      }
      setMasterResult(data);
    } catch (err: unknown) {
      setMasterError((err as Error).message || "Terjadi kesalahan saat mengupload file master.");
    } finally {
      setMasterLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Tanggal Data */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
          <CalendarDays className="w-4 h-4 text-pupuk-turquoise" />
          Tanggal Data SAP
        </label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise w-full max-w-xs"
        />
        <p className="text-xs text-gray-400 mt-1">
          Pilih tanggal sesuai data yang diekspor dari SAP.
        </p>
      </div>

      {/* Upload MB52 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-pupuk-darkBlue mb-1">File MB52</h3>
        <p className="text-xs text-gray-500 mb-4">Data stok fisik per material per storage location dari SAP.</p>

        <input
          ref={mb52Ref}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setMb52File(e.target.files[0])}
        />

        <div
          onClick={() => mb52Ref.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, setMb52File)}
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
            ${mb52File ? "border-pupuk-turquoise bg-emerald-50" : "border-gray-300 hover:bg-gray-50 hover:border-gray-400"}`}
        >
          {mb52File ? (
            <>
              <FileSpreadsheet className="w-10 h-10 text-pupuk-turquoise mb-2" />
              <p className="text-sm font-medium text-gray-800">{mb52File.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(mb52File.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Klik untuk upload atau drag & drop</p>
              <p className="text-xs text-gray-400 mt-1">Format: .xlsx atau .xls</p>
            </>
          )}
        </div>

        {mb52File && (
          <button
            onClick={() => handleUpload("mb52", mb52File, setMb52Loading, setMb52Result, setMb52Error)}
            disabled={mb52Loading}
            className="mt-4 bg-pupuk-darkBlue text-white px-6 py-2.5 rounded-md font-medium hover:bg-pupuk-darkBlue/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {mb52Loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {mb52Loading ? "Memproses..." : "Upload & Proses MB52"}
          </button>
        )}

        {mb52Result && <ResultBanner result={mb52Result} />}
        {mb52Error && <ErrorBanner message={mb52Error} />}
      </div>

      {/* Upload ZSD_SODO */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-pupuk-darkBlue mb-1">File ZSD_SODO</h3>
        <p className="text-xs text-gray-500 mb-4">Data outstanding sales order / delivery order dari SAP.</p>

        <input
          ref={zsdRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setZsdFile(e.target.files[0])}
        />

        <div
          onClick={() => zsdRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, setZsdFile)}
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
            ${zsdFile ? "border-pupuk-turquoise bg-emerald-50" : "border-gray-300 hover:bg-gray-50 hover:border-gray-400"}`}
        >
          {zsdFile ? (
            <>
              <FileSpreadsheet className="w-10 h-10 text-pupuk-turquoise mb-2" />
              <p className="text-sm font-medium text-gray-800">{zsdFile.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(zsdFile.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Klik untuk upload atau drag & drop</p>
              <p className="text-xs text-gray-400 mt-1">Format: .xlsx atau .xls</p>
            </>
          )}
        </div>

        {zsdFile && (
          <button
            onClick={() => handleUpload("zsd-sodo", zsdFile, setZsdLoading, setZsdResult, setZsdError)}
            disabled={zsdLoading}
            className="mt-4 bg-pupuk-darkBlue text-white px-6 py-2.5 rounded-md font-medium hover:bg-pupuk-darkBlue/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {zsdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {zsdLoading ? "Memproses..." : "Upload & Proses ZSD_SODO"}
          </button>
        )}

        {zsdResult && <ResultBanner result={zsdResult} />}
        {zsdError && <ErrorBanner message={zsdError} />}
      </div>

      {/* Upload Master Gudang */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-pupuk-darkBlue mb-1">Master Data Gudang</h3>
        <p className="text-xs text-gray-500 mb-4">Upload file CSV (gdfix1505.csv) untuk memperbarui data gudang dan kode plant.</p>

        <input
          ref={masterRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setMasterFile(e.target.files[0])}
        />

        <div
          onClick={() => masterRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, setMasterFile, true)}
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

        {masterResult && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">{masterResult.message}</p>
              </div>
            </div>
          </div>
        )}
        {masterError && <ErrorBanner message={masterError} />}
      </div>
    </div>
  );
}

function ResultBanner({ result }: { result: UploadResult }) {
  return (
    <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">{result.message}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-emerald-700">
            <span>Baris diproses: <b>{result.rows_processed}</b></span>
            <span>Kalkulasi diperbarui: <b>{result.calculations_updated}</b></span>
            <span>File: <b>{result.upload.filename}</b></span>
            <span>Tanggal data: <b>{result.upload.tanggal_data}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <p className="text-sm text-red-800">{message}</p>
      </div>
    </div>
  );
}
