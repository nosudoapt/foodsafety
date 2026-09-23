"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Thermometer,
  ClipboardCheck,
  Sparkles,
  AlertTriangle,
  Package,
  Wrench,
  Bug,
  GraduationCap,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Temperatures", href: "/temperatures", icon: Thermometer },
  { name: "Daily Checks", href: "/checks", icon: ClipboardCheck },
  { name: "Cleaning", href: "/cleaning", icon: Sparkles },
  { name: "Allergens", href: "/allergens", icon: AlertTriangle },
  { name: "Deliveries", href: "/deliveries", icon: Package },
  { name: "Corrective Actions", href: "/corrective-actions", icon: Wrench },
  { name: "Pest Control", href: "/pest-control", icon: Bug },
  { name: "Training", href: "/training", icon: GraduationCap },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur border-b border-gray-200 flex items-center px-4 z-50">
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900">FoodSafe</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-200 ease-out lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-14 flex items-center px-5 border-b border-gray-100">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shadow-sm shadow-green-600/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="ml-2.5 font-bold text-gray-900 text-[15px]">FoodSafe</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-2.5" aria-label="Main">
            <div className="space-y-0.5">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "bg-green-50 text-green-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <Icon
                      className={`h-[18px] w-[18px] ${isActive ? "text-green-600" : "text-gray-400"}`}
                      strokeWidth={1.75}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User section */}
          <div className="p-3 border-t border-gray-100">
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/");
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer"
            >
              <LogOut className="h-[18px] w-[18px] text-gray-400" strokeWidth={1.75} />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
