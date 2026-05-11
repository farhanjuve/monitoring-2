import { UploadSAPForm } from "@/components/upload/UploadSAPForm";

export default function UploadPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pupuk-darkBlue dark:text-pupuk-turquoise mb-1">
          Upload Data SAP
        </h1>
        <p className="text-muted-foreground">
          Modul untuk mengunggah dan memproses data MB52 dan zsd_sodo secara otomatis.
        </p>
      </div>
      
      <UploadSAPForm />
    </div>
  );
}
