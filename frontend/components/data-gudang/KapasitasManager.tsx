"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Search } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

interface KapasitasItem {
  kode_plant: string;
  kapasitas_ton: number;
  nama_gudang: string | null;
  kota: string | null;
  provinsi: string | null;
  terpetakan: boolean;
  total_kapasitas_gudang: number;
}

const PER_HALAMAN = 50;

const fmt = (n: number) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const keAngka = (teks: string): number => {
  const bersih = teks.replace(/\./g, "").replace(",", ".").trim();
  if (bersih === "") return 0;
  const nilai = Number(bersih);
  return Number.isFinite(nilai) ? Math.max(0, nilai) : 0;
};

export function KapasitasManager() {
  const [items, setItems] = useState<KapasitasItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [hanyaKosong, setHanyaKosong] = useState(false);
  const [halaman, setHalaman] = useState(1);
  /** kode_plant -> nilai yang sedang diedit (teks, agar bisa kosong sementara). */
  const [edit, setEdit] = useState<Record<string, string>>({});

  const muat = useCallback(async () => {
    setLoading(true);
    setGalat(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/master-data/kapasitas`);
      if (!res.ok) throw new Error("Gagal memuat kapasitas.");
      setItems((await res.json()) as KapasitasItem[]);
      setEdit({});
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat kapasitas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const nilaiEfektif = (item: KapasitasItem) =>
    item.kode_plant in edit ? keAngka(edit[item.kode_plant]) : item.kapasitas_ton;

  const tersaring = useMemo(() => {
    const jarum = cari.trim().toLowerCase();
    return items.filter((item) => {
      if (hanyaKosong && nilaiEfektif(item) > 0) return false;
      if (!jarum) return true;
      return (
        item.kode_plant.toLowerCase().includes(jarum) ||
        (item.nama_gudang ?? "").toLowerCase().includes(jarum) ||
        (item.kota ?? "").toLowerCase().includes(jarum) ||
        (item.provinsi ?? "").toLowerCase().includes(jarum)
      );
    });
  }, [items, cari, hanyaKosong, edit]);

  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / PER_HALAMAN));
  const halamanAman = Math.min(halaman, totalHalaman);
  const tampil = tersaring.slice(
    (halamanAman - 1) * PER_HALAMAN,
    halamanAman * PER_HALAMAN,
  );

  const perubahan = useMemo(
    () =>
      Object.entries(edit).filter(([kode, teks]) => {
        const item = items.find((i) => i.kode_plant === kode);
        return item ? Math.abs(keAngka(teks) - item.kapasitas_ton) > 0.001 : false;
      }),
    [edit, items],
  );

  const totalKapasitas = useMemo(
    () => items.reduce((total, item) => total + nilaiEfektif(item), 0),
    [items, edit],
  );

  const ubah = (kode: string, teks: string) => {
    setEdit((prev) => ({ ...prev, [kode]: teks }));
    setPesan(null);
  };

  const simpan = async () => {
    if (perubahan.length === 0) return;
    setMenyimpan(true);
    setGalat(null);
    setPesan(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/master-data/kapasitas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: perubahan.map(([kode, teks]) => ({
            kode_plant: kode,
            kapasitas_ton: keAngka(teks),
          })),
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan kapasitas.");
      const hasil = (await res.json()) as { diperbarui: number; total_kapasitas: number };
      setPesan(`${hasil.diperbarui} kapasitas disimpan.`);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan kapasitas.");
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="cari-kapasitas" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Cari kode plant / gudang / kota
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              id="cari-kapasitas"
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setHalaman(1);
              }}
              placeholder="Contoh: B402 / Lhokseumawe / Aceh"
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-pupuk-darkBlue focus:outline-none focus:ring-2 focus:ring-pupuk-darkBlue/15"
            />
          </div>
        </div>

        <label className="mt-5 inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={hanyaKosong}
            onChange={(e) => {
              setHanyaKosong(e.target.checked);
              setHalaman(1);
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Hanya yang belum ada kapasitas
        </label>

        <div className="ml-auto mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEdit({})}
            disabled={perubahan.length === 0 || menyimpan}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:border-slate-400 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Batalkan
          </button>
          <button
            type="button"
            onClick={simpan}
            disabled={perubahan.length === 0 || menyimpan}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-pupuk-darkBlue px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {menyimpan ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Simpan{perubahan.length > 0 ? ` (${perubahan.length})` : ""}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
        <span>
          {tersaring.length.toLocaleString("id-ID")} dari {items.length.toLocaleString("id-ID")} kode plant
        </span>
        <span>
          Total kapasitas: <b className="tabular-nums text-slate-700">{fmt(totalKapasitas)} t</b>
        </span>
        <span className="text-slate-400">
          Kapasitas per gudang = jumlah kapasitas kode plant-nya.
        </span>
      </div>

      {galat && (
        <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{galat}</p>
      )}
      {pesan && (
        <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-700">
          {pesan}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Kode Plant</th>
              <th className="px-3 py-2.5 font-semibold">Gudang</th>
              <th className="px-3 py-2.5 font-semibold">Kota / Provinsi</th>
              <th className="px-3 py-2.5 text-right font-semibold">Kapasitas (t)</th>
              <th className="px-5 py-2.5 text-right font-semibold">Total gudang (t)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                  Memuat…
                </td>
              </tr>
            )}
            {!loading &&
              tampil.map((item) => {
                const diubah = item.kode_plant in edit;
                const efektif = nilaiEfektif(item);
                const totalGudang = diubah
                  ? item.total_kapasitas_gudang - item.kapasitas_ton + efektif
                  : item.total_kapasitas_gudang;
                return (
                  <tr
                    key={item.kode_plant}
                    className={`border-b border-slate-100 last:border-0 ${diubah ? "bg-amber-50/60" : ""}`}
                  >
                    <td className="px-5 py-2 font-mono text-xs text-slate-700">
                      {item.kode_plant}
                      {!item.terpetakan && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-sans text-slate-500">
                          belum terpetakan
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{item.nama_gudang ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {[item.kota, item.provinsi].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.kode_plant in edit ? edit[item.kode_plant] : fmt(item.kapasitas_ton)}
                        onChange={(e) => ubah(item.kode_plant, e.target.value)}
                        aria-label={`Kapasitas ${item.kode_plant}`}
                        className={`w-28 rounded-md border px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-pupuk-darkBlue/15 ${
                          diubah
                            ? "border-amber-400 bg-white"
                            : "border-slate-200 bg-white text-slate-700 focus:border-pupuk-darkBlue"
                        }`}
                      />
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-500">
                      {item.terpetakan ? fmt(Math.max(0, totalGudang)) : "—"}
                    </td>
                  </tr>
                );
              })}
            {!loading && tampil.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                  Tidak ada kode plant yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalHalaman > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
          <span>
            Halaman {halamanAman} dari {totalHalaman}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHalaman((h) => Math.max(1, h - 1))}
              disabled={halamanAman <= 1}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
              disabled={halamanAman >= totalHalaman}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
