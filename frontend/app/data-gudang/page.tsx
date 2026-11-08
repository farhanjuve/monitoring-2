import Link from "next/link";
import { Gauge } from "lucide-react";
import { DataGudangManager } from "@/components/data-gudang/DataGudangManager";

export default function DataGudangPage() {
  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold text-pupuk-darkBlue">Data Gudang</h1>
          <p className="text-muted-foreground">
            Kelola master data gudang: tambah, ubah, nonaktifkan, dan unggah CSV massal.
          </p>
        </div>
        <Link
          href="/data-gudang/kapasitas"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-pupuk-darkBlue hover:text-pupuk-darkBlue"
        >
          <Gauge className="h-4 w-4" aria-hidden="true" />
          Kapasitas Gudang
        </Link>
      </div>
      <DataGudangManager />
    </div>
  );
}
