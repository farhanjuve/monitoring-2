"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, History, Truck, Presentation, Warehouse, Radar, Map as MapIcon, X } from "lucide-react";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const menus = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/" },
    { name: "Intransit", icon: Truck, href: "/intransit" },
    { name: "Upload Data SAP", icon: Upload, href: "/upload" },
    { name: "Data Gudang", icon: Warehouse, href: "/data-gudang" },
    { name: "INDIGO Tracker", icon: Radar, href: "/indigo" },
    { name: "Peta Manual", icon: MapIcon, href: "/peta-38" },
    { name: "Log Aktivitas", icon: History, href: "/logs" },
    { name: "Generator Slide", icon: Presentation, href: "/slides" },
  ];

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-pupuk-darkBlue text-white shadow-lg transition-transform duration-200 ease-out md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-6">
          <h2 className="text-2xl font-bold text-pupuk-turquoise">Pupuk Monitor</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-turquoise md:hidden"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-2 p-4">
          {menus.map((menu) => {
            const active =
              menu.href === "/" ? pathname === "/" : pathname.startsWith(menu.href);
            return (
              <Link
                key={menu.name}
                href={menu.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`flex items-center space-x-3 rounded-md px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-turquoise ${
                  active
                    ? "bg-pupuk-darkGreen text-pupuk-turquoise"
                    : "hover:bg-pupuk-darkGreen hover:text-pupuk-turquoise"
                }`}
              >
                <menu.icon className="h-5 w-5" />
                <span>{menu.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4 text-center text-xs text-white/50">
          &copy; 2026 Pupuk Monitor
        </div>
      </aside>
    </>
  );
}
