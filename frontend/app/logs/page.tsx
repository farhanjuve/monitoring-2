import { AuditTrailTable } from "@/components/logs/AuditTrailTable";

export default function LogsPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pupuk-darkBlue dark:text-pupuk-turquoise mb-1">
          Log Aktivitas
        </h1>
        <p className="text-muted-foreground">
          Audit trail seluruh aktivitas pengguna di dalam sistem.
        </p>
      </div>
      
      <AuditTrailTable />
    </div>
  );
}
