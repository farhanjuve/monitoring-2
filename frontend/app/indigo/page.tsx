import { IndigoDashboard } from "@/components/indigo/IndigoDashboard";

export default function IndigoPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pupuk-darkBlue mb-1">
          Realisasi INDIGO Truck Tracker
        </h1>
        <p className="text-muted-foreground">
          Laporan realisasi penggunaan aplikasi INDIGO: membandingkan DO dari report SAP (acuan)
          dengan DO yang tercatat di aplikasi INDIGO.
        </p>
      </div>
      <IndigoDashboard />
    </div>
  );
}