"use client";

import {
  BookOpen, Calculator, ClipboardList, LayoutGrid,
  Sparkles, AlertTriangle, Salad, UtensilsCrossed,
  Phone, FileText, BookCheck, Printer, ShieldCheck,
  File as FileIcon, IdCard, ClipboardCheck, Megaphone, ListChecks, KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavCard } from "@/components/ui";
import { cardsForRole, hiddenCardsForRole, type BtbIconKey } from "@/lib/btb-hub";
import type { BtbRole } from "@/lib/btb-roles";

const ICONS: Record<BtbIconKey, LucideIcon> = {
  calculator: Calculator,
  layoutGrid: LayoutGrid,
  clipboard: ClipboardList,
  sparkles: Sparkles,
  book: BookOpen,
  utensils: UtensilsCrossed,
  alert: AlertTriangle,
  salad: Salad,
  phone: Phone,
  fileText: FileText,
  bookCheck: BookCheck,
  printer: Printer,
  shield: ShieldCheck,
  file: FileIcon,
  idCard: IdCard,
  clipboardCheck: ClipboardCheck,
  megaphone: Megaphone,
  listChecks: ListChecks,
  key: KeyRound,
};

// The BTB hub. Which cards appear is decided by the signed-in role
// (src/lib/btb-hub.ts) — staff don't see the Order Sheet, everyone else does.
export default function BtbHub({ role }: { role: BtbRole }) {
  const cards = cardsForRole(role);
  const hidden = hiddenCardsForRole(role);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8 animate-fade-in">
        <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
          <span className="text-white font-bold text-xl">BTB</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Staff Resource Hub</h1>
        <p className="text-slate-500 mt-1">Everything your team needs, in one place</p>
        <p className="mt-3">
          <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 uppercase tracking-wide">
            Viewing as {role.replace("_", " ")}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {cards.map((c) => (
          <NavCard
            key={c.href}
            href={c.href}
            title={c.title}
            desc={c.desc}
            icon={ICONS[c.iconKey]}
            accent={c.accent}
          />
        ))}
      </div>

      {hidden.length > 0 && (
        <p className="mt-6 text-center text-xs text-slate-400">
          {hidden.map((c) => c.title).join(", ")} {hidden.length === 1 ? "is" : "are"} available
          to managers and above.
        </p>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">
        © Between the Buns — Food Safety Management System
      </p>
    </div>
  );
}
