import { Bell, UserCircle } from "lucide-react";

export function Header() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
      <div className="flex items-center space-x-4">
        {/* Global Search can go here later */}
        <input 
          type="text" 
          placeholder="Cari gudang..." 
          className="px-4 py-2 bg-gray-100 rounded-md border-transparent focus:bg-white focus:border-pupuk-blue focus:ring-2 focus:ring-pupuk-blue/20 outline-none w-64 transition-all"
        />
      </div>
      <div className="flex items-center space-x-4 text-gray-600">
        <button className="p-2 rounded-full hover:bg-gray-100 transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
        </button>
        <div className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 px-3 py-1.5 rounded-md transition-colors border border-transparent hover:border-gray-200">
          <UserCircle className="w-6 h-6 text-pupuk-darkBlue" />
          <span className="text-sm font-medium">Admin Pusat</span>
        </div>
      </div>
    </header>
  );
}
