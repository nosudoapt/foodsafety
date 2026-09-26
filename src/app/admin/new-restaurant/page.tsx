"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";

interface Task { id: string; phase: string; task: string; done: boolean; sort_order: number; }

const PHASES = ["Legal & Permits", "Build-out", "Equipment", "Hiring & Training", "Marketing", "Launch"];

// Starter checklist seeded when the table is empty.
const STARTERS: { phase: string; task: string }[] = [
  { phase: "Legal & Permits", task: "Register business & get business license" },
  { phase: "Legal & Permits", task: "Apply for health/food permit" },
  { phase: "Legal & Permits", task: "Secure business insurance" },
  { phase: "Legal & Permits", task: "Sign lease agreement" },
  { phase: "Build-out", task: "Kitchen hood & fire suppression install + inspection" },
  { phase: "Equipment", task: "Order POS + set up merchant account" },
  { phase: "Hiring & Training", task: "Hire staff & collect food-handler certs" },
  { phase: "Hiring & Training", task: "Run handbook acknowledgement" },
  { phase: "Marketing", task: "Set up Google Business + delivery apps" },
  { phase: "Launch", task: "Soft-open dry run & final health inspection" },
];

export default function NewRestaurantPage() {
  const [rows, setRows] = useState<Task[]>([]);
  const [task, setTask] = useState("");
  const [phase, setPhase] = useState(PHASES[0]);

  useEffect(() => {
    supabase.from("new_restaurant_tasks").select("id, phase, task, done, sort_order").order("sort_order")
      .then(({ data }) => {
        if (data && data.length) setRows(data as Task[]);
        else setRows(STARTERS.map((s, i) => ({ id: crypto.randomUUID(), done: false, sort_order: i, ...s })));
      });
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) return;
    const payload = { phase, task: task.trim(), done: false, sort_order: rows.length };
    const { data } = await supabase.from("new_restaurant_tasks").insert(payload)
      .select("id, phase, task, done, sort_order").single();
    setRows((r) => [...r, (data as Task) ?? { id: crypto.randomUUID(), ...payload } as Task]);
    setTask("");
  }

  async function toggle(t: Task) {
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await supabase.from("new_restaurant_tasks").update({ done: !t.done }).eq("id", t.id);
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("new_restaurant_tasks").delete().eq("id", id);
  }

  const done = rows.filter((r) => r.done).length;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Open a New Restaurant" subtitle="End-to-end launch checklist" action={<Badge accent={pct === 100 ? "green" : "amber"}>{pct}% complete</Badge>} />

      <Card className="p-4">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-2">{done} of {rows.length} tasks done</p>
      </Card>

      <Card className="p-5 animate-scale-in">
        <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500">Phase</label>
            <select value={phase} onChange={(e) => setPhase(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 bg-white outline-none focus:ring-2 focus:ring-green-500">
              {PHASES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Task</label>
            <Input accent="green" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Add a launch task" />
          </div>
          <Button type="submit" accent="green" className="h-[46px]"><Plus className="w-4 h-4" /> Add</Button>
        </form>
      </Card>

      <div className="space-y-6">
        {PHASES.map((p) => {
          const items = rows.filter((r) => r.phase === p);
          if (!items.length) return null;
          return (
            <div key={p}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{p}</p>
              <Card className="divide-y divide-slate-100 stagger">
                {items.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => toggle(t)} className={t.done ? "text-green-600" : "text-slate-300 hover:text-slate-500"}>
                      {t.done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>
                    <span className={`flex-1 text-sm ${t.done ? "line-through text-slate-400" : "text-slate-900"}`}>{t.task}</span>
                    <button onClick={() => remove(t.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
