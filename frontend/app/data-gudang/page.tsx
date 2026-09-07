import { DataGudangManager } from "@/components/data-gudang/DataGudangManager";

export default function DataGudangPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pupuk-darkBlue mb-1">Data Gudang</h1>
        <p className="text-muted-foreground">
          Kelola master data gudang: tambah, ubah, nonaktifkan, dan unggah CSV massal.
        </p>
      </div>
      <DataGudangManager />
    </div>
  );
}
