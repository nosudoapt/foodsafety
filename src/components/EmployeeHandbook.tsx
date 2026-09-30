"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { PenLine, CheckCircle2, BookOpen } from "lucide-react";

interface Handbook { id: string; title: string; version: string; body: string | null; }
interface Sig { id: string; staff_name: string; signature: string; signed_at: string; }

const FALLBACK_BODY = `Welcome to Between the Buns.

1. Hygiene — wash hands on entry, after breaks, and between raw and ready-to-eat foods.
2. Uniform — clean apron, hat/hairnet, no jewellery on the line.
3. Temperatures — log fridge/freezer temps twice daily. Cook to safe internal temps.
4. Allergens — always check the allergen chart before serving.
5. Safety — report spills, injuries and equipment faults to a manager immediately.

By signing below you confirm you have read and understood this handbook.`;

export default function EmployeeHandbook({ readOnly = false }: { readOnly?: boolean }) {
  void readOnly; // handbook has no document edit controls; signing stays available in read-only mode
  const [book, setBook] = useState<Handbook | null>(null);
  const [sigs, setSigs] = useState<Sig[]>([]);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("handbook_documents").select("id, title, version, body").order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => {
        const b = (data?.[0] as Handbook) ?? { id: "default", title: "Employee Handbook", version: "1.0", body: FALLBACK_BODY };
        setBook(b);
        if (b.id !== "default") {
          supabase.from("handbook_signatures").select("id, staff_name, signature, signed_at").eq("handbook_id", b.id).order("signed_at", { ascending: false })
            .then(({ data: s }) => s && setSigs(s as Sig[]));
        }
      });
  }, []);

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (!book || !name.trim() || signature.trim().toLowerCase() !== name.trim().toLowerCase()) {
      alert("Type your full name in both fields to sign."); return;
    }
    setSaving(true);
    const payload = { handbook_id: book.id === "default" ? null : book.id, staff_name: name.trim(), signature: signature.trim() };
    const { data } = await supabase.from("handbook_signatures").insert(payload)
      .select("id, staff_name, signature, signed_at").single();
    setSigs((s) => [(data as Sig) ?? { id: crypto.randomUUID(), signed_at: new Date().toISOString(), ...payload } as Sig, ...s]);
    setName(""); setSignature("");
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={book?.title ?? "Employee Handbook"} subtitle={`Version ${book?.version ?? "1.0"} · read & acknowledge`} action={<Badge accent="blue">{sigs.length} signed</Badge>} />

      <Card className="p-6 animate-fade-in">
        <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-3"><BookOpen className="w-4 h-4" /> Handbook</div>
        <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">{book?.body ?? FALLBACK_BODY}</pre>
      </Card>

      <Card className="p-5 animate-scale-in">
        <div className="flex items-center gap-2 text-slate-900 font-semibold mb-3"><PenLine className="w-4 h-4" /> Sign acknowledgement</div>
        <form onSubmit={sign} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500">Full name</label>
            <Input accent="blue" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Staff" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Type name again to sign</label>
            <Input accent="blue" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Alex Staff" />
          </div>
          <Button type="submit" accent="blue" disabled={saving} className="h-[46px]">Sign</Button>
        </form>
      </Card>

      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Signature record</p>
        <Card className="divide-y divide-slate-100 stagger">
          {sigs.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">No signatures yet.</div>}
          {sigs.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="flex-1 font-medium text-slate-900">{s.staff_name}</span>
              <span className="italic text-slate-500 text-sm">{s.signature}</span>
              <span className="text-xs text-slate-400">{new Date(s.signed_at).toLocaleDateString()}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
