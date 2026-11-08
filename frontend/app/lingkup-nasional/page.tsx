import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NationalScopeManager } from "@/components/national-scope/NationalScopeManager";

export default function LingkupNasionalPage() {
  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-3xl font-bold text-pupuk-darkBlue">
            Lingkup Nasional
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Pilih gudang yang ikut dihitung pada laporan keterisian nasional.
            Gudang pabrik, pelabuhan, dan kantor tidak masuk perhitungan agar
            rasio nasional mencerminkan stok di daerah.
          </p>
        </div>
        <Link
          href="/peta-kabupaten"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Lihat peta kapasitas
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <NationalScopeManager />
    </div>
  );
}
