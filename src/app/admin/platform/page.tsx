"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Building2, Database, DollarSign, RefreshCw, Users } from "lucide-react";
import RecentlyUsed from "@/components/RecentlyUsed";

// Platform owner dashboard — every client (restaurant) in one pane: usage
// heatmap, page views, active users, storage (GB), AI calls, and the pricing
// game (plan / seats / monthly price per client). Owner tier only (route guard).

interface ClientRow {
  restaurant_name: string;
  views30d: number;
  activeUsers: number;
  topPages: { path: string; visits: number }[];
  lastSeen: string | null;
  storageBytes: number;
  aiCalls30d?: number;
  plan: string;
  seats: number;
  monthlyPrice: number;
}

interface PlatformData {
  ok: boolean;
  generatedAt: string;
  totals: { clients: number; views30d: number; activeUsers: number; storageBytes: number; mrr: number; seats: number };
  heatmap: number[][];
  clients: ClientRow[];
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const heatTone = (n: number) => {
  if (n === 0) return "bg-slate-100";
  if (n < 3) return "bg-amber-200";
  if (n < 8) return "bg-amber-400";
  if (n < 20) return "bg-orange-500";
  return "bg-red-600";
};

export default function PlatformAdminPage() {
  const [data, setData] = useState<PlatformData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/platform", { signal: AbortSignal.timeout(20_000) });
      const json = (await res.json()) as PlatformData & { error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Platform data is unavailable.");
      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Platform data is unavailable.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePlan = async (client: ClientRow, patch: Partial<Pick<ClientRow, "plan" | "seats" | "monthlyPrice">>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/platform", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_name: client.restaurant_name,
          plan: patch.plan ?? client.plan,
          seats: patch.seats ?? client.seats,
          monthly_price: patch.monthlyPrice ?? client.monthlyPrice,
        }),
      });
      if (!res.ok) throw new Error("The plan change didn't save. Try again.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The plan change didn't save.");
    } finally {
      setBusy(false);
    }
  };

  const maxCell = data ? Math.max(1, ...data.heatmap.flat()) : 1;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform · all clients</h1>
          <p className="text-sm text-gray-500">
            Every branch, location and restaurant on the site — usage, storage, and the pricing game. Owner tier only.
          </p>
        </div>
        <button onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 disabled:opacity-50">
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <RecentlyUsed />

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {!data && !error ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">Loading platform data…</div>
      ) : data ? (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat icon={<Building2 size={18} />} label="Clients" value={data.totals.clients.toLocaleString()} />
            <Stat icon={<Activity size={18} />} label="Page visits · 30d" value={data.totals.views30d.toLocaleString()} />
            <Stat icon={<Users size={18} />} label="Active users · 30d" value={data.totals.activeUsers.toLocaleString()} />
            <Stat icon={<Database size={18} />} label="Storage used" value={`${data.totals.storageBytes.toFixed(2)} GB`} />
            <Stat icon={<DollarSign size={18} />} label="MRR (set prices)" value={`$${data.totals.mrr.toLocaleString()}`} />
            <Stat icon={<Users size={18} />} label="Seats sold" value={data.totals.seats.toLocaleString()} />
          </div>

          {/* Heatmap: 30 days × 24 hours of activity across all clients */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-bold text-gray-900 mb-1">Usage heatmap · last 30 days × hour of day</h2>
            <p className="text-xs text-gray-500 mb-3">Every page visit on the platform. Darker = busier — spot peak hours and dead zones.</p>
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 2 }}>
                <tbody>
                  {data.heatmap.map((day, di) => (
                    <tr key={di}>
                      <td className="text-[9px] text-gray-400 pr-1 whitespace-nowrap">
                        {new Date(Date.now() - (29 - di) * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </td>
                      {day.map((count, hour) => (
                        <td key={hour}>
                          <div
                            className={`w-3.5 h-3.5 rounded-[3px] ${heatTone(count)}`}
                            title={`${count} visit${count === 1 ? "" : "s"} · ${String(hour).padStart(2, "0")}:00`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td />
                    {Array.from({ length: 24 }, (_, hour) => (
                      <td key={hour} className="text-[8px] text-gray-400 text-center">{hour % 3 === 0 ? hour : ""}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Peak cell this month: {maxCell} visits.</p>
          </div>

          {/* Clients */}
          <div className="space-y-3">
            {data.clients.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <p className="font-semibold text-gray-900">No usage recorded yet</p>
                <p className="text-sm text-gray-500 mt-1">Once people use the site, each client appears here with their usage and storage.</p>
              </div>
            ) : data.clients.map((client) => (
              <div key={client.restaurant_name} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{client.restaurant_name}</h3>
                    <p className="text-xs text-gray-500">
                      {client.views30d.toLocaleString()} visits · 30d · {client.activeUsers} active user{client.activeUsers === 1 ? "" : "s"} · {client.storageBytes.toFixed(3)} GB stored
                      {client.aiCalls30d != null ? ` · ${client.aiCalls30d.toLocaleString()} AI calls` : ""}
                      {client.lastSeen ? ` · last seen ${fmtDate(client.lastSeen)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      <span className="block text-[10px] font-bold text-gray-500 uppercase">Plan</span>
                      <select
                        value={client.plan}
                        disabled={busy}
                        onChange={(e) => void savePlan(client, { plan: e.target.value })}
                        className="mt-0.5 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 bg-white"
                      >
                        {["trial", "standard", "pro", "enterprise", "paused"].map((plan) => (
                          <option key={plan} value={plan}>{plan}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs">
                      <span className="block text-[10px] font-bold text-gray-500 uppercase">Seats</span>
                      <input
                        type="number" min={0} defaultValue={client.seats} disabled={busy}
                        onBlur={(e) => Number(e.target.value) !== client.seats && void savePlan(client, { seats: Number(e.target.value) })}
                        className="mt-0.5 w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 bg-white"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="block text-[10px] font-bold text-gray-500 uppercase">$/month</span>
                      <input
                        type="number" min={0} step="0.01" defaultValue={client.monthlyPrice} disabled={busy}
                        onBlur={(e) => Number(e.target.value) !== client.monthlyPrice && void savePlan(client, { monthlyPrice: Number(e.target.value) })}
                        className="mt-0.5 w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900 bg-white"
                      />
                    </label>
                  </div>
                </div>
                {client.topPages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {client.topPages.map((page) => (
                      <Link
                        key={page.path}
                        href={page.path}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-amber-300 hover:text-amber-800"
                        title={`${page.visits} visits`}
                      >
                        <span className="truncate max-w-[16rem]">{page.path}</span>
                        <span className="text-gray-400">{page.visits}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-gray-400">
            Generated {fmtDate(data.generatedAt)}. Storage = the PDFs, photos and attachments stored in the database for each client.
            Compute/network metering per client arrives when the Vercel billing API is wired in — visits, users and storage are live now.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">{icon}{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
