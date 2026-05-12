"use client";

import React, { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Tooltip } from "react-tooltip";
import 'react-tooltip/dist/react-tooltip.css';

const geoUrl = "/indonesia-province-simple.json";

// Dummy data for province stocks
const getDummyStock = (provinceName: string) => {
  // Randomize some stock data based on string length to make it consistent
  const seed = provinceName.length;
  return {
    urea: (seed * 123) % 5000,
    npk: (seed * 87) % 3000,
  };
};

export function MapDashboard() {
  const [mounted, setMounted] = useState(false);
  const [tooltipContent, setTooltipContent] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-6">
      <h3 className="font-semibold text-gray-800 mb-4 text-xl">
        Peta Sebaran Stok Nasional
      </h3>
      <div className="w-full h-[400px] sm:h-[500px] md:h-[600px] relative border border-gray-100 rounded bg-[#f8fafc]">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            scale: 1200,
            center: [118, -2], // Center roughly around Indonesia
          }}
          className="w-full h-full outline-none"
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const provinceName = geo.properties.Propinsi || "Unknown";
                const stock = getDummyStock(provinceName);
                
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => {
                      setTooltipContent(
                        `<b>${provinceName}</b><br/>Urea: ${stock.urea} Ton<br/>NPK: ${stock.npk} Ton`
                      );
                    }}
                    onMouseLeave={() => {
                      setTooltipContent("");
                    }}
                    style={{
                      default: {
                        fill: "#0B4B36", // pupuk-darkGreen
                        outline: "none",
                        stroke: "#ffffff",
                        strokeWidth: 0.5,
                      },
                      hover: {
                        fill: "#00A859", // pupuk-turquoise
                        outline: "none",
                        stroke: "#ffffff",
                        strokeWidth: 1,
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: "#007A3F",
                        outline: "none",
                      },
                    }}
                    data-tooltip-id="my-tooltip"
                    data-tooltip-html={tooltipContent}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
        
        <Tooltip id="my-tooltip" />
        
      </div>
      <div className="mt-4 flex gap-4 text-sm text-gray-600 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#0B4B36]"></div>
          <span>Provinsi</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#00A859]"></div>
          <span>Hover / Aktif</span>
        </div>
      </div>
    </div>
  );
}
