"use client";

import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-gray-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${padded ? "p-4 sm:p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
      {icon && <span className="text-gray-400">{icon}</span>}
      {children}
    </h2>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm shadow-red-600/15",
    secondary:
      "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-400",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-400",
    danger: "bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 focus-visible:ring-red-500",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 ring-gray-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {description && <p className="mt-1 text-[13px] text-gray-500 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Progress({ value, tone = "red" }: { value: number; tone?: "red" | "green" | "amber" }) {
  const colors: Record<string, string> = {
    red: "bg-red-600",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
  };
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${colors[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-shadow";
