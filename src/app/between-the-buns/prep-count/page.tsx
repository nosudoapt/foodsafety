"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, ChefHat } from "lucide-react";

interface Row {
  id: string;
  item_name: string;
  par: number;
  on_hand: number;
}

// MAKE = PAR - ON_HAND (never negative).
const make = (r: Row) => Math.max(0, r.par - r.on_hand);
const today = () => new Date().toISOString().slice(0, 10);

export default function PrepCount() {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [par, setPar] = useState("");
  const [oh, setOh] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("prep_counts")
      .select("id, item_name, par, on_hand")
      .eq("count_date", today())
      .order("created_at")
      .then(({ data }) => data && setRows(data as Row[]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = { item_name: name.trim(), par: Number(par) || 0, on_hand: Number(oh) || 0, count_date: today() };
    const { data } = await supabase.from("prep_counts").insert(payload).select("id, item_name, par, on_hand").single();
    setRows((r) => [...r, (data as Row) ?? { id: crypto.randomUUID(), ...payload }]);
    setName(""); setPar(""); setOh("");
    setSaving(false);
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("prep_counts").delete().eq("id", id);
  }

  const totalMake = rows.reduce((s, r) => s + make(r), 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <PageHeader
        title="Daily Prep Count"
        subtitle="MAKE = PAR − ON HAND · records kept 7 days"
        action={<Badge accent="red">{rows.length} items · make {totalMake}</Badge>}
      />

      <Card className="p-5 mb-5 animate-scale-in">
        <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs font-medium text-slate-500">Item</label>
            <Input accent="red" value={name} onChange={(e) => setName(e.target.value)} placeholder="Beef patties" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">PAR</label>
            <Input accent="red" type="number" inputMode="numeric" value={par} onChange={(e) => setPar(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">On hand</label>
            <Input accent="red" type="number" inputMode="numeric" value={oh} onChange={(e) => setOh(e.target.value)} placeholder="0" />
          </div>
          <Button type="submit" accent="red" disabled={saving} className="h-[46px]"><Plus className="w-4 h-4" /> Add</Button>
        </form>
      </Card>

      <div className="space-y-2 stagger">
        {rows.length === 0 && (
          <Card className="p-10 text-center text-slate-400">
            <ChefHat className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No items yet — add your first prep item above.
          </Card>
        )}
        {rows.map((r) => (
          <Card key={r.id} className="p-4 flex items-center gap-4" hover>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">{r.item_name}</p>
              <p className="text-xs text-slate-500">PAR {r.par} · On hand {r.on_hand}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-red-600 leading-none tabular-nums">{make(r)}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">make</p>
            </div>
            <button onClick={() => remove(r.id)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
