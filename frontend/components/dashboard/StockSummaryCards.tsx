"use client";

interface StockCalc {
  stok_fisik: number;
  outstanding_so: number;
  stok_admin_tanpa_intransit: number;
  intransit: number;
  stok_admin: number;
}

interface StockSummaryCardsProps {
  data: StockCalc[];
  loading?: boolean;
}

export function StockSummaryCards({ data, loading = false }: StockSummaryCardsProps) {
  const totals = data.reduce(
    (acc, row) => ({
      stok_fisik: acc.stok_fisik + row.stok_fisik,
      outstanding_so: acc.outstanding_so + row.outstanding_so,
      stok_admin_tanpa_intransit: acc.stok_admin_tanpa_intransit + row.stok_admin_tanpa_intransit,
      intransit: acc.intransit + row.intransit,
      stok_admin: acc.stok_admin + row.stok_admin,
    }),
    {
      stok_fisik: 0,
      outstanding_so: 0,
      stok_admin_tanpa_intransit: 0,
      intransit: 0,
      stok_admin: 0,
    }
  );

  const fmt = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const summaries = [
    { title: "Stok Fisik", value: totals.stok_fisik, emphasis: false },
    { title: "Outstanding SO", value: totals.outstanding_so, emphasis: false },
    { title: "Admin tanpa intransit", value: totals.stok_admin_tanpa_intransit, emphasis: false },
    { title: "Intransit", value: totals.intransit, emphasis: false },
    { title: "Stok Admin", value: totals.stok_admin, emphasis: true },
  ];

  return (
    <section
      aria-labelledby="ringkasan-stok"
      className="flex flex-col self-start rounded-lg border border-slate-200 bg-white xl:sticky xl:top-4"
    >
      <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-4">
        <h2 id="ringkasan-stok" className="text-sm font-semibold text-slate-800">
          Ringkasan Stok
        </h2>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ton</span>
      </div>

      <dl className="divide-y divide-slate-100">
        {summaries.map((item) => (
          <div key={item.title} className="flex items-baseline justify-between gap-4 px-5 py-3">
            <dt className={`text-sm ${item.emphasis ? "font-semibold text-slate-800" : "text-slate-500"}`}>
              {item.title}
            </dt>
            <dd
              className={`tabular-nums text-right text-lg font-semibold ${
                item.emphasis ? "text-pupuk-darkBlue" : "text-slate-700"
              }`}
            >
              {loading ? <span className="text-slate-300">&mdash;</span> : fmt(item.value)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-auto border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-slate-400">
        Total dari gudang yang lolos filter aktif.
      </p>
    </section>
  );
}
