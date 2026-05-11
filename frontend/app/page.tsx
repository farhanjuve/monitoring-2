import { StockSummaryCards } from "@/components/dashboard/StockSummaryCards";
import { StockTable } from "@/components/dashboard/StockTable";

export default function Home() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-pupuk-darkBlue dark:text-pupuk-turquoise mb-1">
            Dashboard Stok Gudang
          </h1>
          <p className="text-muted-foreground">
            Ringkasan data stok fisik dan SAP hari ini.
          </p>
        </div>
        <div className="text-sm bg-blue-50 text-pupuk-blue px-4 py-2 rounded-md font-medium">
          Update Terakhir: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>
      
      <StockSummaryCards />
      <StockTable />
    </div>
  );
}
