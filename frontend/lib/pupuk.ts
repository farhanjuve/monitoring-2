/**
 * Grup pupuk yang dipakai di seluruh tampilan.
 *
 * Nilai `tipe_pupuk` dari API sudah berupa grup ini (dikelompokkan di backend
 * memakai master material), jadi frontend cukup mencocokkan namanya.
 */

export const GRUP_CAIR = "Organik Cair";
export const GRUP_NON_SUBSIDI = "Non Subsidi";

/** Grup bersubsidi (urut sesuai kolom laporan). */
export const GRUP_SUBSIDI = [
  "Urea",
  "NPK",
  "NPK Kakao",
  "ZA",
  "SP-36",
  "Organik",
  GRUP_CAIR,
] as const;

export const GRUP_SEMUA = [...GRUP_SUBSIDI, GRUP_NON_SUBSIDI];

/** Pilihan filter: default hanya subsidi, non subsidi digabung jadi satu. */
export const OPSI_SUBSIDI = "Semua (Subsidi)";
export const OPSI_FILTER = [OPSI_SUBSIDI, ...GRUP_SEMUA];

/** Satuan angka tiap grup. Hanya pupuk cair yang memakai liter. */
export function satuanGrup(grup: string | null | undefined): "Ton" | "L" {
  return grup === GRUP_CAIR ? "L" : "Ton";
}

/**
 * Apakah baris ikut ditampilkan untuk pilihan filter tertentu.
 *
 * `OPSI_SUBSIDI` sengaja tidak memasukkan pupuk cair: satuannya liter dan
 * tidak boleh dijumlahkan dengan ton pada ringkasan.
 */
export function cocokFilter(tipePupuk: string, grupBaris: string): boolean {
  if (tipePupuk === OPSI_SUBSIDI) {
    return grupBaris !== GRUP_NON_SUBSIDI && grupBaris !== GRUP_CAIR;
  }
  if (tipePupuk === "Semua") {
    return grupBaris !== GRUP_CAIR;
  }
  return grupBaris === tipePupuk;
}

/** Label satuan untuk pilihan filter aktif. */
export function satuanUntukFilter(tipePupuk: string): "Ton" | "L" {
  return tipePupuk === GRUP_CAIR ? "L" : "Ton";
}
