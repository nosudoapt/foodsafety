"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Flame } from "lucide-react";
import type { ActivityWorkspace } from "@/lib/activity";

type Recent = { path: string; title: string; at?: string };
type Top = { path: string; title: string; visits: number };

/** "Recently used" and "Most used" chips for the signed-in person, fed by the
 * page-visit tracker. Rendered on the dashboards; empty when there's no
 * history yet. */
export default function RecentlyUsed({ workspace = "foodsafe", allowedPaths }: { workspace?: ActivityWorkspace; allowedPaths?: readonly string[] }) {
  const allowedKey = allowedPaths ? [...allowedPaths].sort().join("\n") : "";
  const key = `${workspace}:${allowedKey}`;
  const [history, setHistory] = useState<{ key: string; recent: Recent[]; top: Top[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const allowed = new Set(allowedKey.split("\n"));
    (async () => {
      try {
        const res = await fetch(workspace === "btb" ? "/api/activity?workspace=btb" : "/api/activity", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!res.ok) return;
        const data = (await res.json()) as { recent?: Recent[]; top?: Top[] };
        if (!cancelled) setHistory({ key: `${workspace}:${allowedKey}`,
          recent: (data.recent ?? []).filter(item => !allowedKey || allowed.has(item.path)),
          top: (data.top ?? []).filter(item => !allowedKey || allowed.has(item.path)),
        });
      } catch {
        /* chips are a nice-to-have — stay silent */
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [workspace, allowedKey]);

  if (history?.key !== key || (!history.recent.length && !history.top.length)) return null;
  const { recent, top } = history;
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
