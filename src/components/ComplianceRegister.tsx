"use client";

// Compliance & Renewals — the flat list of everything that has an expiry date.
// Split from Business Documents (plain files, expiry_date IS NULL): the query
// below filters `expiry_date IS NOT NULL`, so the two views can never overlap.
// No dropdowns (client request): new entries default doc_type "other", which
// carries the generic 60-day reminder window in lib/expiry.ts.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import {
  DOC_ROUTING_HINT, complianceType, expiryLevel, expiryLabel,
  LEVEL_ACCENT, sortByUrgency, alertsFrom,
} from "@/lib/expiry";
import { Plus, Trash2, ShieldCheck, AlertTriangle, Info } from "lucide-react";

interface Doc {
  id: string;
  doc_type: string;
  name: string;
  file_name: string | null;
  expiry_date: string | null;
  notes: string;
}

export default function ComplianceRegister({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<Doc[]>([]);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Only expiring items — everything without a date lives in Business Documents.
  useEffect(() => {
    supabase
      .from("compliance_documents")
      .select("id, doc_type, name, file_name, expiry_date, notes")
      .not("expiry_date", "is", null)
      .then(({ data }) => data && setRows(data as Doc[]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    // Expiry is required: a null date would be filtered straight back out.
    if (!name.trim() || !expiry) return;
    setSaving(true);
    const payload = { doc_type: "other", name: name.trim(), expiry_date: expiry, notes: notes.trim() };
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

  // Sort by urgency (expired first) and surface the ones that need attention.
  const sorted = sortByUrgency(rows, (r) => r.doc_type, (r) => r.expiry_date);
  const alerts = alertsFrom(rows, (r) => r.doc_type, (r) => r.expiry_date);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance & Renewals"
        subtitle="Items with Expiry & Renewal Dates"
        action={<Badge accent={alerts.length ? "red" : "green"}>{alerts.length ? `${alerts.length} need attention` : "All current"}</Badge>}
      />

      <p className="text-xs text-slate-500 -mt-3 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px text-slate-400" />
        <span>{DOC_ROUTING_HINT}</span>
      </p>

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

      {!readOnly && (
        <Card className="p-5 animate-scale-in">
          <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-slate-500">Name</label>
              <Input accent="red" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Health Permit" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Expiry</label>
              <Input accent="red" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
            <Button type="submit" accent="red" disabled={saving || !name.trim() || !expiry} className="h-[46px]"><Plus className="w-4 h-4" /> Add</Button>
          </form>
        </Card>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Items with Expiry &amp; Renewal Dates
        </p>
        {sorted.length === 0 && (
          <Card className="p-10 text-center text-slate-400">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No items with an expiry date yet.
          </Card>
        )}
        <div className="space-y-2 stagger">
          {sorted.map((r) => {
            const t = complianceType(r.doc_type);
            const l = expiryLevel(r.expiry_date, t.notifyDays);
            return (
              <Card key={r.id} className="p-4 flex items-center gap-4" hover>
                <span className="text-2xl shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{r.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {r.expiry_date}
                    {r.notes && ` · ${r.notes}`}
                  </p>
                </div>
                <Badge accent={LEVEL_ACCENT[l]}>{expiryLabel(r.expiry_date)}</Badge>
                {readOnly ? (
                  <span className="w-9" />
                ) : (
                  <button onClick={() => remove(r.id)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
