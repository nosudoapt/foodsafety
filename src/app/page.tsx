"use client";

import Link from "next/link";
import {
  ShieldCheck, Bell, Tablet, Lock, ArrowRight,
  Sparkles, ClipboardList, Thermometer, KeyRound, Star,
} from "lucide-react";

// Marketing cover site. Demo lives at /app, trial signup at /auth/sign-up?trial=1.
const FEATURES = [
  { icon: Bell, title: "Compliance autopilot", desc: "Licenses, insurance, lease, franchise, hood & fire — one register that warns you 60–180 days before every expiry.", accent: "from-red-500 to-orange-500" },
  { icon: Tablet, title: "Offline-first tablets", desc: "Prep counts, cleaning and temp logs keep working on the line when the wifi drops. Built for iPad, add to home screen.", accent: "from-blue-500 to-cyan-500" },
  { icon: Lock, title: "Six-role RBAC", desc: "Staff see today's prep. Owners see the vault. Corporate sees every location. Same app, six tailored experiences.", accent: "from-purple-500 to-fuchsia-500" },
  { icon: KeyRound, title: "Operations vault", desc: "POS, banking, delivery logins, emergency contacts and outage protocols — everything the shift lead needs, secured.", accent: "from-emerald-500 to-teal-500" },
];

const STEPS = [
  { icon: ClipboardList, label: "Prep & order sheets" },
  { icon: Thermometer, label: "Temp & cleaning logs" },
  { icon: ShieldCheck, label: "Compliance register" },
  { icon: KeyRound, label: "Vault & protocols" },
];

const PLANS = [
  { name: "Demo", price: "Free", desc: "Explore the full platform with sample data. No signup.", cta: "Open demo", href: "/app", accent: false },
  { name: "Single site", price: "$49", per: "/mo", desc: "One restaurant, unlimited staff, full compliance engine.", cta: "Start 30-day trial", href: "/auth/sign-up?trial=1", accent: true },
  { name: "Multi-location", price: "Let's talk", desc: "Corporate rollups, per-brand workspaces, priority onboarding.", cta: "Book a call", href: "/auth/sign-up?trial=1", accent: false },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-white text-sm">FS</div>
            FoodSafe
          </div>
          <nav className="hidden sm:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition">Features</a>
            <a href="#pricing" className="hover:text-slate-900 transition">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth/sign-in" className="text-sm font-semibold text-slate-600 hover:text-slate-900">Sign in</Link>
            <Link href="/auth/sign-up?trial=1" className="text-sm font-semibold text-white bg-slate-900 px-4 py-2 rounded-xl hover:bg-slate-800 transition active:scale-95">Start free</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative gradient-surface text-white">
        <div className="max-w-6xl mx-auto px-5 pt-20 pb-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1.5 pop">
              <Sparkles className="w-3.5 h-3.5" /> The operations OS for restaurants
            </span>
            <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Never miss a <span className="gradient-text">renewal</span>,<br /> a temp log, or a shift.
            </h1>
            <p className="mt-6 text-lg text-slate-300 max-w-md leading-relaxed">
              Compliance autopilot, offline-first tablet logs and a secure operations vault — in one dedicated workspace per brand.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auth/sign-up?trial=1" className="relative overflow-hidden inline-flex items-center gap-2 bg-white text-slate-900 font-bold px-6 py-3.5 rounded-2xl hover:brightness-95 transition active:scale-95 glow">
                <span className="absolute inset-0 shine" /> Start 30-day trial <ArrowRight className="w-4 h-4 relative" />
              </Link>
              <Link href="/app" className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-6 py-3.5 rounded-2xl hover:bg-white/15 transition active:scale-95">
                View live demo
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
              <div className="flex -space-x-1">{[0,1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-red-400 to-orange-300 border-2 border-slate-900" />)}</div>
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> Built for UK &amp; Canadian food businesses
            </div>
          </div>

          {/* Floating product mock */}
          <div className="relative float">
            <div className="rounded-3xl bg-white/95 text-slate-900 shadow-2xl p-5 glow">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" /><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /><div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <span className="ml-2 text-xs font-semibold text-slate-400">Compliance & Renewals</span>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-100">
                  <span className="text-sm font-semibold">🧯 Fire suppression</span>
                  <span className="text-xs font-bold text-red-600">Expired 3d ago</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100">
                  <span className="text-sm font-semibold">🏥 Health license</span>
                  <span className="text-xs font-bold text-amber-600">42d left</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <span className="text-sm font-semibold">🏢 Lease agreement</span>
                  <span className="text-xs font-bold text-emerald-600">On track</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {STEPS.map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-slate-50">
                    <s.icon className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-24">
        <div className="text-center max-w-2xl mx-auto reveal">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Everything the back office forgets</h2>
          <p className="mt-4 text-slate-500 text-lg">Temp logs, cleaning, compliance and renewals — one platform for the whole operation.</p>
        </div>
        <div className="mt-14 grid md:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="reveal group rounded-3xl border border-slate-200 p-7 hover:shadow-xl transition-shadow">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.accent} flex items-center justify-center text-white`}>
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="mt-5 text-xl font-bold">{f.title}</h3>
              <p className="mt-2 text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 py-24">
        <div className="text-center reveal">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Simple pricing</h2>
          <p className="mt-4 text-slate-500 text-lg">Try everything free for 30 days. No card required.</p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {PLANS.map((p) => (
            <div key={p.name} className={`reveal rounded-3xl p-8 flex flex-col ${p.accent ? "bg-slate-900 text-white shadow-2xl scale-[1.03]" : "border border-slate-200"}`}>
              {p.accent && <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400 mb-2">Most popular</span>}
              <h3 className="text-lg font-bold">{p.name}</h3>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-extrabold">{p.price}</span>
                {p.per && <span className={`mb-1 text-sm ${p.accent ? "text-slate-400" : "text-slate-400"}`}>{p.per}</span>}
              </div>
              <p className={`mt-3 text-sm leading-relaxed flex-1 ${p.accent ? "text-slate-300" : "text-slate-500"}`}>{p.desc}</p>
              <Link href={p.href} className={`mt-6 inline-flex items-center justify-center gap-2 font-bold px-5 py-3 rounded-2xl transition active:scale-95 ${p.accent ? "bg-white text-slate-900 hover:brightness-95" : "bg-slate-900 text-white hover:bg-slate-800"}`}>
                {p.cta} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="gradient-surface text-white">
        <div className="max-w-4xl mx-auto px-5 py-24 text-center">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight reveal">Run a tighter kitchen.</h2>
          <p className="mt-5 text-slate-300 text-lg reveal">Start your free trial or click straight into the live demo.</p>
          <div className="mt-9 flex flex-wrap gap-3 justify-center reveal">
            <Link href="/auth/sign-up?trial=1" className="relative overflow-hidden inline-flex items-center gap-2 bg-white text-slate-900 font-bold px-7 py-4 rounded-2xl transition active:scale-95 glow">
              <span className="absolute inset-0 shine" /> Start 30-day trial <ArrowRight className="w-4 h-4 relative" />
            </Link>
            <Link href="/app" className="inline-flex items-center gap-2 bg-white/10 border border-white/20 font-semibold px-7 py-4 rounded-2xl hover:bg-white/15 transition active:scale-95">View demo</Link>
          </div>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-sm text-slate-400">© {new Date().getFullYear()} FoodSafe · Built for UK &amp; Canadian food businesses</div>
      </section>
    </div>
  );
}
