"use client";

import { useState } from "react";
import { Maximize2, X } from "lucide-react";

export function CCTVGallery() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const dummyGallery = [
    { gudang: "Gudang A - Jakarta", date: "2026-05-08", photos: ["https://placehold.co/600x400/004d40/FFFFFF/png?text=CCTV+1+-+Gudang+A", "https://placehold.co/600x400/001f3f/FFFFFF/png?text=CCTV+2+-+Gudang+A"] },
    { gudang: "Gudang B - Surabaya", date: "2026-05-08", photos: ["https://placehold.co/600x400/40e0d0/000000/png?text=CCTV+1+-+Gudang+B", "https://placehold.co/600x400/007bff/FFFFFF/png?text=CCTV+2+-+Gudang+B"] }
  ];

  return (
    <div className="space-y-6">
      {dummyGallery.map((item, idx) => (
        <div key={idx} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg text-gray-800">{item.gudang}</h3>
            <span className="text-sm text-gray-500">{item.date}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {item.photos.map((photo, pIdx) => (
              <div key={pIdx} className="relative group overflow-hidden rounded-md cursor-pointer" onClick={() => setSelectedImage(photo)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={`CCTV ${pIdx + 1} ${item.gudang}`} className="w-full h-64 object-cover transform transition-transform duration-300 group-hover:scale-105" />
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
            <img src={selectedImage} alt="Fullscreen CCTV" className="w-full h-auto max-h-[80vh] object-contain rounded-md shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
