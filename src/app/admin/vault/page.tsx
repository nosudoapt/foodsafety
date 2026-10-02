"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, Eye, EyeOff, KeyRound, ExternalLink, ShieldCheck, X } from "lucide-react";
import {
  VAULT_CATEGORIES,
  LEGACY_VAULT_CATEGORIES,
  vaultCategory,
  type VaultCategory,
} from "@/lib/vault-categories";

interface Entry {
  id: string;
  service: string;
  category: string;
  username: string | null;
  url: string | null;
  notes: string;
  hasSecret: boolean;
}

export default function VaultPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [plaintextCount, setPlaintextCount] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  // Add flow: the category dropdown is gone — pick from the flat list instead.
  const [adding, setAdding] = useState(false);
  const [formCat, setFormCat] = useState<string | null>(null);
  const [service, setService] = useState("");
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
    if (!service.trim() || !formCat || saving) return;
    setSaving(true);
    setError("");

    const res = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: service.trim(),
        category: formCat,
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
    setFormCat(null);
    setAdding(false);
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

  function openAdd(category?: string) {
    setAdding(true);
    setFormCat(category ?? null);
    setError("");
  }

  // Flat list: every category the location should have, then any legacy bucket
  // that still holds rows so nothing in the vault becomes unreachable.
  const legacyInUse = LEGACY_VAULT_CATEGORIES.filter((c) =>
    rows.some((r) => r.category === c.value)
  );
  const listed: VaultCategory[] = [...VAULT_CATEGORIES, ...legacyInUse];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Login Vault"
        subtitle="POS, banking & delivery credentials · owner-tier only"
        action={
          <div className="flex items-center gap-2">
            <Badge accent="purple">{rows.length} logins</Badge>
            <Button accent="purple" onClick={() => openAdd()}>
              <Plus className="w-4 h-4" /> Add Login
            </Button>
          </div>
        }
      />

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

      {/* Add login — flat category picker, then the fields for that category */}
      {adding && (
        <Card className="p-5 animate-scale-in">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900">Add login</h3>
              {formCat && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
                  {vaultCategory(formCat).icon} {vaultCategory(formCat).label}
                  <button
                    onClick={() => setFormCat(null)}
                    className="hover:text-purple-900"
                    aria-label="Choose a different category"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setAdding(false);
                setFormCat(null);
              }}
              className="text-xs font-medium text-slate-400 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>

          {formCat === null ? (
            <div>
              <p className="text-xs text-slate-500 mb-3">Which login are you adding?</p>
              <div className="flex flex-wrap gap-2">
                {VAULT_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setFormCat(c.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-purple-400 hover:bg-purple-50"
                  >
                    <span className="mr-1.5">{c.icon}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-slate-500">Service</label>
                <Input accent="purple" value={service} onChange={(e) => setService(e.target.value)} placeholder="Square POS" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Username</label>
                <Input accent="purple" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin@btb.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Password / PIN</label>
                <Input accent="purple" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="••••••" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Login URL</label>
                <Input accent="purple" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Optional" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" accent="purple" disabled={saving} className="w-full sm:w-auto">
                  <Plus className="w-4 h-4" /> {saving ? "Saving…" : "Save login"}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* Flat list of categories — stored logins or a visible missing state */}
      <div className="space-y-3 stagger">
        {loading && (
          <Card className="p-10 text-center text-slate-400">Loading vault…</Card>
        )}

        {!loading &&
          listed.map((cat) => {
            const entries = rows.filter((r) => r.category === cat.value);
            return (
              <Card key={cat.value} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{cat.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{cat.label}</p>
                      <p className="text-[11px] text-slate-400">
                        {entries.length === 0
                          ? "No login stored"
                          : `${entries.length} login${entries.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </div>
                  <Button accent="purple" variant="soft" onClick={() => openAdd(cat.value)} className="shrink-0">
                    <Plus className="w-4 h-4" /> Add Login
                  </Button>
                </div>

                {entries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
                    <KeyRound className="w-5 h-5 mx-auto text-slate-300 mb-1" />
                    <p className="text-xs font-medium text-slate-500">
                      Missing — no {cat.label} login yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{r.service}</p>
                          {r.username && (
                            <p className="text-[11px] text-slate-500 truncate">👤 {r.username}</p>
                          )}
                        </div>
                        {r.hasSecret && (
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="font-mono">
                              {show[r.id] ? revealed[r.id] : "••••••••"}
                            </span>
                            <button
                              onClick={() => toggleReveal(r)}
                              className="text-slate-400 hover:text-slate-700"
                              aria-label={show[r.id] ? "Hide secret" : "Reveal secret"}
                            >
                              {show[r.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                        {r.url && (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" /> Open
                          </a>
                        )}
                        <button
                          onClick={() => remove(r.id)}
                          className="p-1 text-slate-300 hover:text-red-500"
                          aria-label={`Delete ${r.service}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
