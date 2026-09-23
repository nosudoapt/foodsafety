"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  IdCard,
  Megaphone,
  ClipboardCheck,
  Building2,
  Printer,
  ListChecks,
  KeyRound,
  BookOpenCheck,
  Files,
  Rocket,
  ScrollText,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import ExpiryNotifications from "@/components/ExpiryNotifications";

type Role =
  | "corporate"
  | "manager"
  | "supervisor"
  | "staff"
  | "designer"
  | "owner"
  | "multi_location_owner";

const roleLabels: Record<string, string> = {
  corporate: "Corporate",
  manager: "Manager",
  supervisor: "Supervisor",
  staff: "Staff",
  designer: "Designer",
  owner: "Owner",
  multi_location_owner: "Multi-location Owner",
};

const roleBadge: Record<string, string> = {
  corporate: "bg-violet-50 text-violet-700 ring-violet-200",
  manager: "bg-blue-50 text-blue-700 ring-blue-200",
  supervisor: "bg-amber-50 text-amber-700 ring-amber-200",
  staff: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  designer: "bg-pink-50 text-pink-700 ring-pink-200",
  owner: "bg-red-50 text-red-700 ring-red-200",
  multi_location_owner: "bg-orange-50 text-orange-700 ring-orange-200",
};

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  roles: Role[];
}

const allRoles: Role[] = [
  "corporate",
  "manager",
  "supervisor",
  "staff",
  "designer",
  "owner",
  "multi_location_owner",
];

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: allRoles,
  },
  {
    label: "Documents",
    href: "/admin/documents",
    icon: <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "owner", "multi_location_owner"],
  },
  {
    label: "Staff Licenses",
    href: "/admin/staff-licenses",
    icon: <IdCard className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "supervisor", "owner", "multi_location_owner"],
  },
  {
    label: "Marketing",
    href: "/admin/marketing",
    icon: <Megaphone className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "designer", "owner", "multi_location_owner"],
  },
  {
    label: "In-House Inspection",
    href: "/admin/inspections",
    icon: <ClipboardCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "supervisor", "owner", "multi_location_owner"],
  },
  {
    label: "Corporate Inspection",
    href: "/admin/inspections/corporate",
    icon: <Building2 className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "owner", "multi_location_owner"],
  },
  {
    label: "Emergency Contacts",
    href: "/admin/emergency-contacts",
    icon: <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: allRoles,
  },
  {
    label: "Outage Steps",
    href: "/admin/steps",
    icon: <ListChecks className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: allRoles,
  },
  {
    label: "Login Vault",
    href: "/admin/vault",
    icon: <KeyRound className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "owner", "multi_location_owner"],
  },
  {
    label: "Employee Handbook",
    href: "/admin/handbook",
    icon: <BookOpenCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "owner", "multi_location_owner", "staff", "supervisor"],
  },
  {
    label: "Print Materials",
    href: "/admin/print-materials",
    icon: <Files className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "owner", "multi_location_owner"],
  },
  {
    label: "New Restaurant",
    href: "/admin/new-restaurant",
    icon: <Rocket className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "owner", "multi_location_owner"],
  },
  {
    label: "Procedure Cheat Sheet",
    href: "/admin/procedures",
    icon: <ScrollText className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: allRoles,
  },
  {
    label: "Print Manuals",
    href: "/admin/manuals",
    icon: <Printer className="h-[18px] w-[18px]" strokeWidth={1.75} />,
    roles: ["corporate", "manager", "owner", "multi_location_owner"],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{
    role: string;
    full_name: string;
    restaurant_name: string;
    email: string;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        if (!cancelled) {
          setProfile({
            role: "corporate",
            full_name: "Admin",
            restaurant_name: "Between the Buns",
            email: "admin@btb.com",
          });
        }
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role, full_name, restaurant_name, email")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      if (data) {
        setProfile({
          role: data.role || "staff",
          full_name: data.full_name || user.email?.split("@")[0] || "Admin",
          restaurant_name: data.restaurant_name || "Between the Buns",
          email: data.email || user.email || "",
        });
      } else {
        setProfile({
          role: "corporate",
          full_name: user.email?.split("@")[0] || "Admin",
          restaurant_name: "Between the Buns",
          email: user.email || "",
        });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const role = profile?.role ?? "corporate";
  const allowedNav = navItems.filter((item) => item.roles.includes(role as Role));
  const badge = roleBadge[role] || roleBadge.staff;

  return (
    <div className="min-h-screen bg-[#F7F7F8]">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            type="button"
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            onClick={() => setSidebarOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-600 text-[10px] font-bold text-white">
              BTB
            </div>
            <span className="truncate text-sm font-semibold text-gray-900">Admin Panel</span>
          </div>
          <ExpiryNotifications />
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[264px] bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ease-out lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="px-5 py-5 border-b border-gray-100">
            <Link
              href="/admin"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-[11px] font-bold text-white shadow-sm shadow-red-600/20">
                BTB
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
                  Admin Panel
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {profile?.restaurant_name || "Between the Buns"}
                </p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            {allowedNav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-red-50 text-red-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className={active ? "text-red-600" : "text-gray-400"}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-gray-100 px-4 py-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
              {(profile?.full_name || "A").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-gray-900">
                {profile?.full_name || "Admin"}
              </p>
              <span
                className={`mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${badge}`}
              >
                {roleLabels[role] || role}
              </span>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main */}
        <main className="flex-1 min-w-0 lg:ml-[264px]">
          <div className="hidden lg:flex sticky top-0 z-30 items-center justify-between border-b border-gray-200 bg-white/85 backdrop-blur px-6 h-14">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-[15px] font-semibold text-gray-900">Admin Dashboard</h1>
              <span
                className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badge}`}
              >
                {roleLabels[role] || role}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-100"
              >
                Back to app
              </Link>
              <ExpiryNotifications />
            </div>
          </div>
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
