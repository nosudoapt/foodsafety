"use client";

import Link from "next/link";
import { ShieldCheck, UtensilsCrossed, ArrowRight } from "lucide-react";

const products = [
  {
    href: "/auth/sign-in",
    tag: "Demo",
    title: "FoodSafe Manager",
    desc: "Digital HACCP — temperatures, checks, cleaning, allergens and compliance records.",
    icon: ShieldCheck,
    accent: "green",
    cta: "Enter demo",
  },
  {
    href: "/between-the-buns/login",
    tag: "Client",
    title: "Between the Buns",
    desc: "Dedicated staff hub — prep counts, cleaning schedules, recipes and store operations.",
    icon: UtensilsCrossed,
    accent: "red",
    cta: "Staff sign-in",
  },
];

const styles = {
  green: {
    ring: "hover:border-green-400",
    chip: "bg-green-100 text-green-700",
    icon: "bg-green-600",
    cta: "text-green-700",
  },
  red: {
    ring: "hover:border-red-400",
    chip: "bg-red-100 text-red-700",
    icon: "bg-red-600",
    cta: "text-red-700",
  },
} as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-10 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
          Restaurant Operations Platform
        </h1>
        <p className="text-slate-500 mt-2">Choose a workspace to continue</p>
      </div>

      <div className="grid w-full max-w-3xl gap-5 sm:grid-cols-2 stagger">
        {products.map((p) => {
          const s = styles[p.accent as keyof typeof styles];
          const Icon = p.icon;
          return (
            <Link
              key={p.href}
              href={p.href}
              className={`lift group bg-white rounded-2xl border border-slate-200 p-7 flex flex-col ${s.ring}`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-12 h-12 ${s.icon} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" strokeWidth={2} />
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${s.chip}`}>
                  {p.tag}
                </span>
              </div>
              <h2 className="mt-5 text-xl font-bold text-slate-900">{p.title}</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed flex-1">{p.desc}</p>
              <span className={`mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${s.cta}`}>
                {p.cta}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-10 text-sm text-slate-400">Built for UK &amp; Canadian food businesses</p>
    </div>
  );
}
