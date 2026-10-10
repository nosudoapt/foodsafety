"use client";

import { useState } from "react";
import {
  BookOpen, Calculator, ClipboardList, LayoutGrid,
  Sparkles, AlertTriangle, Salad, UtensilsCrossed,
  Phone, FileText, BookCheck, Printer, ShieldCheck,
  File as FileIcon, IdCard, ClipboardCheck, Megaphone, ListChecks, KeyRound, Flame,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input, NavCard } from "@/components/ui";
import { cardsForRole, hiddenCardsForRole, type BtbIconKey } from "@/lib/btb-hub";
import BtbWordmark from "@/components/BtbWordmark";
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
  flame: Flame,
  key: KeyRound,
};

// The BTB hub. Which cards appear is decided by the signed-in role
// (src/lib/btb-hub.ts) — staff don't see the Order Sheet, everyone else does.
export default function BtbHub({ role }: { role: BtbRole }) {
  const cards = cardsForRole(role);
  const hidden = hiddenCardsForRole(role);

  // Card search: filters this role's own cards by title or description, so a
  // tap on a phone lands on the right sheet without scrolling the whole hub.
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const visible = term
    ? cards.filter((c) => c.title.toLowerCase().includes(term) || c.desc.toLowerCase().includes(term))
    : cards;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8 animate-fade-in">
        <div className="flex justify-center mb-3">
          <BtbWordmark className="text-2xl sm:text-3xl" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Staff Resource Hub</h1>
        <p className="text-slate-500 mt-1">Everything your team needs, in one place</p>
        <p className="mt-3">
          <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#f3e2cf] text-[#b65a2e] uppercase tracking-wide">
            Viewing as {role.replace("_", " ")}
          </span>
        </p>
      </div>

      {/* Card search — sits directly under the header so it is the first
          control on the page on both phone and desktop. */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
        <Input
          accent="red"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards — prep, order, vault, allergens…"
          aria-label="Search cards"
          className="pl-10"
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-3xl mb-2">🔍</p>
          <p className="font-semibold text-slate-900">No cards match “{query.trim()}”</p>
          <p className="text-sm text-slate-500 mt-1">
            Try prep, order, cleaning, vault or allergens.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {visible.map((c) => (
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
      )}

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
