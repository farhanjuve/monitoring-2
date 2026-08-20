"use client";

import { useEffect, useState } from "react";
import { Presentation } from "lucide-react";
import { SlideGeneratorForm } from "@/components/slides/SlideGeneratorForm";
import { FormSkeleton, HistorySkeleton } from "@/components/slides/Skeleton";

export default function SlidesPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate initial data fetch
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pupuk-darkBlue dark:text-pupuk-turquoise mb-1 flex items-center gap-3">
          <Presentation className="w-8 h-8 text-pupuk-turquoise" />
          Generator Laporan Slide
        </h1>
        <p className="text-muted-foreground">
          Buat file presentasi (.pptx) berisi rekap stok dan foto CCTV per gudang.
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <FormSkeleton />
          <HistorySkeleton />
        </div>
      ) : (
        <SlideGeneratorForm />
      )}
    </div>
  );
}
