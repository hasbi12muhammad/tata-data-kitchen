"use client";

import Image from "next/image";
import TdLogo from "../../../public/td-logo.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  BarChart3,
  BookOpen,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ALL_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/items", label: "Raw Materials", icon: Package },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/recipes", label: "Products", icon: BookOpen },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const nav = ALL_NAV;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Sidebar panel — Casa brown */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full w-64 flex flex-col",
          "bg-[#7C563D]",
          "transition-transform duration-200 ease-in-out",
          "lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Image
              src={TdLogo}
              alt="TD"
              width={28}
              height={28}
              className="rounded-lg object-contain bg-[#A05035] p-0.5"
            />
            <span className="text-[#E9DFC6] font-bold text-lg tracking-tight">
              My Kitchen Book
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded text-[#E9DFC6]/60 hover:text-[#E9DFC6] cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-[#E9DFC6]/20 text-[#E9DFC6]"
                    : "text-[#E9DFC6]/65 hover:bg-[#E9DFC6]/10 hover:text-[#E9DFC6]",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#E9DFC6]/65 hover:bg-[#E9DFC6]/10 hover:text-[#E9DFC6] transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
