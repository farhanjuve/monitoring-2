"use client";

import { Bell, Menu, UserCircle } from "lucide-react";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 shadow-sm sm:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="shrink-0 rounded-md p-2 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-blue md:hidden"
          aria-label="Buka menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <input
          type="text"
          placeholder="Cari gudang..."
          className="w-full max-w-xs min-w-0 rounded-md border-transparent bg-gray-100 px-4 py-2 outline-none transition-colors focus:border-pupuk-blue focus:bg-white focus:ring-2 focus:ring-pupuk-blue/20"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2 text-gray-600 sm:gap-4">
        <button className="relative rounded-full p-2 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pupuk-blue">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full border border-white bg-red-500" />
        </button>
        <div className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-gray-200 hover:bg-gray-50 sm:px-3">
          <UserCircle className="h-6 w-6 text-pupuk-darkBlue" />
          <span className="hidden text-sm font-medium sm:inline">Admin Pusat</span>
        </div>
      </div>
    </header>
  );
}
