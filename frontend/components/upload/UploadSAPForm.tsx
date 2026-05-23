"use client";

import { useState, useRef, useEffect } from "react";
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

  // Photo Upload state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoGudangId, setPhotoGudangId] = useState<string>("");
  const [photoKameraId, setPhotoKameraId] = useState<string>("CCTV Pintu Depan");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState<{message: string, url: string} | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [gudangList, setGudangList] = useState<{id: number, nama_gudang: string, kota: string, kode_plants: string[]}[]>([]);

  // Bulk Photo Upload state
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<any[] | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/master-data/gudang`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setGudangList(data);
      })
      .catch(console.error);
  }, []);

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

  const handleUploadPhoto = async () => {
    if (!photoFile || !photoGudangId) {
      setPhotoError("File foto dan pilihan gudang wajib diisi.");
      return;
    }
    setPhotoLoading(true);
    setPhotoResult(null);
    setPhotoError(null);

    const formData = new FormData();
    formData.append("file", photoFile);
    formData.append("gudang_id", photoGudangId);
    formData.append("tanggal", tanggal);
    formData.append("kamera_id", photoKameraId);

    try {
      const res = await fetch(`${API_BASE_URL}/api/photos/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Upload gagal");
      }
      setPhotoResult(data);
      setPhotoFile(null);
    } catch (err: any) {
      setPhotoError(err.message || "Terjadi kesalahan saat mengupload foto.");
    } finally {
      setPhotoLoading(false);
    }
  };

  const validateFilename = (fileName: string) => {
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex === -1) return { valid: false, reason: "Nama file tidak memiliki ekstensi." };
    const baseName = fileName.substring(0, dotIndex);
    const parts = baseName.split("_");
    
    if (parts.length < 2) {
      return { valid: false, reason: "Nama file harus berformat: [KodePlant]_[Feed]_[Tanggal]" };
    }
    
    const plantCode = parts[0].trim().toUpperCase();
    const feedStr = parts[1].trim().toLowerCase();
    
    // Find warehouse
    const matchGudang = (gudangList as any[]).find(g => 
      g.kode_plants && g.kode_plants.map((p: string) => p.toUpperCase()).includes(plantCode)
    );
    
    if (!matchGudang) {
      return { valid: false, reason: `Kode plant '${plantCode}' tidak terdaftar.` };
    }
    
    let cameraName = "";
    if (feedStr === "1" || feedStr.includes("depan")) {
      cameraName = "CCTV Pintu Depan";
    } else if (feedStr === "2" || feedStr.includes("dalam")) {
      cameraName = "CCTV Dalam Area Stok";
    } else {
      return { valid: false, reason: `Feed kamera '${feedStr}' tidak dikenali. Gunakan '1'/'depan' atau '2'/'dalam'.` };
    }
    
    let dateVal = "Pilihan default UI";
    if (parts.length >= 3) {
      const datePart = parts[2].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        dateVal = datePart;
      } else if (/^\d{8}$/.test(datePart)) {
        dateVal = `${datePart.substring(0,4)}-${datePart.substring(4,6)}-${datePart.substring(6,8)}`;
      }
    }
    
    return {
      valid: true,
      gudangName: matchGudang.nama_gudang,
      kota: matchGudang.kota,
      camera: cameraName,
      tanggal: dateVal,
      plantCode
    };
  };

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) return;
    
    setBulkLoading(true);
    setBulkError(null);
    setBulkResults(null);
    
    const formData = new FormData();
    bulkFiles.forEach(file => {
      formData.append("files", file);
    });
    formData.append("default_tanggal", tanggal);
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/photos/bulk-upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Bulk Upload gagal");
      }
      setBulkResults(data.results);
      setBulkFiles([]);
    } catch (err: any) {
      setBulkError(err.message || "Terjadi kesalahan saat mengunggah foto secara massal.");
    } finally {
      setBulkLoading(false);
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

      {/* Upload Foto Gudang - Single */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-pupuk-darkBlue mb-1">Upload Foto CCTV Manual (Single)</h3>
        <p className="text-xs text-gray-500 mb-4">Unggah satu foto CCTV secara manual untuk gudang tertentu.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Pilih Gudang</label>
            <select
              value={photoGudangId}
              onChange={(e) => setPhotoGudangId(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise w-full"
            >
              <option value="">-- Pilih Gudang --</option>
              {gudangList.map(g => (
                <option key={g.id} value={g.id}>{g.nama_gudang} - {g.kota}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Pilih Kamera / Sudut</label>
            <select
              value={photoKameraId}
              onChange={(e) => setPhotoKameraId(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise w-full"
            >
              <option value="CCTV Pintu Depan">CCTV Pintu Depan</option>
              <option value="CCTV Dalam Area Stok">CCTV Dalam Area Stok</option>
            </select>
          </div>
        </div>

        <input
          ref={photoRef}
          type="file"
          accept="image/jpeg, image/png, image/jpg"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setPhotoFile(e.target.files[0])}
        />

        <div
          onClick={() => photoRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f && f.type.startsWith("image/")) setPhotoFile(f);
          }}
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
            ${photoFile ? "border-pupuk-turquoise bg-emerald-50/50" : "border-gray-300 hover:bg-gray-50 hover:border-gray-400"}`}
        >
          {photoFile ? (
            <>
              <CheckCircle className="w-10 h-10 text-pupuk-turquoise mb-2" />
              <p className="text-sm font-medium text-gray-800">{photoFile.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(photoFile.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Klik untuk upload foto (JPG/PNG) atau Drag & Drop</p>
            </>
          )}
        </div>

        <button
          onClick={handleUploadPhoto}
          disabled={photoLoading || !photoFile || !photoGudangId}
          className="mt-4 bg-pupuk-darkBlue text-white px-6 py-2.5 rounded-md font-medium hover:bg-pupuk-darkBlue/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {photoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {photoLoading ? "Mengunggah..." : "Upload Foto"}
        </button>

        {photoResult && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">{photoResult.message}</p>
              </div>
            </div>
          </div>
        )}
        {photoError && <ErrorBanner message={photoError} />}
      </div>

      {/* Upload Foto Gudang - Bulk */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-pupuk-darkBlue mb-1">Bulk Upload Foto CCTV (Massal)</h3>
        <p className="text-xs text-gray-500 mb-4">
          Unggah banyak foto CCTV sekaligus. Sistem akan mendeteksi tujuan gudang dan kamera secara otomatis berdasarkan nama file.
        </p>

        {/* Info Box Naming Convention */}
        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 mb-4 text-xs text-amber-800 space-y-2">
          <p className="font-semibold text-amber-900">💡 Aturan Penamaan File Foto (Agar tidak salah gudang):</p>
          <p>Format: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">{"[KodePlant]_[FeedKamera]_[Tanggal].jpg"}</code></p>
          <ul className="list-disc list-inside pl-1 space-y-1">
            <li><b>[KodePlant]</b>: Kode plant SAP gudang (Contoh: <code className="font-mono">F332</code>, <code className="font-mono">F331</code>)</li>
            <li><b>[FeedKamera]</b>: <code className="font-mono">1</code> / <code className="font-mono">depan</code> (CCTV Pintu Depan) ATAU <code className="font-mono">2</code> / <code className="font-mono">dalam</code> (CCTV Area Stok)</li>
            <li><b>[Tanggal]</b> (Opsional): Format <code className="font-mono">YYYY-MM-DD</code> atau <code className="font-mono">YYYYMMDD</code> (Contoh: <code className="font-mono">2026-05-23</code>). Jika dikosongkan, menggunakan tanggal data di atas.</li>
          </ul>
          <p className="pt-1"><i>Contoh: <code className="font-mono font-semibold">F332_depan_2026-05-23.jpg</code> atau <code className="font-mono font-semibold">F331_2.png</code></i></p>
        </div>

        <input
          ref={bulkRef}
          type="file"
          multiple
          accept="image/jpeg, image/png, image/jpg"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              const filesArray = Array.from(e.target.files);
              setBulkFiles(prev => [...prev, ...filesArray]);
            }
          }}
        />

        <div
          onClick={() => bulkRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const filesArray = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
            if (filesArray.length > 0) {
              setBulkFiles(prev => [...prev, ...filesArray]);
            }
          }}
          className="border-2 border-dashed border-gray-300 hover:border-pupuk-turquoise hover:bg-gray-50/50 rounded-lg p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer mb-4"
        >
          <UploadCloud className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">Klik untuk memilih beberapa foto atau Drag & Drop</p>
          <p className="text-xs text-gray-400 mt-1">Format: JPG, JPEG, PNG</p>
        </div>

        {/* Local Validation Preview List */}
        {bulkFiles.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-700">Daftar Foto yang akan Diunggah ({bulkFiles.length})</span>
              <button
                onClick={() => setBulkFiles([])}
                className="text-[10px] text-red-600 hover:underline font-medium"
              >
                Hapus Semua
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 text-xs">
              {bulkFiles.map((file, idx) => {
                const check = validateFilename(file.name);
                return (
                  <div key={idx} className="p-3 flex justify-between items-center hover:bg-gray-50">
                    <div className="space-y-0.5 pr-2">
                      <p className="font-mono font-semibold text-gray-800 break-all">{file.name}</p>
                      <p className="text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {check.valid ? (
                        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded px-2 py-1 space-y-0.5">
                          <p className="font-semibold text-[10px]">🟢 Terdeteksi Otomatis</p>
                          <p>{check.gudangName} ({check.camera})</p>
                          <p className="text-[10px] text-emerald-600">Tgl: {check.tanggal}</p>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-100 text-red-800 rounded px-2 py-1">
                          <p className="font-semibold text-[10px]">🔴 Validasi Gagal</p>
                          <p className="text-[10px] text-red-600">{check.reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleBulkUpload}
          disabled={bulkLoading || bulkFiles.length === 0}
          className="bg-pupuk-turquoise hover:bg-pupuk-turquoise/90 text-white px-6 py-2.5 rounded-md font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {bulkLoading ? "Mengunggah..." : `Upload ${bulkFiles.length} Foto Massal`}
        </button>

        {/* Bulk Upload Results Report */}
        {bulkResults && (
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-semibold text-xs text-gray-700">
              Laporan Hasil Bulk Upload
            </div>
            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto text-xs">
              {bulkResults.map((res: any, idx: number) => (
                <div key={idx} className="p-3 flex justify-between items-start">
                  <span className="font-mono text-gray-700 break-all pr-2">{res.filename}</span>
                  {res.status === "success" ? (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded shrink-0 font-medium">
                      ✓ Berhasil dipetakan ke {res.gudang} ({res.kamera})
                    </span>
                  ) : (
                    <span className="bg-red-100 text-red-800 text-[10px] px-2 py-0.5 rounded shrink-0 font-medium max-w-[200px] break-words">
                      ✗ Gagal: {res.reason}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {bulkError && <ErrorBanner message={bulkError} />}
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
