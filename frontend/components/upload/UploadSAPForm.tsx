import { UploadCloud, FileType, CheckCircle } from "lucide-react";

export function UploadSAPForm() {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 max-w-2xl">
      <h2 className="text-xl font-bold text-pupuk-darkBlue mb-4">Upload File SAP</h2>
      <p className="text-sm text-gray-500 mb-6">
        Silakan unggah file MB52 dan zsd_sodo hasil ekspor dari SAP. Sistem akan secara otomatis menghitung stok setelah file diunggah.
      </p>

      <div className="space-y-6">
        {/* Upload MB52 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">File MB52 (.xls, .xlsx, .csv)</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer">
            <UploadCloud className="w-10 h-10 text-pupuk-turquoise mb-3" />
            <p className="text-sm font-medium text-gray-700">Klik untuk upload atau drag and drop</p>
            <p className="text-xs text-gray-500 mt-1">Maksimal ukuran file 10MB</p>
          </div>
        </div>

        {/* Upload ZSD_SODO */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">File zsd_sodo (.xls, .xlsx, .csv)</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer">
            <UploadCloud className="w-10 h-10 text-pupuk-turquoise mb-3" />
            <p className="text-sm font-medium text-gray-700">Klik untuk upload atau drag and drop</p>
            <p className="text-xs text-gray-500 mt-1">Maksimal ukuran file 10MB</p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex justify-end">
          <button className="bg-pupuk-darkBlue text-white px-6 py-2 rounded-md font-medium hover:bg-pupuk-darkBlue/90 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-pupuk-darkBlue">
            Proses & Hitung Otomatis
          </button>
        </div>
      </div>
    </div>
  );
}
