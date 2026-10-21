export const PROVINSI_ALIAS: Record<string, string> = {
  "di yogyakarta": "daerah istimewa yogyakarta",
  "dki jakarta": "daerah khusus ibukota jakarta",
  "di. aceh": "aceh",
  "bangka belitung": "kep. bangka belitung",
  "kepulauan bangka belitung": "kep. bangka belitung",
  "kepulauan riau": "kep. riau",
  "nusatenggara barat": "nusa tenggara barat",
  "irian jaya barat": "papua barat",
  "irian jaya tengah": "papua tengah",
  "irian jaya timur": "papua",
  "probanten": "banten",
};

export const normalizeProvince = (name: string) => {
  const base = name.trim().toLowerCase().replace(/\s+/g, " ");
  return PROVINSI_ALIAS[base] || base;
};
