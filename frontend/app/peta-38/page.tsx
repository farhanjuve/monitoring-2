import { ColorMapEditor } from "@/components/map-editor/ColorMapEditor";

export default function Peta38Page() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Perangkat Peta</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-pupuk-darkBlue">Peta Warna Manual</h1>
        <p className="mt-1 text-sm text-slate-500">
          Beri warna wilayah secara manual — per kota, per provinsi, atau per regional. Halaman ini berdiri sendiri,
          tidak terhubung ke data stok.
        </p>
      </header>

      <div className="mt-6">
        <ColorMapEditor />
      </div>
    </div>
  );
}
