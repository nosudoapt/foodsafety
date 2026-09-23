"use client";

import Link from "next/link";
import {
  BookOpen,
  ListTodo,
  CheckCircle2,
  Thermometer,
  CalendarCheck,
  AlertTriangle,
  WheatOff,
  UtensilsCrossed,
  Settings,
  ListChecks,
  KeyRound,
  BookOpenCheck,
  Files,
  Rocket,
  ScrollText,
  ClipboardList,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface HubCard {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;
  accent: string;
}

const cards: HubCard[] = [
  {
    href: "/between-the-buns/prep-manual",
    title: "Prep Manual",
    description: "Searchable recipes and preparation guides — 21 recipes",
    icon: BookOpen,
    accent: "bg-red-50 text-red-600",
  },
  {
    href: "/between-the-buns/prep-count",
    title: "Daily Prep Count",
    description: "MAKE = PAR − OH · keeps 1 week of records",
    icon: ListTodo,
    accent: "bg-orange-50 text-orange-600",
  },
  {
    href: "/between-the-buns/order-sheet",
    title: "Order Sheet",
    description: "ORDER = PAR − OH · keeps 3 months of records",
    icon: ClipboardList,
    accent: "bg-amber-50 text-amber-600",
  },
  {
    href: "/checks",
    title: "Daily Checks",
    description: "Opening and closing duty checklists",
    icon: CheckCircle2,
    accent: "bg-emerald-50 text-emerald-600",
  },
  {
    href: "/temperatures",
    title: "Temperature Log",
    description: "Daily temp sheet — 90-day record",
    icon: Thermometer,
    accent: "bg-blue-50 text-blue-600",
  },
  {
    href: "/between-the-buns/cleaning-schedule",
    title: "Cleaning Schedule",
    description: "Weekly tasks with before & after photos",
    icon: CalendarCheck,
    accent: "bg-purple-50 text-purple-600",
  },
  {
    href: "/between-the-buns/allergen-chart",
    title: "Bun Allergy Chart",
    description: "Allergen info for all bun types — Dairy, Egg, Gluten",
    icon: AlertTriangle,
    accent: "bg-amber-50 text-amber-600",
  },
  {
    href: "/between-the-buns/gluten-free",
    title: "Gluten Free Menu",
    description: "Safe options for gluten-free and Celiac customers",
    icon: WheatOff,
    accent: "bg-green-50 text-green-600",
  },
  {
    href: "/between-the-buns/menu",
    title: "Recipe Cheat Sheets",
    description: "Burgers, wraps, salads, smoothies & milkshakes",
    icon: UtensilsCrossed,
    accent: "bg-yellow-50 text-yellow-700",
  },
  {
    href: "/admin/steps",
    title: "Steps to do",
    description: "Power, internet, debit machine & phone outages",
    icon: ListChecks,
    accent: "bg-red-50 text-red-600",
  },
  {
    href: "/admin/procedures",
    title: "Procedure Cheat Sheet",
    description: "Temps, hygiene, storage & emergency procedures",
    icon: ScrollText,
    accent: "bg-rose-50 text-rose-600",
  },
  {
    href: "/admin/vault",
    title: "Login Vault",
    description: "POS, bank, delivery & utility credentials",
    icon: KeyRound,
    accent: "bg-slate-100 text-slate-600",
  },
  {
    href: "/admin/handbook",
    title: "Employee Handbook",
    description: "Read, digitally sign, keep the record",
    icon: BookOpenCheck,
    accent: "bg-indigo-50 text-indigo-600",
  },
  {
    href: "/admin/print-materials",
    title: "Material to Print",
    description: "Application, incident report & warning letter",
    icon: Files,
    accent: "bg-cyan-50 text-cyan-700",
  },
  {
    href: "/admin/new-restaurant",
    title: "Open a New Restaurant",
    description: "Full checklist from lease to grand opening",
    icon: Rocket,
    accent: "bg-orange-50 text-orange-600",
  },
  {
    href: "/admin",
    title: "Admin Panel",
    description: "Documents, inspections, licenses & marketing",
    icon: Settings,
    accent: "bg-gray-100 text-gray-600",
  },
];

export default function BetweenTheBunsHome() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50">
      {/* Header */}
      <div className="bg-red-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-10 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-900/20">
            <span className="text-red-600 font-bold text-xl">BTB</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Between the Buns</h1>
          <p className="text-red-100 mt-2 text-sm">Staff Resource Hub</p>
        </div>
      </div>

      {/* Menu */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href + card.title}
                href={card.href}
                className="group bg-white rounded-xl p-5 border border-gray-200/80 hover:shadow-md hover:border-red-200 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${card.accent}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors text-[15px]">
                      {card.title}
                    </h3>
                    <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">
                      {card.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            © Between the Buns — Food Safety Management System
          </p>
        </div>
      </div>
    </div>
  );
}
