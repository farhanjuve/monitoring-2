import { StockSummaryCards } from "@/components/dashboard/StockSummaryCards";
import { StockTable } from "@/components/dashboard/StockTable";
import { MapDashboard } from "@/components/dashboard/MapDashboard";
import { UnmappedPlantsBanner } from "@/components/dashboard/UnmappedPlantsBanner";

async function getLatestDate() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/stocks/`, { cache: 'no-store' });
    const data = await res.json();
    if (data && data.length > 0) {
      return data[0].tanggal;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

export default async function Home() {
  const latestDateStr = await getLatestDate();
  const displayDate = latestDateStr 
    ? new Date(latestDateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Belum ada data';

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-pupuk-darkBlue dark:text-pupuk-turquoise mb-1">
            Dashboard Stok Gudang
          </h1>
          <p className="text-muted-foreground">
            Ringkasan data stok fisik dan SAP terbaru.
          </p>
        </div>
        <div className="text-sm bg-blue-50 text-pupuk-blue px-4 py-2 rounded-md font-medium">
          Update Terakhir: {displayDate}
        </div>
      </div>
      
      <UnmappedPlantsBanner />
      <MapDashboard />
      <StockSummaryCards />
      <StockTable />
    </div>
  );
}
