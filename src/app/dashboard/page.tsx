"use client";

import { useEffect, useState } from "react";
import {
  Thermometer, ClipboardCheck, Sparkles, AlertTriangle, Package, Wrench, Bug,
  GraduationCap, FileBarChart, ShieldCheck, ListChecks, FileText, KeyRound,
  MapPin, Eye, BadgeCheck, Megaphone, CalendarDays, Images,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, StatTile, NavCard, type Accent } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { DEFAULT_ROLE, isRole, roleLabel, ROLE_COLORS, type Role } from "@/lib/roles";

// The dashboard is deliberately role-conditional: each RBAC role lands on a
// different headline, different stat tiles and a different set of cards, so a
// viewer can feel the difference between jobs instead of just having nav items
// hidden. Role membership still comes from roles.ts (single source of truth),
// and server-side gating in src/proxy.ts is untouched — this is presentation
// only.

type ViewKey = "owner" | "manager" | "staff" | "rollup" | "mlo" | "designer";

// Every role in roles.ts maps to exactly one view. Each of the six roles lands
// on a genuinely different surface (see src/lib/permissions.ts for the full
// feature × role matrix these views visualise):
//   owner                → full single-site control incl. vault + new restaurant
//   multi_location_owner → owner-grade control PLUS a group rollup
//   corporate            → read-only group rollup, edits only inspections/marketing
//   manager              → single-site operations, no vault / legal / billing
//   designer             → marketing only, no operational data
//   staff                → just today's shift
const VIEW_FOR_ROLE: Record<Role, ViewKey> = {
  owner: "owner",
  multi_location_owner: "mlo",
  corporate: "rollup",
  manager: "manager",
  designer: "designer",
  staff: "staff",
};

interface StatSpec {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: Accent;
}

interface CardSpec {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  accent: Accent;
}

interface DashboardView {
  title: string;
  subtitle: string;
  note?: string;
  stats: StatSpec[];
  operations: CardSpec[];
  admin?: { heading: string; cards: CardSpec[] };
}

const OPERATIONS: CardSpec[] = [
  { href: "/temperatures", title: "Temperature Monitoring", desc: "Record cooking, cooling, cold storage and hot holding temperatures.", icon: Thermometer, accent: "red" },
  { href: "/checks", title: "Daily Kitchen Checks", desc: "Complete opening and closing checklists every shift.", icon: ClipboardCheck, accent: "green" },
  { href: "/cleaning", title: "Cleaning & Hygiene", desc: "Manage cleaning schedules and track completion.", icon: Sparkles, accent: "blue" },
  { href: "/allergens", title: "Allergen Management", desc: "Track 14 allergens across your menu items.", icon: AlertTriangle, accent: "amber" },
  { href: "/deliveries", title: "Delivery Checks", desc: "Record incoming deliveries and supplier temperatures.", icon: Package, accent: "purple" },
  { href: "/corrective-actions", title: "Corrective Actions", desc: "Log issues, fixes and follow-up actions.", icon: Wrench, accent: "amber" },
  { href: "/pest-control", title: "Pest Control", desc: "Maintain pest control register and inspection records.", icon: Bug, accent: "slate" },
  { href: "/training", title: "Training Records", desc: "Track staff training and certifications.", icon: GraduationCap, accent: "teal" },
  { href: "/reports", title: "Reports & PDF Export", desc: "Export clean digital records instantly.", icon: FileBarChart, accent: "teal" },
];

const VIEWS: Record<ViewKey, DashboardView> = {
  owner: {
    title: "Owner Dashboard",
    subtitle: "Everything across the business — compliance, people and records",
    stats: [
      { label: "Locations", value: "3", icon: MapPin, accent: "green" },
      { label: "Expiring Documents", value: "4", icon: FileText, accent: "amber" },
      { label: "Temperature Alerts", value: "2", icon: Thermometer, accent: "red" },
      { label: "Open Actions", value: "3", icon: Wrench, accent: "blue" },
    ],
    operations: OPERATIONS,
    admin: {
      heading: "Administration",
      cards: [
        { href: "/admin/compliance", title: "Compliance & Renewals", desc: "Renewal dates and compliance status for every site.", icon: ShieldCheck, accent: "green" },
        { href: "/admin/staff-licenses", title: "Staff Licences", desc: "Food handler, first aid and certification expiry tracking.", icon: ListChecks, accent: "blue" },
        { href: "/admin/documents", title: "Documents", desc: "Licences, insurance and inspection paperwork in one place.", icon: FileText, accent: "purple" },
        { href: "/admin/inspections", title: "In-House Inspection", desc: "Run and score your own inspections.", icon: Eye, accent: "teal" },
        { href: "/admin/vault", title: "Login Vault", desc: "Encrypted credentials for the systems you use.", icon: KeyRound, accent: "amber" },
        { href: "/admin/new-restaurant", title: "New Restaurant", desc: "Onboard another location with a checklist.", icon: MapPin, accent: "slate" },
      ],
    },
  },
  manager: {
    title: "Manager Dashboard",
    subtitle: "Today's kitchen operations and the records behind them",
    stats: [
      { label: "Today's Checks", value: "8/10", icon: ClipboardCheck, accent: "green" },
      { label: "Temperature Alerts", value: "2", icon: Thermometer, accent: "red" },
      { label: "Cleaning Tasks", value: "5", icon: Sparkles, accent: "blue" },
      { label: "Open Actions", value: "3", icon: Wrench, accent: "amber" },
    ],
    operations: OPERATIONS,
    admin: {
      heading: "Operations Admin",
      cards: [
        { href: "/admin/compliance", title: "Compliance & Renewals", desc: "Renewal dates and compliance status for your site.", icon: ShieldCheck, accent: "green" },
        { href: "/admin/staff-licenses", title: "Staff Licences", desc: "Food handler, first aid and certification expiry tracking.", icon: ListChecks, accent: "blue" },
        { href: "/admin/documents", title: "Documents", desc: "Licences, insurance and inspection paperwork.", icon: FileText, accent: "purple" },
        { href: "/admin/inspections", title: "In-House Inspection", desc: "Run and score your own inspections.", icon: Eye, accent: "teal" },
      ],
    },
  },
  staff: {
    title: "Your Shift",
    subtitle: "Log what you do as you do it — the rest is handled for you",
    stats: [
      { label: "Today's Checks", value: "2/3", icon: ClipboardCheck, accent: "green" },
      { label: "Temperature Log", value: "Ready", icon: Thermometer, accent: "red" },
      { label: "Cleaning Tasks", value: "1", icon: Sparkles, accent: "blue" },
      { label: "Training", value: "1 due", icon: GraduationCap, accent: "teal" },
    ],
    operations: [
      { href: "/checks", title: "Daily Kitchen Checks", desc: "Opening and closing checklists for this shift.", icon: ClipboardCheck, accent: "green" },
      { href: "/temperatures", title: "Temperature Log", desc: "Record a temperature in a couple of taps.", icon: Thermometer, accent: "red" },
      { href: "/cleaning", title: "Cleaning & Hygiene", desc: "Your tasks for today and this week.", icon: Sparkles, accent: "blue" },
      { href: "/training", title: "Training Records", desc: "Your certificates and what is due next.", icon: GraduationCap, accent: "teal" },
    ],
  },
  rollup: {
    title: "Group Overview",
    subtitle: "Read-only compliance rollup across every location",
    note: "Read-only view — corporate sees every site's records but never edits day-to-day logs.",
    stats: [
      { label: "Locations", value: "3", icon: MapPin, accent: "purple" },
      { label: "Compliance Score", value: "92%", icon: ShieldCheck, accent: "green" },
      { label: "Expiring Documents", value: "4", icon: FileText, accent: "amber" },
      { label: "Inspections (QTD)", value: "2", icon: Eye, accent: "blue" },
    ],
    operations: [
      { href: "/reports", title: "Reports & PDF Export", desc: "Group-wide records, ready for audit.", icon: FileBarChart, accent: "teal" },
      { href: "/admin/compliance", title: "Compliance & Renewals", desc: "Renewal status rolled up across all sites.", icon: ShieldCheck, accent: "green" },
      { href: "/admin/documents", title: "Documents", desc: "Every site's licences and paperwork.", icon: FileText, accent: "purple" },
      { href: "/admin/inspections/corporate", title: "Corporate Inspection", desc: "Standardised inspection results by location.", icon: BadgeCheck, accent: "blue" },
    ],
    admin: {
      heading: "People & Records",
      cards: [
        { href: "/admin/staff-licenses", title: "Staff Licences", desc: "Certification expiry across the group.", icon: ListChecks, accent: "blue" },
        { href: "/training", title: "Training Records", desc: "Training coverage by site.", icon: GraduationCap, accent: "teal" },
      ],
    },
  },
  mlo: {
    title: "Multi-Location Owner",
    subtitle: "Own every site end-to-end — and see the group at a glance",
    stats: [
      { label: "My Locations", value: "4", icon: MapPin, accent: "teal" },
      { label: "Compliance Score", value: "94%", icon: ShieldCheck, accent: "green" },
      { label: "Expiring Documents", value: "6", icon: FileText, accent: "amber" },
      { label: "Open Actions", value: "5", icon: Wrench, accent: "blue" },
    ],
    operations: OPERATIONS,
    admin: {
      heading: "Group & Administration",
      cards: [
        { href: "/reports", title: "Group Reports", desc: "Records across every site you own, audit-ready.", icon: FileBarChart, accent: "teal" },
        { href: "/admin/compliance", title: "Compliance & Renewals", desc: "Renewal status rolled up across your sites.", icon: ShieldCheck, accent: "green" },
        { href: "/admin/documents", title: "Documents", desc: "Licences, insurance, franchise and lease agreements.", icon: FileText, accent: "purple" },
        { href: "/admin/staff-licenses", title: "Staff Licences", desc: "Certification expiry across the group.", icon: ListChecks, accent: "blue" },
        { href: "/admin/inspections", title: "Inspections", desc: "Run and review inspections at any site.", icon: Eye, accent: "teal" },
        { href: "/admin/vault", title: "Login Vault", desc: "Encrypted credentials for every location.", icon: KeyRound, accent: "amber" },
        { href: "/admin/new-restaurant", title: "New Restaurant", desc: "Onboard another location with a checklist.", icon: MapPin, accent: "slate" },
      ],
    },
  },
  designer: {
    title: "Marketing Studio",
    subtitle: "Brand assets and promotions for every location",
    note: "Marketing role — no operational or compliance data, by design.",
    stats: [
      { label: "Poster Sets", value: "12", icon: Images, accent: "purple" },
      { label: "Scheduled Posts", value: "8", icon: CalendarDays, accent: "blue" },
      { label: "Promo Requests", value: "3", icon: Megaphone, accent: "amber" },
      { label: "Locations Served", value: "4", icon: MapPin, accent: "teal" },
    ],
    operations: [
      { href: "/admin/marketing", title: "Marketing Material", desc: "Upload posters, social graphics and the content calendar.", icon: Images, accent: "purple" },
      { href: "/admin/marketing/calendar", title: "Content Calendar", desc: "Plan and schedule social posts across sites.", icon: CalendarDays, accent: "blue" },
      { href: "/admin/marketing/requests", title: "Promotion Requests", desc: "In-house promo requests raised by locations.", icon: Megaphone, accent: "amber" },
    ],
  },
};

function viewFor(role: string): DashboardView {
  return VIEWS[isRole(role) ? VIEW_FOR_ROLE[role] : VIEW_FOR_ROLE[DEFAULT_ROLE]];
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setRole(data?.role ?? DEFAULT_ROLE);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && role === null)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    );
  }

  const view = viewFor(role ?? DEFAULT_ROLE);

  return (
    <div>
      <PageHeader
        title={view.title}
        subtitle={view.subtitle}
        action={
          role && (
            <span className={`text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap ${ROLE_COLORS[isRole(role) ? role : DEFAULT_ROLE]}`}>
              {roleLabel(role)}
            </span>
          )
        }
      />

      {view.note && (
        <p className="mb-6 rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-sm text-purple-700">
          {view.note}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {view.stats.map((s) => (
          <StatTile key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.accent} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {view.operations.map((f) => (
          <NavCard key={f.href} {...f} />
        ))}
      </div>

      {view.admin && view.admin.cards.length > 0 && (
        <>
          <h2 className="mt-10 mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            {view.admin.heading}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {view.admin.cards.map((f) => (
              <NavCard key={f.href} {...f} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
