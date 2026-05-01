"use client";

import { Sidebar } from "./Sidebar";
import { Menu, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}

export function AppLayout({ children, title, action }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-[#F2EBD9] overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-[#FBF8F2] border-b border-[#D9CCAF] flex items-center gap-4 px-4 sm:px-6 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-[#7C6352] hover:bg-[#E9DFC6] cursor-pointer"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[#2C1810] flex-1 truncate">
            {title}
          </h1>
          {action && <div className="flex-shrink-0">{action}</div>}
          <Link
            href="/settings"
            className="p-2 rounded-lg text-[#7C6352] hover:bg-[#E9DFC6] transition-colors"
            aria-label="Account settings"
          >
            <Settings className="w-5 h-5" />
          </Link>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
