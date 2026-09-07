export interface Warehouse {
  id: number;
  nama_gudang: string;
  kota: string;
  kode_kab: number;
  provinsi: string;
  is_active: boolean;
  kode_plants: string[];
  created_at: string | null;
}
