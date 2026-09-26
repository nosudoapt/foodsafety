"use client";

import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";

export default function TrialExpired() {
  return (
    <div className="min-h-screen gradient-surface text-white flex items-center justify-center p-6">
      <div className="max-w-md text-center pop">
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-6">
          <Clock className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your 30-day trial has ended</h1>
        <p className="mt-4 text-slate-300 leading-relaxed">
          Thanks for trying FoodSafe. Upgrade to keep your compliance alerts, logs and vault
          — or explore the demo anytime.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link href="/#pricing" className="relative overflow-hidden inline-flex items-center gap-2 bg-white text-slate-900 font-bold px-6 py-3.5 rounded-2xl transition active:scale-95 glow">
            <span className="absolute inset-0 shine" /> See plans <ArrowRight className="w-4 h-4 relative" />
          </Link>
          <Link href="/app" className="inline-flex items-center gap-2 bg-white/10 border border-white/20 font-semibold px-6 py-3.5 rounded-2xl hover:bg-white/15 transition active:scale-95">
            Open demo
          </Link>
        </div>
      </div>
    </div>
  );
}
