"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfile {
  role: string;
  full_name: string;
  restaurant_name: string;
  email: string;
}

const roleLabels: Record<string, string> = {
  corporate: "Corporate",
  manager: "Manager",
  supervisor: "Supervisor",
  staff: "Staff",
  designer: "Designer",
};

const roleColors: Record<string, string> = {
  corporate: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  supervisor: "bg-orange-100 text-orange-700",
  staff: "bg-green-100 text-green-700",
  designer: "bg-pink-100 text-pink-700",
};

const navItems = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: "📊",
    roles: ["corporate", "manager", "supervisor", "staff", "designer"],
  },
  {
    label: "Documents",
    href: "/admin/documents",
    icon: "📄",
    roles: ["corporate", "manager"],
  },
  {
    label: "Staff Licenses",
    href: "/admin/staff-licenses",
    icon: "🪪",
    roles: ["corporate", "manager", "supervisor"],
  },
  {
    label: "Marketing",
    href: "/admin/marketing",
    icon: "📣",
    roles: ["corporate", "manager", "designer"],
  },
  {
    label: "In-House Inspection",
    href: "/admin/inspections",
    icon: "🔍",
    roles: ["corporate", "manager", "supervisor"],
  },
  {
    label: "Corporate Inspection",
    href: "/admin/inspections/corporate",
    icon: "🏢",
    roles: ["corporate", "manager"],
  },
  {
    label: "Print Manuals",
    href: "/admin/manuals",
    icon: "📑",
    roles: ["corporate", "manager"],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // For demo, use default role - in production fetch from Supabase
    setProfile({
      role: "corporate",
      full_name: user?.email?.split("@")[0] || "Admin",
      restaurant_name: "Between the Buns",
      email: user?.email || "admin@btb.com",
    });
  }, [user]);

  const allowedNav = profile
    ? navItems.filter((item) => item.roles.includes(profile.role))
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="font-bold text-gray-900">Admin Panel</h1>
          </div>
          {profile && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${roleColors[profile.role]}`}>
              {roleLabels[profile.role]}
            </span>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="px-6 py-5 border-b border-gray-200">
              <Link href="/admin" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">BTB</span>
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Admin Panel</h2>
                  {profile && (
                    <p className="text-[10px] text-gray-500">{roleLabels[profile.role]}</p>
                  )}
                </div>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {allowedNav.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-red-50 text-red-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Profile */}
            {profile && (
              <div className="px-4 py-4 border-t border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-600">
                      {profile.full_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {profile.full_name}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {profile.restaurant_name}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64">
          <div className="hidden lg:block bg-white border-b border-gray-200 sticky top-0 z-20">
            <div className="flex items-center justify-between px-6 py-4">
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
              {profile && (
                <span className={`text-xs px-3 py-1 rounded-full font-bold ${roleColors[profile.role]}`}>
                  {roleLabels[profile.role]}
                </span>
              )}
            </div>
          </div>
          <div className="p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
