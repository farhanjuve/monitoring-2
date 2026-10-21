"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";

export interface StockCalc {
  id: number;
  tanggal: string;
  gudang_id: number;
  nama_gudang: string | null;
  kode_plants: string | null;
  kota: string | null;
  provinsi: string | null;
  tipe_pupuk: string;
  stok_fisik: number;
  outstanding_so: number;
  stok_admin_tanpa_intransit: number;
  intransit: number;
  stok_admin: number;
}

type GroupedData = {
  [provinsi: string]: {
    [kota: string]: {
      [gudangId: string]: StockCalc[];
    };
  };
};

interface StockTableProps {
  data: StockCalc[];
  loading?: boolean;
  tipePupuk?: string;
}

const PUPUK_DOT: Record<string, string> = {
  Urea: "bg-blue-500",
  NPK: "bg-emerald-500",
};

export function StockTable({ data, loading = false, tipePupuk = "Semua" }: StockTableProps) {
  const [expandedProv, setExpandedProv] = useState<Record<string, boolean>>({});
  const [expandedKota, setExpandedKota] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const g: GroupedData = {};
    data.forEach((row) => {
      const prov = row.provinsi || "Tidak Diketahui";
      const kota = row.kota || "Tidak Diketahui";
      const gudangKey = `${row.gudang_id}|${row.nama_gudang || `Gudang ID: ${row.gudang_id}`}|${row.kode_plants || ""}`;

      if (!g[prov]) g[prov] = {};
      if (!g[prov][kota]) g[prov][kota] = {};
      if (!g[prov][kota][gudangKey]) g[prov][kota][gudangKey] = [];

      g[prov][kota][gudangKey].push(row);
    });
    return g;
  }, [data]);

  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const toggleProv = (prov: string) => {
    setExpandedProv((prev) => ({ ...prev, [prov]: !prev[prov] }));
  };

  const toggleKota = (prov: string, kota: string) => {
    const key = `${prov}-${kota}`;
    setExpandedKota((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section
      aria-labelledby="detail-stok"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <h2 id="detail-stok" className="text-sm font-semibold text-slate-800">
          Detail Stok per Lokasi
        </h2>
        <span className="text-xs text-slate-400">
          Filter pupuk: <b className="font-semibold text-slate-600">{tipePupuk}</b>
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Memuat data&hellip;</p>
        ) : data.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Belum ada data stok untuk kombinasi filter saat ini.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.keys(grouped).sort().map((prov) => (
              <div key={prov} className="overflow-hidden rounded-md border border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleProv(prov)}
                  className="flex w-full items-center justify-between bg-slate-50/60 p-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pupuk-darkBlue/30"
                >
                  <span className="flex items-center gap-2">
                    {expandedProv[prov] ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                    {prov}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    {Object.keys(grouped[prov]).length} kota
                  </span>
                </button>

                {expandedProv[prov] && (
                  <div className="bg-white">
                    {Object.keys(grouped[prov]).sort().map((kota) => {
                      const kotaKey = `${prov}-${kota}`;
                      return (
                        <div key={kotaKey} className="border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => toggleKota(prov, kota)}
                            className="flex w-full items-center justify-between p-3 pl-9 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pupuk-darkBlue/30"
                          >
                            <span className="flex items-center gap-2">
                              {expandedKota[kotaKey] ? (
                                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                              )}
                              {kota}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {Object.keys(grouped[prov][kota]).length} gudang
                            </span>
                          </button>

                          {expandedKota[kotaKey] && (
                            <div className="space-y-3 border-t border-slate-100 bg-slate-50/40 p-3 pl-6 sm:pl-9">
                              {Object.keys(grouped[prov][kota]).sort().map((gudangKey) => {
                                const [gudangId, namaGudang, kodePlants] = gudangKey.split("|");
                                const stocks = grouped[prov][kota][gudangKey];
                                const displayName = kodePlants ? `${namaGudang} - ${kodePlants}` : namaGudang;

                                return (
                                  <div key={gudangId} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
                                      <Link
                                        href={`/dashboard/gudang/${gudangId}`}
                                        className="flex items-center gap-2 text-sm font-semibold text-pupuk-darkBlue hover:text-pupuk-turquoise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-darkBlue/30"
                                      >
                                        {displayName}
                                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                          Detail, CCTV &rarr;
                                        </span>
                                      </Link>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-xs tabular-nums">
                                        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                                          <tr>
                                            <th className="px-4 py-2 font-semibold">Jenis</th>
                                            <th className="px-4 py-2 text-right font-semibold">Fisik (Ton)</th>
                                            <th className="px-4 py-2 text-right font-semibold">Out. SO (Ton)</th>
                                            <th className="px-4 py-2 text-right font-semibold">Admin (tanpa intransit)</th>
                                            <th className="px-4 py-2 text-right font-semibold">Intransit (Ton)</th>
                                            <th className="px-4 py-2 text-right font-semibold text-pupuk-darkBlue">Admin (Ton)</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {stocks.map((row) => (
                                            <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                                              <td className="px-4 py-2">
                                                <span className="inline-flex items-center gap-1.5 text-slate-600">
                                                  <span
                                                    className={`h-1.5 w-1.5 rounded-full ${PUPUK_DOT[row.tipe_pupuk] ?? "bg-slate-400"}`}
                                                    aria-hidden="true"
                                                  />
                                                  {row.tipe_pupuk}
                                                </span>
                                              </td>
                                              <td className="px-4 py-2 text-right text-slate-600">{fmt(row.stok_fisik)}</td>
                                              <td className="px-4 py-2 text-right text-slate-600">{fmt(row.outstanding_so)}</td>
                                              <td className="px-4 py-2 text-right text-slate-600">{fmt(row.stok_admin_tanpa_intransit)}</td>
                                              <td className="px-4 py-2 text-right text-slate-600">{fmt(row.intransit)}</td>
                                              <td className="px-4 py-2 text-right font-semibold text-pupuk-darkBlue">{fmt(row.stok_admin)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
