"use client";

// Shared UI primitives. Reuse these everywhere instead of hand-rolling
// Tailwind on each page — one place to tune the whole app's look.
import Link from "next/link";
import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export type Accent = "green" | "red" | "blue" | "amber" | "purple" | "teal" | "pink" | "slate";

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
    <div className="ui-pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className = "", hover = false, children }: { className?: string; hover?: boolean; children: React.ReactNode }) {
  return (
    <div className={`ui-card ${hover ? "ui-card--interactive" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ children, accent = "slate" }: { children: React.ReactNode; accent?: Accent }) {
  return <span className={`ui-badge ui-tone--${accent}`}>{children}</span>;
}

export function Button({
  children, type = "button", accent = "green", variant = "solid", className = "", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  accent?: Accent; variant?: "solid" | "soft" | "ghost" | "danger";
}) {
  return <button {...props} type={type} data-accent={accent} className={`ui-button ${variant === "solid" ? "" : `ui-button--${variant}`} ${className}`}>{children}</button>;
}

/** Horizontal tabs with one tab stop and arrow / Home / End navigation. */
export function TabList<T extends string>({ id, label, tabs, value, onChange }: {
  id: string; label: string; tabs: readonly { id: T; label: string }[];
  value: T; onChange: (value: T) => void;
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  return <div className="ui-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab"
      id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`}
      aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1}
      ref={(element) => { if (element) buttons.current.set(tab.id, element); else buttons.current.delete(tab.id); }}
      onClick={() => onChange(tab.id)}
      onKeyDown={(event) => {
        const target = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (target === null) return;
        event.preventDefault();
        onChange(tabs[target].id);
        buttons.current.get(tabs[target].id)?.focus();
      }}>{tab.label}</button>)}
  </div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { accent?: Accent }) {
  const { accent = "green", className = "", ...rest } = props;
  return (
    <input
      {...rest}
      data-accent={accent}
      className={`ui-input ${className}`}
    />
  );
}

export function StatTile({ label, value, icon: Icon, accent = "slate" }: { label: string; value: React.ReactNode; icon?: LucideIcon; accent?: Accent }) {
  return (
    <Card className="ui-stat">
      {Icon && <div className={`ui-icon ui-tone--${accent}`}><Icon size={20} aria-hidden="true" /></div>}
      <div>
        <p className="ui-stat__value">{value}</p>
        <p className="ui-stat__label">{label}</p>
      </div>
    </Card>
  );
}

export function NavCard({ href, title, desc, icon: Icon, accent }: { href: string; title: string; desc: string; icon: LucideIcon; accent: Accent }) {
  return (
    <Link href={href} className="ui-card ui-card--interactive ui-navcard">
      <div className="ui-navcard__head">
        <span className={`ui-icon ui-tone--${accent}`}><Icon size={21} strokeWidth={1.8} aria-hidden="true" /></span>
        <ArrowRight className="ui-navcard__arrow" size={17} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </Link>
  );
}
