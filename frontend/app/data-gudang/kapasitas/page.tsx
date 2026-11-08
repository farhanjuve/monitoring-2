import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { KapasitasManager } from "@/components/data-gudang/KapasitasManager";

export default function KapasitasPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/data-gudang"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-pupuk-darkBlue"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Data Gudang
        </Link>
        <h1 className="mb-1 text-3xl font-bold text-pupuk-darkBlue">Kapasitas Gudang</h1>
        <p className="text-muted-foreground">
          Ubah kapasitas per kode plant. Kapasitas satu gudang adalah jumlah kapasitas
          seluruh kode plant-nya. Setiap perubahan dicatat di log aktivitas.
        </p>
      </div>
      <KapasitasManager />
    </div>
  );
}
