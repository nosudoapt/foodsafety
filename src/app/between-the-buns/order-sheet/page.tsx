"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, ClipboardList } from "lucide-react";

interface Row {
  id: string;
  item_name: string;
  par: number;
  on_hand: number;
  order_date: string;
}

// ORDER = PAR - ON_HAND (never negative).
const order = (r: Row) => Math.max(0, r.par - r.on_hand);
const today = () => new Date().toISOString().slice(0, 10);

export default function OrderSheet() {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [par, setPar] = useState("");
  const [oh, setOh] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("order_sheets")
      .select("id, item_name, par, on_hand, order_date")
      .order("order_date", { ascending: false })
      .then(({ data }) => data && setRows(data as Row[]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = { item_name: name.trim(), par: Number(par) || 0, on_hand: Number(oh) || 0, order_date: today() };
    const { data } = await supabase.from("order_sheets").insert(payload).select("id, item_name, par, on_hand, order_date").single();
    setRows((r) => [(data as Row) ?? { id: crypto.randomUUID(), ...payload }, ...r]);
    setName(""); setPar(""); setOh("");
    setSaving(false);
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("order_sheets").delete().eq("id", id);
  }

  // Group by date for the 3-month rolling record.
  const byDate = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.order_date] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <PageHeader
        title="Order Sheet"
        subtitle="ORDER = PAR − ON HAND · 3 months of records"
        action={<Badge accent="red">{rows.length} lines</Badge>}
      />

      <Card className="p-5 mb-6 animate-scale-in">
        <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs font-medium text-slate-500">Item</label>
            <Input accent="red" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sesame buns (case)" />
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

      {rows.length === 0 && (
        <Card className="p-10 text-center text-slate-400">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No order lines yet.
        </Card>
      )}

      <div className="space-y-6">
        {Object.entries(byDate).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{date}</p>
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase">
                <span>Item</span><span className="text-right w-12">PAR</span><span className="text-right w-12">OH</span><span className="text-right w-14">Order</span><span className="w-6" />
              </div>
              <div className="divide-y divide-slate-100 stagger">
                {items.map((r) => (
                  <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center">
                    <span className="font-medium text-slate-900 truncate">{r.item_name}</span>
                    <span className="text-right w-12 tabular-nums text-slate-600">{r.par}</span>
                    <span className="text-right w-12 tabular-nums text-slate-600">{r.on_hand}</span>
                    <span className="text-right w-14 tabular-nums font-bold text-red-600">{order(r)}</span>
                    <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition w-6">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
