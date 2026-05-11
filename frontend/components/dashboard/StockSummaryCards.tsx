import { Box, PackageOpen, Truck, Warehouse, ClipboardCheck } from "lucide-react";

export function StockSummaryCards() {
  const summaries = [
    { title: "Stok Fisik (Urea & NPK)", value: "1,250.00", unit: "Ton", icon: Box, color: "bg-blue-500" },
    { title: "Outstanding SO", value: "320.50", unit: "Ton", icon: PackageOpen, color: "bg-orange-500" },
    { title: "Admin Tanpa Intransit", value: "929.50", unit: "Ton", icon: Warehouse, color: "bg-pupuk-darkGreen" },
    { title: "Intransit", value: "150.00", unit: "Ton", icon: Truck, color: "bg-pupuk-turquoise" },
    { title: "Stok Admin", value: "1,079.50", unit: "Ton", icon: ClipboardCheck, color: "bg-pupuk-darkBlue" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {summaries.map((item, idx) => (
        <div key={idx} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className={`${item.color} p-3 rounded-full text-white`}>
            <item.icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{item.title}</p>
            <p className="text-2xl font-bold text-gray-800">
              {item.value} <span className="text-sm text-gray-400 font-normal">{item.unit}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
