"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Flame } from "lucide-react";

type Recent = { path: string; title: string; at?: string };
type Top = { path: string; title: string; visits: number };

/** "Recently used" and "Most used" chips for the signed-in person, fed by the
 * page-visit tracker. Rendered on the dashboards; empty when there's no
 * history yet. */
export default function RecentlyUsed() {
  const [recent, setRecent] = useState<Recent[]>([]);
  const [top, setTop] = useState<Top[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/activity", { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const data = (await res.json()) as { recent?: Recent[]; top?: Top[] };
        if (!cancelled) { setRecent(data.recent ?? []); setTop(data.top ?? []); }
      } catch {
        /* chips are a nice-to-have — stay silent */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || (!recent.length && !top.length)) return null;
  const chip = "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:text-amber-800 transition-colors max-w-full";

  return (
    <div className="space-y-2 mb-4">
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Clock size={12} aria-hidden="true" />Recently used</span>
          {recent.map((item) => (
            <Link key={item.path} href={item.path} className={chip} title={item.title}>
              <span className="truncate max-w-[14rem]">{item.title}</span>
            </Link>
          ))}
        </div>
      )}
      {top.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Flame size={12} aria-hidden="true" />Most used · 30 days</span>
          {top.map((item) => (
            <Link key={item.path} href={item.path} className={chip} title={`${item.visits} visits`}>
              <span className="truncate max-w-[12rem]">{item.title}</span>
              <span className="text-slate-400">{item.visits}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
