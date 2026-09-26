"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, Eye, EyeOff, KeyRound, ExternalLink } from "lucide-react";

interface Entry {
  id: string;
  service: string;
  category: string;
  username: string | null;
  secret: string | null;
  url: string | null;
  notes: string;
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
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [service, setService] = useState("");
  const [category, setCategory] = useState("pos");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("login_vault")
      .select("id, service, category, username, secret, url, notes")
      .order("service")
      .then(({ data }) => data && setRows(data as Entry[]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!service.trim()) return;
    setSaving(true);
    const payload = { service: service.trim(), category, username: username.trim() || null, secret: secret.trim() || null, url: url.trim() || null, notes: "" };
    const { data } = await supabase.from("login_vault").insert(payload)
      .select("id, service, category, username, secret, url, notes").single();
    setRows((r) => [...r, (data as Entry) ?? { id: crypto.randomUUID(), ...payload } as Entry]);
    setService(""); setUsername(""); setSecret(""); setUrl("");
    setSaving(false);
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("login_vault").delete().eq("id", id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Login Vault" subtitle="POS, banking & delivery credentials · owner-tier only" action={<Badge accent="purple">{rows.length} logins</Badge>} />

      <Card className="p-4 bg-amber-50 border-amber-200 text-xs text-amber-800">
        🔐 Restricted to owners & corporate. Secrets are masked by default — reveal only when needed.
      </Card>

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
            <Input accent="purple" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="••••••" />
          </div>
          <Button type="submit" accent="purple" disabled={saving} className="h-[46px]"><Plus className="w-4 h-4" /> Add</Button>
        </form>
        <Input accent="purple" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Login URL (optional)" className="mt-3" />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {rows.length === 0 && (
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
              <button onClick={() => remove(r.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="text-xs space-y-1">
              {r.username && <p className="text-slate-600 truncate">👤 {r.username}</p>}
              {r.secret && (
                <div className="flex items-center gap-2 text-slate-600">
                  🔑 <span className="font-mono">{reveal[r.id] ? r.secret : "••••••••"}</span>
                  <button onClick={() => setReveal((s) => ({ ...s, [r.id]: !s[r.id] }))} className="text-slate-400 hover:text-slate-700">
                    {reveal[r.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
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
