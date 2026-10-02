"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, ChefHat, Flame } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { locationScope, activeLocationId } from "@/lib/locations";
import { buildParMaps, parFor } from "@/lib/par-prefill";

interface Row {
  id: string;
  item_name: string;
  par: number;
  on_hand: number;
  urgent: boolean;
}

// MAKE = PAR - ON_HAND (never negative).
const make = (r: Row) => Math.max(0, r.par - r.on_hand);
const today = () => new Date().toISOString().slice(0, 10);

// Everyone can view (staff/manager/owner edit; corporate is view-only — see
// btb-access.ts), so the gate blocks nobody here but computes `readOnly`.
// PAR is a manager decision, so the gate passes role too and only a manager
// can type it (staff get the prefilled value read-only).
export default function PrepCountPage() {
  return (
    <BtbFeatureGate feature="prep_count">
      {(readOnly, role) => <PrepCount readOnly={readOnly} canEditPar={role === "manager"} />}
    </BtbFeatureGate>
  );
}

function PrepCount({ readOnly, canEditPar }: { readOnly: boolean; canEditPar: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [maps, setMaps] = useState<ReturnType<typeof buildParMaps> | null>(null);
  const [name, setName] = useState("");
  const [par, setPar] = useState("");
  const [parTouched, setParTouched] = useState(false);
  const [oh, setOh] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Today's count for the active location (plus untagged legacy rows).
  useEffect(() => {
    const scope = locationScope();
    let q = supabase
      .from("prep_counts")
      .select("id, item_name, par, on_hand, urgent")
      .eq("count_date", today())
      .order("created_at");
    if (scope) q = q.or(scope);
    q.then(({ data, error: err }) => {
      if (err) setError("Couldn't load today's prep count — run supabase/schema-locations.sql, then reload.");
      else setRows((data as Row[]) ?? []);
    });
  }, []);

  // History for PAR prefill: same-weekday first, most recent otherwise.
  useEffect(() => {
    const scope = locationScope();
    let q = supabase
      .from("prep_counts")
      .select("item_name, par, urgent, count_date, created_at")
      .neq("count_date", today())
      .order("count_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (scope) q = q.or(scope);
    // ParPrefillRow dates come from count_date — rename on the way out.
    q.then(({ data }) => {
      const rows = (data ?? []) as { item_name: string; par: number; urgent?: boolean | null; count_date: string }[];
      setMaps(
        buildParMaps(
          rows.map((r) => ({ item_name: r.item_name, par: r.par, urgent: r.urgent, date: r.count_date })),
          today(),
        ),
      );
    });
  }, []);

  function onNameChange(value: string) {
    setName(value);
    if (parTouched || !maps) return;
    const snap = parFor(maps, value);
    if (snap) setPar(String(snap.par));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || !name.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      item_name: name.trim(),
      par: Number(par) || 0,
      on_hand: Number(oh) || 0,
      urgent,
      count_date: today(),
      location_id: activeLocationId(),
    };
    const { data, error: err } = await supabase
      .from("prep_counts")
      .insert(payload)
      .select("id, item_name, par, on_hand, urgent")
      .single();
    if (err) {
      setError("Couldn't save — run supabase/schema-locations.sql if you haven't, then retry.");
      setSaving(false);
      return;
    }
    setRows((r) => [...r, data as Row]);
    setName(""); setPar(""); setOh(""); setParTouched(false); setUrgent(false);
    setSaving(false);
  }

  async function remove(id: string) {
    if (readOnly) return;
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("prep_counts").delete().eq("id", id);
  }

  const totalMake = rows.reduce((s, r) => s + make(r), 0);
  const knownNames = maps ? [...maps.latest.keys()] : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <PageHeader
        title="Daily Prep Count"
        subtitle="MAKE = PAR − ON HAND · records kept 7 days"
        action={<Badge accent="red">{rows.length} items · make {totalMake}</Badge>}
      />

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!readOnly && (
        <Card className="p-5 mb-5 animate-scale-in">
          <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-end">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-slate-500">Item</label>
              <Input
                accent="red"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Beef patties"
                list="prep-known-items"
              />
              <datalist id="prep-known-items">
                {knownNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">PAR</label>
              <Input
                accent="red"
                type="number"
                inputMode="numeric"
                value={par}
                onChange={(e) => { setPar(e.target.value); setParTouched(true); }}
                placeholder="0"
                disabled={!canEditPar}
                title={canEditPar ? undefined : "PAR is set by a manager"}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">On hand</label>
              <Input accent="red" type="number" inputMode="numeric" value={oh} onChange={(e) => setOh(e.target.value)} placeholder="0" />
            </div>
            <label className="flex items-center gap-1.5 h-[46px] px-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              <span className="text-xs font-medium text-slate-500">Urgent</span>
            </label>
            <Button type="submit" accent="red" disabled={saving} className="h-[46px]"><Plus className="w-4 h-4" /> Add</Button>
          </form>
        </Card>
      )}

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
              <p className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                {r.urgent && <Flame className="w-4 h-4 text-red-500 shrink-0" aria-label="Urgent" />}
                {r.item_name}
              </p>
              <p className="text-xs text-slate-500">PAR {r.par} · On hand {r.on_hand}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-red-600 leading-none tabular-nums">{make(r)}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">make</p>
            </div>
            {readOnly ? (
              <span className="w-9" />
            ) : (
              <button onClick={() => remove(r.id)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
