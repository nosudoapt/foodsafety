"use client";

// Shared UI primitives. Reuse these everywhere instead of hand-rolling
// Tailwind on each page — one place to tune the whole app's look.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Accent = "green" | "red" | "blue" | "amber" | "purple" | "teal" | "pink" | "slate";

const ACCENT: Record<Accent, { solid: string; soft: string; text: string; ring: string }> = {
  green:  { solid: "bg-green-600",  soft: "bg-green-100",  text: "text-green-700",  ring: "focus:ring-green-500" },
  red:    { solid: "bg-red-600",    soft: "bg-red-100",    text: "text-red-700",    ring: "focus:ring-red-500" },
  blue:   { solid: "bg-blue-600",   soft: "bg-blue-100",   text: "text-blue-700",   ring: "focus:ring-blue-500" },
  amber:  { solid: "bg-amber-500",  soft: "bg-amber-100",  text: "text-amber-700",  ring: "focus:ring-amber-500" },
  purple: { solid: "bg-purple-600", soft: "bg-purple-100", text: "text-purple-700", ring: "focus:ring-purple-500" },
  teal:   { solid: "bg-teal-600",   soft: "bg-teal-100",   text: "text-teal-700",   ring: "focus:ring-teal-500" },
  pink:   { solid: "bg-pink-600",   soft: "bg-pink-100",   text: "text-pink-700",   ring: "focus:ring-pink-500" },
  slate:  { solid: "bg-slate-800",  soft: "bg-slate-100",  text: "text-slate-700",  ring: "focus:ring-slate-500" },
};

export function accentOf(a: Accent) { return ACCENT[a]; }

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className = "", hover = false, children }: { className?: string; hover?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 ${hover ? "lift" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ children, accent = "slate" }: { children: React.ReactNode; accent?: Accent }) {
  const a = ACCENT[accent];
  return <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full ${a.soft} ${a.text}`}>{children}</span>;
}

export function Button({
  children, onClick, type = "button", accent = "green", variant = "solid", disabled, className = "",
}: {
  children: React.ReactNode; onClick?: () => void; type?: "button" | "submit"; accent?: Accent;
  variant?: "solid" | "soft" | "ghost"; disabled?: boolean; className?: string;
}) {
  const a = ACCENT[accent];
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";
  const look =
    variant === "solid" ? `${a.solid} text-white hover:brightness-110 shadow-sm`
    : variant === "soft" ? `${a.soft} ${a.text} hover:brightness-95`
    : `text-slate-600 hover:bg-slate-100`;
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${look} ${className}`}>{children}</button>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { accent?: Accent }) {
  const { accent = "green", className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 bg-white outline-none focus:ring-2 ${ACCENT[accent].ring} focus:border-transparent transition ${className}`}
    />
  );
}

export function StatTile({ label, value, icon: Icon, accent = "slate" }: { label: string; value: React.ReactNode; icon?: LucideIcon; accent?: Accent }) {
  const a = ACCENT[accent];
  return (
    <Card className="p-5 flex items-center gap-4" hover>
      {Icon && <div className={`w-11 h-11 rounded-xl ${a.soft} flex items-center justify-center`}><Icon className={`w-5 h-5 ${a.text}`} /></div>}
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </Card>
  );
}

export function NavCard({ href, title, desc, icon: Icon, accent }: { href: string; title: string; desc: string; icon: LucideIcon; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <Link href={href} className="lift group bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
      <div className={`w-12 h-12 rounded-xl ${a.soft} flex items-center justify-center`}>
        <Icon className={`w-6 h-6 ${a.text}`} strokeWidth={2} />
      </div>
      <h3 className="mt-4 font-bold text-slate-900 group-hover:text-red-600 transition-colors">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{desc}</p>
    </Link>
  );
}
