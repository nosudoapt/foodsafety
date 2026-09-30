"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, Phone, Star } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  role: string | null;
  phone: string;
  kind: "person" | "service";
  rank: number;
  notes: string;
}

export default function EmergencyContacts({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"person" | "service">("person");
  const [rank, setRank] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("emergency_contacts")
      .select("id, name, role, phone, kind, rank, notes")
      .order("rank")
      .then(({ data }) => data && setRows(data as Contact[]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), role: role.trim() || null, phone: phone.trim(), kind, rank: Number(rank) || 1, notes: "" };
    const { data } = await supabase.from("emergency_contacts").insert(payload)
      .select("id, name, role, phone, kind, rank, notes").single();
    setRows((r) => [...r, (data as Contact) ?? { id: crypto.randomUUID(), ...payload } as Contact].sort((a, b) => a.rank - b.rank));
    setName(""); setRole(""); setPhone(""); setRank("1");
    setSaving(false);
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("emergency_contacts").delete().eq("id", id);
  }

  const people = rows.filter((r) => r.kind === "person");
  const services = rows.filter((r) => r.kind === "service");

  const list = (title: string, items: Contact[]) => (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2 stagger">
        {items.length === 0 && <Card className="p-6 text-center text-slate-400 text-sm">None yet.</Card>}
        {items.map((r) => (
          <Card key={r.id} className="p-4 flex items-center gap-3" hover>
            {r.rank === 1 && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">{r.name}</p>
              <p className="text-xs text-slate-500">{r.role || (r.kind === "service" ? "Service" : "Contact")} · Priority {r.rank}</p>
            </div>
            <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-100 px-3 py-1.5 rounded-xl hover:brightness-95">
              <Phone className="w-4 h-4" /> {r.phone}
            </a>
            {!readOnly && (
              <button onClick={() => remove(r.id)} className="p-1.5 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Emergency Contacts" subtitle="Tap any number to call · priority-ordered" action={<Badge accent="red">{rows.length}</Badge>} />

      {!readOnly && (
        <Card className="p-5 animate-scale-in">
          <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-end">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-slate-500">Name</label>
              <Input accent="red" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Owner / Gas Company" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Role</label>
              <Input accent="red" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Owner" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Phone</label>
              <Input accent="red" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-0100" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Priority</label>
              <Input accent="red" type="number" inputMode="numeric" value={rank} onChange={(e) => setRank(e.target.value)} className="w-16" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as "person" | "service")}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 bg-white outline-none focus:ring-2 focus:ring-red-500">
                <option value="person">Person</option>
                <option value="service">Service</option>
              </select>
            </div>
            <Button type="submit" accent="red" disabled={saving} className="h-[46px] col-span-2 sm:col-span-1"><Plus className="w-4 h-4" /> Add</Button>
          </form>
        </Card>
      )}

      {list("People", people)}
      {list("Services & Utilities", services)}
    </div>
  );
}
