"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, Eye, EyeOff, KeyRound, ExternalLink, ShieldCheck } from "lucide-react";

interface Entry {
  id: string;
  service: string;
  category: string;
  username: string | null;
  url: string | null;
  notes: string;
  hasSecret: boolean;
}

const CATS = [
  { value: "pos", label: "POS", icon: "🧾" },
  { value: "banking", label: "Banking", icon: "🏦" },
  { value: "delivery", label: "Delivery", icon: "🛵" },
  { value: "utility", label: "Utility", icon: "💡" },
  { value: "supplier", label: "Supplier", icon: "📦" },
  { value: "other", label: "Other", icon: "🔗" },
];
const cat = (v: string) => CATS.find((c) => c.value === v) ?? CATS[5];

export default function VaultPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [plaintextCount, setPlaintextCount] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [service, setService] = useState("");
  const [category, setCategory] = useState("pos");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/vault", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !body) {
        setError(body?.error ?? "Unable to load the vault.");
        setLoading(false);
        return;
      }
      setRows(body.entries ?? []);
      setPlaintextCount(body.plaintextCount ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!service.trim() || saving) return;
    setSaving(true);
    setError("");

    const res = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: service.trim(),
        category,
        username: username.trim() || null,
        secret: secret.trim(),
        url: url.trim() || null,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.entry) {
      setError(body?.error ?? "Could not save the entry.");
      setSaving(false);
      return;
    }

    setRows((r) => [...r, body.entry as Entry]);
    setService("");
    setUsername("");
    setSecret("");
    setUrl("");
    setSaving(false);
  }

  async function remove(id: string) {
    setError("");
    const res = await fetch(`/api/vault?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not delete the entry.");
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
    setRevealed((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    setShow((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }

  async function toggleReveal(entry: Entry) {
    const isShown = Boolean(show[entry.id]);
    if (isShown) {
      setShow((s) => ({ ...s, [entry.id]: false }));
      return;
    }
    if (revealed[entry.id] !== undefined) {
      setShow((s) => ({ ...s, [entry.id]: true }));
      return;
    }

    setError("");
    const res = await fetch("/api/vault/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || typeof body?.secret !== "string") {
      setError(body?.error ?? "Unable to reveal this secret.");
      return;
    }
    setRevealed((s) => ({ ...s, [entry.id]: body.secret }));
    setShow((s) => ({ ...s, [entry.id]: true }));
  }

  async function harden() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/vault/harden", { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Unable to encrypt existing entries.");
      setBusy(false);
      return;
    }
    setPlaintextCount(0);
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Login Vault" subtitle="POS, banking & delivery credentials · owner-tier only" action={<Badge accent="purple">{rows.length} logins</Badge>} />

      <Card className="p-4 bg-amber-50 border-amber-200 text-xs text-amber-800">
        🔐 Restricted to owners & corporate. Secrets are encrypted at rest and never leave the
        server unmasked — reveal only when needed.
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {plaintextCount > 0 && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 bg-purple-50 border-purple-200 text-xs text-purple-800">
          <span>
            {plaintextCount} entr{plaintextCount === 1 ? "y is" : "ies are"} still stored in
            plain text. Encrypt them now?
          </span>
          <Button accent="purple" onClick={harden} disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> {busy ? "Encrypting…" : "Encrypt now"}
          </Button>
        </Card>
      )}

      <Card className="p-5 animate-scale-in">
        <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500">Service</label>
            <Input accent="purple" value={service} onChange={(e) => setService(e.target.value)} placeholder="Square POS" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 bg-white outline-none focus:ring-2 focus:ring-purple-500">
              {CATS.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Username</label>
            <Input accent="purple" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin@btb.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Password / PIN</label>
            <Input accent="purple" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="••••••" />
          </div>
          <Button type="submit" accent="purple" disabled={saving} className="h-[46px]"><Plus className="w-4 h-4" /> {saving ? "Saving…" : "Add"}</Button>
        </form>
        <Input accent="purple" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Login URL (optional)" className="mt-3" />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {loading && (
          <Card className="p-10 text-center text-slate-400 col-span-full">Loading vault…</Card>
        )}
        {!loading && rows.length === 0 && (
          <Card className="p-10 text-center text-slate-400 col-span-full">
            <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-50" /> No logins stored yet.
          </Card>
        )}
        {rows.map((r) => (
          <Card key={r.id} className="p-4" hover>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl">{cat(r.category).icon}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{r.service}</p>
                  <p className="text-[10px] text-slate-400">{cat(r.category).label}</p>
                </div>
              </div>
              <button onClick={() => remove(r.id)} className="p-1 text-slate-300 hover:text-red-500" aria-label={`Delete ${r.service}`}><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="text-xs space-y-1">
              {r.username && <p className="text-slate-600 truncate">👤 {r.username}</p>}
              {r.hasSecret && (
                <div className="flex items-center gap-2 text-slate-600">
                  🔑 <span className="font-mono">{show[r.id] ? revealed[r.id] : "••••••••"}</span>
                  <button onClick={() => toggleReveal(r)} className="text-slate-400 hover:text-slate-700" aria-label={show[r.id] ? "Hide secret" : "Reveal secret"}>
                    {show[r.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-purple-600 hover:underline"><ExternalLink className="w-3 h-3" /> Open</a>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
