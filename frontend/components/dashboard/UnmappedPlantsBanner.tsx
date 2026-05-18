"use client";

import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";
import { AlertTriangle, X, Download } from "lucide-react";

export function UnmappedPlantsBanner() {
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/master-data/unmapped-plants`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.unmapped_plants) {
          setUnmapped(data.unmapped_plants);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleDownloadCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8,Kode Plant Unmapped\n" + unmapped.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `unmapped_plants_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading || !visible || unmapped.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start justify-between">
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-yellow-800">
            Perhatian: Terdapat {unmapped.length} Kode Plant belum ter-mapping!
          </h3>
          <p className="text-xs text-yellow-700 mt-1 mb-2">
            Kode plant berikut ditemukan di data SAP (MB52 / ZSD_SODO) tapi belum terdaftar di Master Data Gudang. Data stok untuk plant ini tidak akan muncul di dashboard. Silakan update Master Data Gudang di menu Upload.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {unmapped.map((kode) => (
              <span key={kode} className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded font-medium border border-yellow-300">
                {kode}
              </span>
            ))}
          </div>
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1 text-xs font-semibold bg-white border border-yellow-300 text-yellow-700 px-3 py-1.5 rounded-md hover:bg-yellow-50 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      </div>
      <button 
        onClick={() => setVisible(false)}
        className="text-yellow-500 hover:text-yellow-700 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
