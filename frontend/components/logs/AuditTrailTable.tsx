import { Search } from "lucide-react";

export function AuditTrailTable() {
  const dummyLogs = [
    { user: "Admin Pusat", action: "Upload MB52 & ZSD_SODO", detail: "Gudang A, Gudang B", date: "2026-05-08 09:15:00" },
    { user: "Admin Gudang A", action: "Upload Foto CCTV", detail: "2 Foto ditambahkan", date: "2026-05-08 08:30:00" },
    { user: "Sistem", action: "Kalkulasi Stok", detail: "Update stok 15 Gudang sukses", date: "2026-05-08 09:16:00" },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 className="font-semibold text-gray-800">Riwayat Aktivitas Sistem</h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari log..." 
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise w-64"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100">
            <tr>
              <th className="px-6 py-3">Waktu</th>
              <th className="px-6 py-3">Pengguna</th>
              <th className="px-6 py-3">Aksi</th>
              <th className="px-6 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {dummyLogs.map((log, idx) => (
              <tr key={idx} className="bg-white border-b hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-gray-600">{log.date}</td>
                <td className="px-6 py-4 font-medium text-gray-900">{log.user}</td>
                <td className="px-6 py-4">
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium border border-gray-200">
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600">{log.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
        <span>Menampilkan 1-3 dari 120 log</span>
        <div className="flex space-x-2">
          <button className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Sebelumnya</button>
          <button className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50">Selanjutnya</button>
        </div>
      </div>
    </div>
  );
}
