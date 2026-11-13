"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Building2, Database, DollarSign, KeyRound, LockKeyhole, RefreshCw, Users } from "lucide-react";

// The platform pane — /platform. A standalone sign-in (passcode from the
// server environment), separate from FoodSafe admin roles and BTB logins.
// Both products appear here as clients only: usage heatmap, storage (GB),
// visits, active users and the pricing game (plan / seats / $ per month).

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

export default function PlatformPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/platform/session", { signal: AbortSignal.timeout(8000) });
        const json = (await res.json()) as { authed: boolean; configured: boolean };
        setAuthed(json.authed);
        setConfigured(json.configured !== false);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  if (authed === null) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 text-sm text-slate-400">Checking platform access…</div>;
  }
  if (!authed) {
    return <SignIn onDone={() => setAuthed(true)} configured={configured} />;
  }
  return <Dashboard onSignOut={async () => { await fetch("/api/platform/session", { method: "DELETE" }); setAuthed(false); }} />;
}

function SignIn({ onDone, configured }: { onDone: () => void; configured: boolean }) {
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstTime = !configured;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !passcode) return;
    if (firstTime && passcode !== confirm) {
      setError("The two entries don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/platform/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Sign in failed. Try again.");
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="w-11 h-11 rounded-xl bg-slate-900 grid place-items-center mb-4">
          <LockKeyhole size={20} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Platform owner</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          {firstTime
            ? "First sign-in claims the platform passcode — whatever you set here becomes the key (stored hashed in the database)."
            : "One pane for every client on the site — both products included. Sign in with the platform passcode."}
        </p>
        {error && <p className="mb-4 text-sm text-red-600" role="alert">{error}</p>}
        <label className="block text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">{firstTime ? "New passcode (min 8 characters)" : "Passcode"}</span>
          <input
            type="password"
            required
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 bg-white outline-none focus:ring-2 focus:ring-slate-500"
            placeholder="••••••••"
          />
        </label>
        {firstTime && (
          <label className="block text-sm mt-3">
            <span className="block text-xs font-semibold text-slate-500 mb-1">Confirm passcode</span>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 bg-white outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="••••••••"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={busy || !passcode || (firstTime && !confirm)}
          className="mt-5 w-full bg-slate-900 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Checking…" : firstTime ? "Set passcode & sign in" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<PlatformData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/platform/data", { signal: AbortSignal.timeout(20_000) });
      const json = (await res.json()) as PlatformData & { error?: string };
      if (res.status === 401) throw new Error("Your platform session ended — reload to sign in again.");
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
      const res = await fetch("/api/platform/data", {
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
    <div className="min-h-screen bg-slate-50">
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Platform · all clients</h1>
            <p className="text-sm text-slate-500">
              Every branch, location and restaurant — both products appear here as clients. Usage, storage, and the pricing game.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-100 disabled:opacity-50">
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={() => void onSignOut()} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 px-2 py-2">
              <KeyRound size={15} /> Sign out
            </button>
          </div>
        </div>

        {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        {!data && !error ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">Loading platform data…</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat icon={<Building2 size={18} />} label="Clients" value={data.totals.clients.toLocaleString()} />
              <Stat icon={<Activity size={18} />} label="Page visits · 30d" value={data.totals.views30d.toLocaleString()} />
              <Stat icon={<Users size={18} />} label="Active users · 30d" value={data.totals.activeUsers.toLocaleString()} />
              <Stat icon={<Database size={18} />} label="Storage used" value={`${data.totals.storageBytes.toFixed(2)} GB`} />
              <Stat icon={<DollarSign size={18} />} label="MRR (set prices)" value={`$${data.totals.mrr.toLocaleString()}`} />
              <Stat icon={<Users size={18} />} label="Seats sold" value={data.totals.seats.toLocaleString()} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-bold text-slate-900 mb-1">Usage heatmap · last 30 days × hour of day</h2>
              <p className="text-xs text-slate-500 mb-3">Every page visit across all clients. Darker = busier — spot peak hours and dead zones.</p>
              <div className="overflow-x-auto">
                <table className="border-separate" style={{ borderSpacing: 2 }}>
                  <tbody>
                    {data.heatmap.map((day, di) => (
                      <tr key={di}>
                        <td className="text-[9px] text-slate-400 pr-1 whitespace-nowrap">
                          {new Date(Date.now() - (29 - di) * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </td>
                        {day.map((count, hour) => (
                          <td key={hour}>
                            <div className={`w-3.5 h-3.5 rounded-[3px] ${heatTone(count)}`} title={`${count} visit${count === 1 ? "" : "s"} · ${String(hour).padStart(2, "0")}:00`} />
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td />
                      {Array.from({ length: 24 }, (_, hour) => (
                        <td key={hour} className="text-[8px] text-slate-400 text-center">{hour % 3 === 0 ? hour : ""}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Peak cell this month: {maxCell} visits.</p>
            </div>

            <div className="space-y-3">
              {data.clients.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                  <p className="font-semibold text-slate-900">No usage recorded yet</p>
                  <p className="text-sm text-slate-500 mt-1">Once people use either product, each client appears here with usage and storage.</p>
                </div>
              ) : data.clients.map((client) => (
                <div key={client.restaurant_name} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{client.restaurant_name}</h3>
                      <p className="text-xs text-slate-500">
                        {client.views30d.toLocaleString()} visits · 30d · {client.activeUsers} active user{client.activeUsers === 1 ? "" : "s"} · {client.storageBytes.toFixed(3)} GB stored
                        {client.aiCalls30d != null ? ` · ${client.aiCalls30d.toLocaleString()} AI calls` : ""}
                        {client.lastSeen ? ` · last seen ${fmtDate(client.lastSeen)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase">Plan</span>
                        <select
                          value={client.plan}
                          disabled={busy}
                          onChange={(e) => void savePlan(client, { plan: e.target.value })}
                          className="mt-0.5 border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900 bg-white"
                        >
                          {["trial", "standard", "pro", "enterprise", "paused"].map((plan) => (
                            <option key={plan} value={plan}>{plan}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase">Seats</span>
                        <input
                          type="number" min={0} defaultValue={client.seats} disabled={busy}
                          onBlur={(e) => Number(e.target.value) !== client.seats && void savePlan(client, { seats: Number(e.target.value) })}
                          className="mt-0.5 w-16 border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900 bg-white"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase">$/month</span>
                        <input
                          type="number" min={0} step="0.01" defaultValue={client.monthlyPrice} disabled={busy}
                          onBlur={(e) => Number(e.target.value) !== client.monthlyPrice && void savePlan(client, { monthlyPrice: Number(e.target.value) })}
                          className="mt-0.5 w-24 border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900 bg-white"
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
                          className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-800"
                          title={`${page.visits} visits`}
                        >
                          <span className="truncate max-w-[16rem]">{page.path}</span>
                          <span className="text-slate-400">{page.visits}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-400">
              Generated {fmtDate(data.generatedAt)}. Storage = the PDFs, photos and attachments stored in the database for each client.
              Per-client network/compute metering arrives when the Vercel billing API is wired in — visits, users and storage are live now.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{icon}{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
