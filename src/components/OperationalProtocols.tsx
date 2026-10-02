"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, ListChecks, AlertTriangle, RefreshCw } from "lucide-react";

interface Protocol {
  id: string;
  title: string;
  icon: string;
  steps: string[];
  sort_order: number;
}

const COLS = "id, title, icon, steps, sort_order";
const LEGACY_KEY = "btb-outage-protocols";
const LEGACY_ICONS: Record<string, string> = { power: "🔌", internet: "📶", debit: "💳", phone: "☎️" };

// Seeded starters shown if the table is empty (client's "steps to do" list).
const STARTERS: Omit<Protocol, "id">[] = [
  { title: "Power Outage", icon: "🔌", sort_order: 1, steps: ["Stay calm, keep fridges/freezers closed", "Note the time power went out", "Call the utility (see Emergency Contacts)", "Check food temps after 2h — discard if above 4°C/40°F", "Switch POS to manual order pad"] },
  { title: "Internet / Wi-Fi Down", icon: "📶", sort_order: 2, steps: ["Restart the modem & router (wait 60s)", "Switch POS to offline mode", "Use mobile hotspot for card payments", "Call the ISP if not restored in 15 min"] },
  { title: "Debit / Card Machine Down", icon: "💳", sort_order: 3, steps: ["Verify Wi-Fi is up", "Restart the terminal", "Accept cash only if unresolved", "Call the POS/merchant support line"] },
  { title: "Phone Line Down", icon: "☎️", sort_order: 4, steps: ["Check handset & base power", "Forward calls to a manager mobile", "Post a notice for online orders", "Call the phone provider"] },
  { title: "Fire / Evacuation", icon: "🔥", sort_order: 5, steps: ["Pull the alarm and call 911", "Evacuate via the nearest exit — never use elevators", "Assemble at the parking lot sign; manager does a head count", "Do not re-enter until the fire department clears the building", "Call the owner/corporate once everyone is safe", "Report to the hood & fire suppression company (see Emergency Contacts)"] },
];

// Older builds stored edited protocols in localStorage only. Salvage them when
// the table is empty so the client's wording isn't lost.
function readLegacy(): Protocol[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const rows = parsed
      .map((p, i) => {
        const r = p as { title?: unknown; icon?: unknown; steps?: unknown };
        const steps = Array.isArray(r.steps) ? r.steps.filter((s): s is string => typeof s === "string") : [];
        const title = typeof r.title === "string" ? r.title : "";
        return {
          id: crypto.randomUUID(),
          title,
          icon: LEGACY_ICONS[String(r.icon)] || "⚠️",
          steps,
          sort_order: i + 1,
        } satisfies Protocol;
      })
      .filter((p) => p.title && p.steps.length);
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

function fallbackRows(): Protocol[] {
  return readLegacy() ?? STARTERS.map((s) => ({ ...s, id: crypto.randomUUID() }));
}

interface LoadResult {
  rows: Protocol[];
  error: string | null;
}

// Lives outside the component so the effect only calls setState inside the
// promise callback (react-hooks/set-state-in-effect).
async function fetchProtocols(readOnly: boolean): Promise<LoadResult> {
  try {
    let q = supabase
      .from("operational_protocols")
      .select(COLS)
      .order("sort_order")
      .order("created_at")
      .limit(50);
    // Bound the wait so a stalled network shows the retry banner instead of
    // holding the skeleton forever (guarded — old Safari lacks the API).
    if (typeof AbortSignal.timeout === "function") q = q.abortSignal(AbortSignal.timeout(8000));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (data && data.length) return { rows: data as Protocol[], error: null };
    const legacy = readLegacy();
    if (legacy && !readOnly) {
      // One-time salvage: write the localStorage rows into the empty table.
      const { error: insErr } = await supabase
        .from("operational_protocols")
        .insert(legacy.map((p) => ({ title: p.title, icon: p.icon, steps: p.steps, sort_order: p.sort_order })));
      if (!insErr) {
        const retry = await supabase.from("operational_protocols")
          .select(COLS).order("sort_order").order("created_at").limit(50);
        if (!retry.error && retry.data?.length) return { rows: retry.data as Protocol[], error: null };
      }
      return { rows: legacy, error: null };
    }
    return { rows: legacy ?? STARTERS.map((s) => ({ ...s, id: crypto.randomUUID() })), error: null };
  } catch (e) {
    return { rows: fallbackRows(), error: e instanceof Error ? e.message : "Couldn’t load protocols." };
  }
}

export default function OperationalProtocols({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchProtocols(readOnly).then((res) => {
      if (cancelled) return;
      setRows(res.rows);
      setError(res.error);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [readOnly, reloadKey]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const list = steps.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!title.trim() || !list.length) return;
    setSaving(true);
    setError(null);
    const payload = { title: title.trim(), icon: "⚠️", steps: list, sort_order: rows.length + 1 };
    const { data, error: err } = await supabase.from("operational_protocols").insert(payload)
      .select(COLS).single();
    if (err) {
      setError(`Couldn’t save “${payload.title}”: ${err.message}`);
    } else {
      setRows((r) => [...r, data as Protocol]);
      setTitle(""); setSteps("");
    }
    setSaving(false);
  }

  async function remove(id: string) {
    const snapshot = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    setError(null);
    const { error: err } = await supabase.from("operational_protocols").delete().eq("id", id);
    if (err) {
      setError(`Couldn’t delete: ${err.message}`);
      setRows(snapshot);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Emergency Protocols" subtitle="Step-by-step for power, internet, payments, phone & fire" action={<Badge accent="amber">{loading ? "…" : rows.length}</Badge>} />

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}</p>
          <Button accent="red" variant="soft" onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }}><RefreshCw className="w-4 h-4" /> Retry</Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <div className="h-5 w-2/5 rounded bg-slate-100 animate-pulse mb-4" />
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-4 w-full rounded bg-slate-100 animate-pulse mb-2" style={{ width: `${90 - j * 15}%` }} />
              ))}
            </Card>
          ))}
        </div>
      ) : (
        <>
          {!readOnly && (
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
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
            {rows.map((p) => (
              <Card key={p.id} className="p-5" hover>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2"><span className="text-xl">{p.icon}</span> {p.title}</h3>
                  {!readOnly && (
                    <button onClick={() => void remove(p.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
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
        </>
      )}
    </div>
  );
}
