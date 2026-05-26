"use client";

import { useEffect, useMemo, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

type GalleryItem = {
  gudang_id: number;
  gudang: string;
  date: string;
  photos: string[];
};

export function CCTVGallery() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().split("T")[0]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/photos/gallery?tanggal=${tanggal}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Gagal memuat galeri CCTV.");
        }
        setGallery(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        setError((err as Error).message || "Terjadi kesalahan saat memuat galeri.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tanggal]);

  const resolvedImage = useMemo(() => {
    if (!selectedImage) return null;
    if (selectedImage.startsWith("http://") || selectedImage.startsWith("https://")) return selectedImage;
    return `${API_BASE_URL}${selectedImage}`;
  }, [selectedImage]);

  const resolveImageUrl = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${API_BASE_URL}${url}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <label className="text-sm font-semibold text-gray-700 mr-3">Tanggal Foto</label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise"
        />
      </div>

      {loading && <div className="text-sm text-gray-500">Memuat galeri CCTV...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && gallery.length === 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 text-sm text-gray-500">
          Belum ada foto CCTV untuk tanggal ini.
        </div>
      )}

      {gallery.map((item) => (
        <div key={item.gudang_id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg text-gray-800">{item.gudang}</h3>
            <span className="text-sm text-gray-500">{item.date}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {item.photos.map((photo, pIdx) => (
              <div key={pIdx} className="relative group overflow-hidden rounded-md cursor-pointer" onClick={() => setSelectedImage(photo)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveImageUrl(photo)} alt={`CCTV ${pIdx + 1} ${item.gudang}`} className="w-full h-64 object-cover transform transition-transform duration-300 group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="text-white w-8 h-8" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Fullscreen Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolvedImage || ""} alt="Fullscreen CCTV" className="w-full h-auto max-h-[80vh] object-contain rounded-md shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
