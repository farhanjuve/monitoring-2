import Link from "next/link";
import { LayoutDashboard, Upload, Camera, History } from "lucide-react";

export function Sidebar() {
  const menus = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/" },
    { name: "Upload Data SAP", icon: Upload, href: "/upload" },
    { name: "Galeri CCTV", icon: Camera, href: "/cctv" },
    { name: "Log Aktivitas", icon: History, href: "/logs" },
  ];

  return (
    <aside className="w-64 bg-pupuk-darkBlue text-white min-h-screen flex flex-col shadow-lg">
      <div className="p-6 border-b border-white/10">
        <h2 className="text-2xl font-bold text-pupuk-turquoise">Pupuk Monitor</h2>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menus.map((menu) => (
          <Link
            key={menu.name}
            href={menu.href}
            className="flex items-center space-x-3 px-4 py-3 rounded-md hover:bg-pupuk-darkGreen hover:text-pupuk-turquoise transition-colors"
          >
            <menu.icon className="w-5 h-5" />
            <span>{menu.name}</span>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10 text-xs text-white/50 text-center">
        &copy; 2026 Pupuk Monitor
      </div>
    </aside>
  );
}
