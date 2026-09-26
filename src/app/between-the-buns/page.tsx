"use client";

import { NavCard } from "@/components/ui";
import {
  BookOpen, Calculator, ClipboardList, CheckSquare, Thermometer,
  Sparkles, AlertTriangle, Salad, UtensilsCrossed, Settings,
} from "lucide-react";

const cards = [
  { href: "/between-the-buns/prep-count", title: "Daily Prep Count", desc: "MAKE = PAR − On Hand. Fast tablet entry, 7-day record.", icon: Calculator, accent: "red" as const },
  { href: "/between-the-buns/order-sheet", title: "Order Sheet", desc: "ORDER = PAR − On Hand. Keeps 3 months of orders.", icon: ClipboardList, accent: "amber" as const },
  { href: "/between-the-buns/cleaning-schedule", title: "Cleaning Schedule", desc: "Weekly tasks with before & after photo upload.", icon: Sparkles, accent: "purple" as const },
  { href: "/between-the-buns/prep-manual", title: "Prep Manual", desc: "Searchable recipes & prep guides — 21 recipes.", icon: BookOpen, accent: "red" as const },
  { href: "/between-the-buns/menu", title: "Recipe Cheat Sheets", desc: "Burgers, wraps, salads, smoothies & shakes.", icon: UtensilsCrossed, accent: "amber" as const },
  { href: "/between-the-buns/allergen-chart", title: "Bun Allergy Chart", desc: "Allergen info for all bun types.", icon: AlertTriangle, accent: "amber" as const },
  { href: "/between-the-buns/gluten-free", title: "Gluten Free Menu", desc: "Safe options for gluten-free & Celiac guests.", icon: Salad, accent: "green" as const },
  { href: "/checks", title: "Daily Checks", desc: "Opening & closing duty checklists.", icon: CheckSquare, accent: "green" as const },
  { href: "/temperatures", title: "Temperature Log", desc: "Cooking, cooling & storage temperatures.", icon: Thermometer, accent: "blue" as const },
  { href: "/admin", title: "Admin Panel", desc: "Documents, inspections, licenses & management.", icon: Settings, accent: "slate" as const },
];

export default function BetweenTheBunsHome() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8 animate-fade-in">
        <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
          <span className="text-white font-bold text-xl">BTB</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Staff Resource Hub</h1>
        <p className="text-slate-500 mt-1">Everything your team needs, in one place</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {cards.map((c) => (
          <NavCard key={c.href} {...c} />
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-slate-400">
        © Between the Buns — Food Safety Management System
      </p>
    </div>
  );
}
