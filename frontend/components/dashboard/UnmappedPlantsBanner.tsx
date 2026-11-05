"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { AlertTriangle, X, Download } from "lucide-react";

interface ExcludedDetail {
  pabrik?: string[];
  pelabuhan?: string[];
  kantor?: string[];
  tanpa_stok?: string[];
}

interface UnmappedPlantsResponse {
  unmapped_count: number;
  unmapped_plants: string[];
  excluded_count?: number;
  excluded_plants?: string[];
  excluded_detail?: ExcludedDetail;
  as_of?: string | null;
}

const numberFormat = new Intl.NumberFormat("id-ID");
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function downloadCsv(filename: string, header: string, rows: string[]) {
  const csvContent =
    "data:text/csv;charset=utf-8," + [header, ...rows].join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function UnmappedPlantsBanner() {
  const [data, setData] = useState<UnmappedPlantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/master-data/unmapped-plants`)
      .then((res) => res.json())
      .then((result: UnmappedPlantsResponse) => {
        if (result && result.unmapped_plants) {
          setData(result);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const unmapped = data?.unmapped_plants ?? [];
  const excludedDetail = data?.excluded_detail;
  const excludedCount = data?.excluded_count ?? 0;
  const dateSuffix = data?.as_of
    ? ` Data per ${dateFormat.format(new Date(data.as_of))}.`
    : "";

  const excludedParts = [
    excludedDetail?.pabrik?.length
      ? `${numberFormat.format(excludedDetail.pabrik.length)} kode pabrik`
      : null,
    excludedDetail?.pelabuhan?.length
      ? `${numberFormat.format(excludedDetail.pelabuhan.length)} kode pelabuhan`
      : null,
    excludedDetail?.kantor?.length
      ? `${numberFormat.format(excludedDetail.kantor.length)} kode kantor`
      : null,
    excludedDetail?.tanpa_stok?.length
      ? `${numberFormat.format(excludedDetail.tanpa_stok.length)} kode lama tanpa stok`
      : null,
  ].filter(Boolean) as string[];

  const handleDownloadCsv = () => {
    downloadCsv(
      `unmapped_plants_${new Date().toISOString().split("T")[0]}.csv`,
      "Kode Plant Unmapped",
      unmapped,
    );
  };

  const handleDownloadExcluded = () => {
    downloadCsv(
      `kode_plant_dikecualikan_${new Date().toISOString().split("T")[0]}.csv`,
      "Kode Plant Dikecualikan",
      data?.excluded_plants ?? [],
    );
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
            Perhatian: Terdapat {numberFormat.format(unmapped.length)} Kode
            Plant belum ter-mapping!
          </h3>
          <p className="text-xs text-yellow-700 mt-1 mb-2">
            Kode plant berikut ditemukan di data SAP (MB52 / ZSD_SODO) tapi
            belum terdaftar di Master Data Gudang. Data stok untuk plant ini
            tidak akan muncul di dashboard. Silakan update Master Data Gudang
            di menu Upload.{dateSuffix}
          </p>
          {excludedParts.length > 0 && (
            <p className="text-xs text-yellow-700/80 mb-2">
              Tidak ditampilkan: {excludedParts.join(", ")}.
            </p>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            {unmapped.map((kode) => (
              <span
                key={kode}
                className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded font-medium border border-yellow-300"
              >
                {kode}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-1 text-xs font-semibold bg-white border border-yellow-300 text-yellow-700 px-3 py-1.5 rounded-md hover:bg-yellow-50 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
            {excludedCount > 0 && (
              <button
                onClick={handleDownloadExcluded}
                className="text-xs font-medium text-yellow-700/80 underline underline-offset-2 hover:text-yellow-800 transition-colors"
              >
                Unduh {numberFormat.format(excludedCount)} kode dikecualikan
              </button>
            )}
          </div>
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
