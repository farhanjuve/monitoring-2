"use client";

import { useState, useEffect } from "react";
import { Box, PackageOpen, Truck, Warehouse, ClipboardCheck } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

interface StockCalc {
  id: number;
  tanggal: string;
  kode_plant: string;
  tipe_pupuk: string;
  stok_fisik: number;
  outstanding_so: number;
  stok_admin_tanpa_intransit: number;
  intransit: number;
  stok_admin: number;
}

export function StockSummaryCards() {
  const [totals, setTotals] = useState({
    stok_fisik: 0,
    outstanding_so: 0,
    stok_admin_tanpa_intransit: 0,
    intransit: 0,
    stok_admin: 0,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    fetch(`${API_BASE_URL}/api/stocks/?tanggal=${today}`)
      .then((res) => res.json())
      .then((data: StockCalc[]) => {
        const agg = data.reduce(
          (acc, row) => ({
            stok_fisik: acc.stok_fisik + row.stok_fisik,
            outstanding_so: acc.outstanding_so + row.outstanding_so,
            stok_admin_tanpa_intransit: acc.stok_admin_tanpa_intransit + row.stok_admin_tanpa_intransit,
            intransit: acc.intransit + row.intransit,
            stok_admin: acc.stok_admin + row.stok_admin,
          }),
          { stok_fisik: 0, outstanding_so: 0, stok_admin_tanpa_intransit: 0, intransit: 0, stok_admin: 0 }
        );
        setTotals(agg);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const summaries = [
    { title: "Stok Fisik", value: fmt(totals.stok_fisik), unit: "Ton", icon: Box, color: "bg-blue-500" },
    { title: "Outstanding SO", value: fmt(totals.outstanding_so), unit: "Ton", icon: PackageOpen, color: "bg-orange-500" },
    { title: "Admin Tanpa Intransit", value: fmt(totals.stok_admin_tanpa_intransit), unit: "Ton", icon: Warehouse, color: "bg-pupuk-darkGreen" },
    { title: "Intransit", value: fmt(totals.intransit), unit: "Ton", icon: Truck, color: "bg-pupuk-turquoise" },
    { title: "Stok Admin", value: fmt(totals.stok_admin), unit: "Ton", icon: ClipboardCheck, color: "bg-pupuk-darkBlue" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {summaries.map((item, idx) => (
        <div key={idx} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className={`${item.color} p-3 rounded-full text-white`}>
            <item.icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{item.title}</p>
            <p className="text-2xl font-bold text-gray-800">
              {loaded ? item.value : "..."} <span className="text-sm text-gray-400 font-normal">{item.unit}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
