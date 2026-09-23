"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  FileText,
  SearchCheck,
  Megaphone,
  IdCard,
  Printer,
  ClipboardCheck,
  ShieldCheck,
  Bell,
  Home,
  Upload,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, Card, Badge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/admin-store";

interface Stat {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent: string;
  href?: string;
}

interface ActivityItem {
  id: string;
  action: string;
  detail: string;
  time: string;
  icon: LucideIcon;
}

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

const quickActions: QuickAction[] = [
  { label: "Upload Document", href: "/admin/documents", icon: Upload },
  { label: "Staff License", href: "/admin/staff-licenses", icon: IdCard },
  { label: "Inspection", href: "/admin/inspections", icon: SearchCheck },
  { label: "Promotion", href: "/admin/marketing", icon: Megaphone },
  { label: "Print Manual", href: "/admin/manuals", icon: Printer },
  { label: "Open App", href: "/dashboard", icon: Home },
];

const roleAccess = [
  { role: "Corporate", tone: "purple" as const, copy: "Full access. All stores, documents, inspections, staff, settings." },
  { role: "Manager", tone: "blue" as const, copy: "Store-level access. Documents, inspections, staff, promotions." },
  { role: "Supervisor", tone: "amber" as const, copy: "Submit in-house inspections and view staff licenses." },
  { role: "Staff", tone: "green" as const, copy: "Upload own health licenses. View schedules and checks." },
  { role: "Designer", tone: "red" as const, copy: "Upload marketing materials, posters, promos." },
];

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function fetchDashboardData(): Promise<{
  stats: Stat[];
  activity: ActivityItem[];
}> {
  const empty: Stat[] = [
    { label: "Staff licenses", value: 0, icon: IdCard, accent: "text-blue-600 bg-blue-50", href: "/admin/staff-licenses" },
    { label: "Documents", value: 0, icon: FileText, accent: "text-emerald-600 bg-emerald-50", href: "/admin/documents" },
    { label: "Inspections", value: 0, icon: SearchCheck, accent: "text-orange-600 bg-orange-50", href: "/admin/inspections" },
    { label: "Promotions", value: 0, icon: Megaphone, accent: "text-violet-600 bg-violet-50", href: "/admin/marketing" },
  ];

  const user = await getSessionUser();
  if (!user) {
    return { stats: empty, activity: [] };
  }

  const [docs, corps, inhouses, licenses, promos, manuals, sigs] = await Promise.all([
    supabase.from("documents").select("id, title, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("corporate_inspections").select("id, inspection_date, rating, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("inhouse_inspections").select("id, inspection_date, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("staff_licenses").select("id, staff_name, expiry_date, created_at").eq("user_id", user.id),
    supabase.from("marketing_promotions").select("id, title, status, created_at").eq("user_id", user.id),
    supabase.from("print_manuals").select("id, title, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("handbook_signatures").select("id, staff_name, signed_at").order("signed_at", { ascending: false }).limit(3),
  ]);

  const stats: Stat[] = [
    {
      label: "Staff licenses",
      value: licenses.data?.length ?? 0,
      icon: IdCard,
      accent: "text-blue-600 bg-blue-50",
      href: "/admin/staff-licenses",
    },
    {
      label: "Documents",
      value: docs.data?.length ?? 0,
      icon: FileText,
      accent: "text-emerald-600 bg-emerald-50",
      href: "/admin/documents",
    },
    {
      label: "Inspections",
      value: (corps.data?.length ?? 0) + (inhouses.data?.length ?? 0),
      icon: SearchCheck,
      accent: "text-orange-600 bg-orange-50",
      href: "/admin/inspections",
    },
    {
      label: "Promotions",
      value: promos.data?.length ?? 0,
      icon: Megaphone,
      accent: "text-violet-600 bg-violet-50",
      href: "/admin/marketing",
    },
  ];

  const activity: ActivityItem[] = [];

  for (const d of docs.data ?? []) {
    activity.push({
      id: `doc-${d.id}`,
      action: `Document uploaded: ${d.title || "Untitled"}`,
      detail: "Documents",
      time: String(d.created_at || ""),
      icon: FileText,
    });
  }
  for (const c of corps.data ?? []) {
    activity.push({
      id: `corp-${c.id}`,
      action: `Corporate inspection filed (${c.rating || "n/a"})`,
      detail: c.inspection_date || "",
      time: String(c.created_at || ""),
      icon: ShieldCheck,
    });
  }
  for (const i of inhouses.data ?? []) {
    activity.push({
      id: `in-${i.id}`,
      action: "In-house inspection completed",
      detail: i.inspection_date || "",
      time: String(i.created_at || ""),
      icon: ClipboardCheck,
    });
  }
  for (const l of licenses.data ?? []) {
    activity.push({
      id: `lic-${l.id}`,
      action: `License on file: ${l.staff_name || "Staff"}`,
      detail: l.expiry_date || "",
      time: String(l.created_at || ""),
      icon: IdCard,
    });
  }
  for (const m of manuals.data ?? []) {
    activity.push({
      id: `man-${m.id}`,
      action: `Manual added: ${m.title || "Untitled"}`,
      detail: "Print manuals",
      time: String(m.created_at || ""),
      icon: Printer,
    });
  }
  for (const s of sigs.data ?? []) {
    activity.push({
      id: `sig-${s.id}`,
      action: `Handbook signed: ${s.staff_name || "Staff"}`,
      detail: "Handbook",
      time: String(s.signed_at || ""),
      icon: Users,
    });
  }

  activity.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  return { stats, activity: activity.slice(0, 8) };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const data = await fetchDashboardData();
        if (cancelled) return;
        setStats(data.stats);
        setActivity(data.activity);
        setLoading(false);
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin dashboard"
        description="Live counts and recent activity from your restaurant workspace."
        actions={
          <Badge tone="gray">
            <Building2 className="mr-1 h-3 w-3" />
            Between the Buns
          </Badge>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse h-[88px]">
                <div className="h-full w-full rounded-lg bg-gray-50" />
              </Card>
            ))
          : stats.map((stat) => {
              const Icon = stat.icon;
              const inner = (
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ${stat.accent}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </div>
                </div>
              );
              if (stat.href) {
                return (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  {inner}
                </div>
              );
            })}
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:border-red-200 hover:shadow-md transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-600 mx-auto mb-2 group-hover:bg-red-50 group-hover:text-red-600 group-hover:border-red-100 transition-colors">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium text-gray-900 group-hover:text-red-600 transition-colors">
                  {action.label}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Recent activity</h3>
            <Bell className="h-4 w-4 text-gray-400" />
          </div>
          <div className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-4 py-4 animate-pulse">
                  <div className="h-3 w-2/3 bg-gray-100 rounded" />
                </div>
              ))
            ) : activity.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <ClipboardCheck className="mx-auto h-8 w-8 text-gray-300 mb-2" strokeWidth={1.5} />
                <p className="text-sm text-gray-500">No activity yet — upload a document or file an inspection.</p>
              </div>
            ) : (
              activity.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{item.action}</p>
                      <p className="text-[11px] text-gray-500">
                        {item.detail}
                        {item.detail && " · "}
                        {timeAgo(item.time)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-gray-900 mb-3">Role access levels</h3>
          <div className="space-y-3">
            {roleAccess.map((r) => (
              <div key={r.role} className="flex items-start gap-3">
                <Badge tone={r.tone}>{r.role}</Badge>
                <p className="text-xs text-gray-600 leading-relaxed">{r.copy}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
