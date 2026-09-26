"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import {
  COMPLIANCE_TYPES, complianceType, expiryLevel, expiryLabel,
  LEVEL_ACCENT, daysUntil, type ExpiryLevel,
} from "@/lib/expiry";
import { Plus, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";

interface Doc {
  id: string;
  doc_type: string;
  name: string;
  file_name: string | null;
  expiry_date: string | null;
  notes: string;
}

const RANK: Record<ExpiryLevel, number> = { expired: 0, critical: 1, warning: 2, ok: 3, none: 4 };

export default function CompliancePage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [type, setType] = useState(COMPLIANCE_TYPES[0].value);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("compliance_documents")
      .select("id, doc_type, name, file_name, expiry_date, notes")
      .then(({ data }) => data && setRows(data as Doc[]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = { doc_type: type, name: name.trim(), expiry_date: expiry || null, notes: notes.trim() };
    const { data } = await supabase.from("compliance_documents").insert(payload)
      .select("id, doc_type, name, file_name, expiry_date, notes").single();
    setRows((r) => [(data as Doc) ?? { id: crypto.randomUUID(), file_name: null, ...payload } as Doc, ...r]);
    setName(""); setExpiry(""); setNotes("");
    setSaving(false);
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("compliance_documents").delete().eq("id", id);
  }

  // Sort by urgency: expired first, then critical, warning, ok.
  const sorted = [...rows].sort((a, b) => {
    const la = expiryLevel(a.expiry_date, complianceType(a.doc_type).notifyDays);
    const lb = expiryLevel(b.expiry_date, complianceType(b.doc_type).notifyDays);
    if (RANK[la] !== RANK[lb]) return RANK[la] - RANK[lb];
    return (daysUntil(a.expiry_date) ?? 1e9) - (daysUntil(b.expiry_date) ?? 1e9);
  });

  const alerts = sorted.filter((r) => {
    const l = expiryLevel(r.expiry_date, complianceType(r.doc_type).notifyDays);
    return l === "expired" || l === "critical" || l === "warning";
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance & Renewals"
        subtitle="Every license, permit & agreement with live expiry alerts"
        action={<Badge accent={alerts.length ? "red" : "green"}>{alerts.length ? `${alerts.length} need attention` : "All current"}</Badge>}
      />

      {alerts.length > 0 && (
        <Card className="p-4 bg-red-50 border-red-200 animate-fade-in">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4" /> Action needed
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((r) => {
              const l = expiryLevel(r.expiry_date, complianceType(r.doc_type).notifyDays);
              return <Badge key={r.id} accent={LEVEL_ACCENT[l]}>{complianceType(r.doc_type).icon} {r.name} · {expiryLabel(r.expiry_date)}</Badge>;
            })}
          </div>
        </Card>
      )}

      <Card className="p-5 animate-scale-in">
        <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 bg-white outline-none focus:ring-2 focus:ring-red-500">
              {COMPLIANCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Name</label>
            <Input accent="red" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Health Permit" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Expiry</label>
            <Input accent="red" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <Button type="submit" accent="red" disabled={saving} className="h-[46px]"><Plus className="w-4 h-4" /> Add</Button>
        </form>
      </Card>

      {sorted.length === 0 && (
        <Card className="p-10 text-center text-slate-400">
          <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No compliance documents yet.
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {sorted.map((r) => {
          const t = complianceType(r.doc_type);
          const l = expiryLevel(r.expiry_date, t.notifyDays);
          return (
            <Card key={r.id} className="p-4" hover>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl">{t.icon}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{r.name}</p>
                    <p className="text-[10px] text-slate-400">{t.label}</p>
                  </div>
                </div>
                <button onClick={() => remove(r.id)} className="p-1 text-slate-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{r.expiry_date ?? "No expiry"}</span>
                <Badge accent={LEVEL_ACCENT[l]}>{expiryLabel(r.expiry_date)}</Badge>
              </div>
              {r.notes && <p className="text-xs text-slate-500 mt-2">{r.notes}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
