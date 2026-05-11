export function StockTable() {
  const dummyData = [
    { gudang: "Gudang A - Jakarta", fisik: 500, so: 100, adminTanpa: 400, intransit: 50, admin: 450, jenis: "Urea" },
    { gudang: "Gudang B - Surabaya", fisik: 750, so: 220.5, adminTanpa: 529.5, intransit: 100, admin: 629.5, jenis: "NPK" },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Detail Stok Per Gudang</h3>
        <select className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pupuk-turquoise">
          <option>Semua Pupuk</option>
          <option>Urea</option>
          <option>NPK</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-6 py-3">Nama Gudang</th>
              <th className="px-6 py-3">Jenis</th>
              <th className="px-6 py-3 text-right">Fisik (Ton)</th>
              <th className="px-6 py-3 text-right">Out. SO (Ton)</th>
              <th className="px-6 py-3 text-right">Admin (T. Intransit)</th>
              <th className="px-6 py-3 text-right">Intransit (Ton)</th>
              <th className="px-6 py-3 text-right text-pupuk-darkBlue">Admin (Ton)</th>
            </tr>
          </thead>
          <tbody>
            {dummyData.map((row, idx) => (
              <tr key={idx} className="bg-white border-b hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">{row.gudang}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.jenis === 'Urea' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                    {row.jenis}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">{row.fisik}</td>
                <td className="px-6 py-4 text-right">{row.so}</td>
                <td className="px-6 py-4 text-right">{row.adminTanpa}</td>
                <td className="px-6 py-4 text-right">{row.intransit}</td>
                <td className="px-6 py-4 text-right font-bold text-pupuk-darkBlue">{row.admin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
