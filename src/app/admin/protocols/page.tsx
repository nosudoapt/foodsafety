"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, ListChecks } from "lucide-react";

interface Protocol {
  id: string;
  title: string;
  icon: string;
  steps: string[];
  sort_order: number;
}

// Seeded starters shown if the table is empty (client's "steps to do" list).
const STARTERS: Omit<Protocol, "id">[] = [
  { title: "Power Outage", icon: "🔌", sort_order: 1, steps: ["Stay calm, keep fridges/freezers closed", "Note the time power went out", "Call the utility (see Emergency Contacts)", "Check food temps after 2h — discard if above 4°C/40°F", "Switch POS to manual order pad"] },
  { title: "Internet / Wi-Fi Down", icon: "📶", sort_order: 2, steps: ["Restart the modem & router (wait 60s)", "Switch POS to offline mode", "Use mobile hotspot for card payments", "Call the ISP if not restored in 15 min"] },
  { title: "Debit / Card Machine Down", icon: "💳", sort_order: 3, steps: ["Verify Wi-Fi is up", "Restart the terminal", "Accept cash only if unresolved", "Call the POS/merchant support line"] },
  { title: "Phone Line Down", icon: "☎️", sort_order: 4, steps: ["Check handset & base power", "Forward calls to a manager mobile", "Post a notice for online orders", "Call the phone provider"] },
];

export default function ProtocolsPage() {
  const [rows, setRows] = useState<Protocol[]>([]);
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("operational_protocols")
      .select("id, title, icon, steps, sort_order")
      .order("sort_order")
      .then(({ data }) => {
        if (data && data.length) setRows(data as Protocol[]);
        else setRows(STARTERS.map((s) => ({ ...s, id: crypto.randomUUID() })));
      });
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const list = steps.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!title.trim() || !list.length) return;
    setSaving(true);
    const payload = { title: title.trim(), icon: "⚠️", steps: list, sort_order: rows.length + 1 };
    const { data } = await supabase.from("operational_protocols").insert(payload)
      .select("id, title, icon, steps, sort_order").single();
    setRows((r) => [...r, (data as Protocol) ?? { id: crypto.randomUUID(), ...payload } as Protocol]);
    setTitle(""); setSteps("");
    setSaving(false);
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("operational_protocols").delete().eq("id", id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Emergency Protocols" subtitle="Step-by-step for power, internet, payments & phone outages" action={<Badge accent="amber">{rows.length}</Badge>} />

      <Card className="p-5 animate-scale-in">
        <form onSubmit={add} className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-slate-500">Protocol title</label>
              <Input accent="amber" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gas Leak" />
            </div>
            <Button type="submit" accent="amber" disabled={saving} className="h-[46px]"><Plus className="w-4 h-4" /> Add</Button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Steps (one per line)</label>
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={3}
              placeholder={"Evacuate the building\nCall 911\nShut off the gas valve"}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 bg-white outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
        {rows.map((p) => (
          <Card key={p.id} className="p-5" hover>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><span className="text-xl">{p.icon}</span> {p.title}</h3>
              <button onClick={() => remove(p.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <ol className="space-y-2">
              {p.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
        {rows.length === 0 && (
          <Card className="p-10 text-center text-slate-400 md:col-span-2">
            <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-50" /> No protocols yet.
          </Card>
        )}
      </div>
    </div>
  );
}
