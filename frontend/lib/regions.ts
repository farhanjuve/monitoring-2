export const REGION_LABELS: Record<string, string> = {
  "R1": "Regional 1 — Sumatera",
  "R2": "Regional 2 — Jawa",
  "R3": "Regional 3 — Kalimantan",
  "R4": "Regional 4 — Sulawesi",
  "R5": "Regional 5 — Bali & Nusa Tenggara",
  "R6": "Regional 6 — Papua & Maluku",
};

/** Pembagian wilayah Pupuk Indonesia (6 regional) berdasarkan nama provinsi. */
export const PROVINSI_TO_REGIONAL: Record<string, string> = {
  // Regional 1 — Sumatera
  Aceh: "R1",
  "Sumatera Utara": "R1",
  "Sumatera Barat": "R1",
  Riau: "R1",
  Jambi: "R1",
  "Sumatera Selatan": "R1",
  Bengkulu: "R1",
  Lampung: "R1",
  "Kepulauan Bangka Belitung": "R1",
  "Kepulauan Riau": "R1",
  // Regional 2 — Jawa
  "Jawa Barat": "R2",
  "Jawa Tengah": "R2",
  "Jawa Timur": "R2",
  Banten: "R2",
  "DKI Jakarta": "R2",
  "Daerah Istimewa Yogyakarta": "R2",
  // Regional 3 — Kalimantan
  "Kalimantan Barat": "R3",
  "Kalimantan Tengah": "R3",
  "Kalimantan Selatan": "R3",
  "Kalimantan Timur": "R3",
  "Kalimantan Utara": "R3",
  // Regional 4 — Sulawesi
  "Sulawesi Utara": "R4",
  "Sulawesi Tengah": "R4",
  "Sulawesi Selatan": "R4",
  "Sulawesi Tenggara": "R4",
  Gorontalo: "R4",
  "Sulawesi Barat": "R4",
  // Regional 5 — Bali & Nusa Tenggara
  Bali: "R5",
  "Nusa Tenggara Barat": "R5",
  "Nusa Tenggara Timur": "R5",
  // Regional 6 — Papua & Maluku
  Maluku: "R6",
  "Maluku Utara": "R6",
  Papua: "R6",
  "Papua Barat": "R6",
  "Papua Selatan": "R6",
  "Papua Tengah": "R6",
  "Papua Pegunungan": "R6",
  "Papua Barat Daya": "R6",
};

export const getRegionalCode = (provinsi: string) => PROVINSI_TO_REGIONAL[provinsi] ?? "";

export const getRegionalLabel = (provinsi: string) => {
  const code = getRegionalCode(provinsi);
  return code ? REGION_LABELS[code] : "Tidak ada regional";
};
