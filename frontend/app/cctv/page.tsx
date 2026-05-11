import { CCTVGallery } from "@/components/cctv/CCTVGallery";
import { UploadCloud } from "lucide-react";

export default function CCTVPage() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-pupuk-darkBlue dark:text-pupuk-turquoise mb-1">
            Galeri CCTV Gudang
          </h1>
          <p className="text-muted-foreground">
            Pemantauan visual harian kondisi gudang (maksimal 2 foto per gudang).
          </p>
        </div>
        <button className="flex items-center space-x-2 bg-pupuk-turquoise text-pupuk-darkBlue px-4 py-2 rounded-md font-medium hover:bg-pupuk-turquoise/90 transition-colors">
          <UploadCloud className="w-5 h-5" />
          <span>Upload CCTV Hari Ini</span>
        </button>
      </div>
      
      <CCTVGallery />
    </div>
  );
}
