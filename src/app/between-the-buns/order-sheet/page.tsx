"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Search, Save, ClipboardList, Check } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { BROOKS_ORDER_GUIDE, ORDER_GUIDE_ITEM_COUNT } from "@/lib/brooks-order-guide";

interface Entry {
  par: number;
  on_hand: number;
}

interface HistoryRow {
  id: string;
  item_name: string;
  par: number;
  on_hand: number;
  order_date: string;
}

// ORDER = PAR - ON_HAND (never negative) — same rule as the prep sheet's MAKE.
const orderQty = (e: Entry) => Math.max(0, (e.par || 0) - (e.on_hand || 0));
const today = () => new Date().toISOString().slice(0, 10);

// MGMT-only surface (see btb-access.ts): staff never reach it, corporate is
// view-only — the gate resolves the role and hands us `readOnly`.
export default function OrderSheetPage() {
  return (
    <BtbFeatureGate feature="order_sheet">
      {(readOnly) => <OrderSheet readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function OrderSheet({ readOnly }: { readOnly: boolean }) {
  // entries keyed by the catalog item name (descriptions are unique in the guide).
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Pull the 3-month rolling record once: today's rows prefill the sheet, the
  // rest become the history list below.
  useEffect(() => {
    supabase
      .from("order_sheets")
      .select("id, item_name, par, on_hand, order_date")
      .order("order_date", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const rows = data as HistoryRow[];
        const t = today();
        const seed: Record<string, Entry> = {};
        for (const r of rows) {
          if (r.order_date === t) seed[r.item_name] = { par: Number(r.par), on_hand: Number(r.on_hand) };
        }
        setEntries(seed);
        setHistory(rows.filter((r) => r.order_date !== t));
      });
  }, []);

  function update(name: string, field: keyof Entry, value: string) {
    if (readOnly) return;
    setSavedAt(null);
    setEntries((prev) => {
      const cur = prev[name] ?? { par: 0, on_hand: 0 };
      return { ...prev, [name]: { ...cur, [field]: Number(value) || 0 } };
    });
  }

  async function save() {
    if (readOnly || saving) return;
    setSaving(true);
    // Only persist touched lines (a PAR or an on-hand actually entered).
    const rows = BROOKS_ORDER_GUIDE.flatMap((cat) =>
      cat.items
        .map((it) => ({ name: it.name, e: entries[it.name] }))
        .filter(({ e }) => e && (e.par > 0 || e.on_hand > 0))
        .map(({ name, e }) => ({
          item_name: name,
          par: e!.par,
          on_hand: e!.on_hand,
          order_date: today(),
        })),
    );
    // Idempotent: replace today's sheet wholesale.
    await supabase.from("order_sheets").delete().eq("order_date", today());
    if (rows.length) await supabase.from("order_sheets").insert(rows);
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }

  // Filter the catalog by the search box (item name or number). Empty
  // categories drop out so the list stays tight while searching.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      BROOKS_ORDER_GUIDE.filter((cat) => category === "All" || cat.category === category)
        .map((cat) => ({
          category: cat.category,
          items: q
            ? cat.items.filter(
                (it) => it.name.toLowerCase().includes(q) || it.n.includes(q),
              )
            : cat.items,
        }))
        .filter((cat) => cat.items.length > 0),
    [q, category],
  );

  // Live totals across the whole guide (not just the filtered view).
  const linesToOrder = useMemo(
    () => Object.values(entries).filter((e) => orderQty(e) > 0).length,
    [entries],
  );
  const totalUnits = useMemo(
    () => Object.values(entries).reduce((s, e) => s + orderQty(e), 0),
    [entries],
  );

  const byDate = history.reduce<Record<string, HistoryRow[]>>((acc, r) => {
    (acc[r.order_date] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <PageHeader
        title="Order Sheet"
        subtitle="ORDER = PAR − ON HAND · Brooks order guide · 3 months of records"
        action={<Badge accent="red">{linesToOrder} to order · {totalUnits} units</Badge>}
      />

      <Card className="p-3 mb-4 flex flex-wrap items-center gap-3 sticky top-2 z-10">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        >
          <option value="All">All categories</option>
          {BROOKS_ORDER_GUIDE.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 flex-1 min-w-[8rem]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${ORDER_GUIDE_ITEM_COUNT} guide items…`}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        {!readOnly && (
          <Button accent="red" onClick={save} disabled={saving} className="h-9 shrink-0">
            {savedAt ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedAt ? `Saved ${savedAt}` : saving ? "Saving…" : "Save order"}
          </Button>
        )}
      </Card>

      <div className="space-y-6">
        {filtered.map((cat) => {
          const catOrder = cat.items.reduce(
            (s, it) => s + (entries[it.name] ? orderQty(entries[it.name]) : 0),
            0,
          );
          return (
            <div key={cat.category}>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  {cat.category}
                </p>
                <span className="text-[11px] text-slate-400">
                  {cat.items.length} items{catOrder > 0 ? ` · order ${catOrder}` : ""}
                </span>
              </div>
              <Card className="overflow-hidden">
                <div className="grid grid-cols-[1fr_4.5rem_4.5rem_3.5rem] gap-2 px-4 py-2 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase">
                  <span>Item</span>
                  <span className="text-center">PAR</span>
                  <span className="text-center">On hand</span>
                  <span className="text-right">Order</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {cat.items.map((it) => {
                    const e = entries[it.name] ?? { par: 0, on_hand: 0 };
                    return (
                      <div
                        key={it.name}
                        className="grid grid-cols-[1fr_4.5rem_4.5rem_3.5rem] gap-2 px-4 py-2.5 items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{it.name}</p>
                          {it.n && <p className="text-[10px] text-slate-400 tabular-nums">#{it.n}</p>}
                        </div>
                        {readOnly ? (
                          <span className="text-center tabular-nums text-slate-600">{e.par || "—"}</span>
                        ) : (
                          <Input
                            accent="red"
                            type="number"
                            inputMode="numeric"
                            value={e.par ? String(e.par) : ""}
                            onChange={(ev) => update(it.name, "par", ev.target.value)}
                            placeholder="0"
                            className="text-center px-1 h-9"
                          />
                        )}
                        {readOnly ? (
                          <span className="text-center tabular-nums text-slate-600">{e.on_hand || "—"}</span>
                        ) : (
                          <Input
                            accent="red"
                            type="number"
                            inputMode="numeric"
                            value={e.on_hand ? String(e.on_hand) : ""}
                            onChange={(ev) => update(it.name, "on_hand", ev.target.value)}
                            placeholder="0"
                            className="text-center px-1 h-9"
                          />
                        )}
                        <span className="text-right tabular-nums font-bold text-red-600">
                          {orderQty(e) || ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <Card className="p-10 text-center text-slate-400">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No guide items match “{query}”.
          </Card>
        )}
      </div>

      {Object.keys(byDate).length > 0 && (
        <div className="mt-10">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Past orders
          </p>
          <div className="space-y-6">
            {Object.entries(byDate).map(([date, items]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{date}</p>
                <Card className="overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase">
                    <span>Item</span><span className="text-right w-12">PAR</span><span className="text-right w-12">OH</span><span className="text-right w-14">Order</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((r) => (
                      <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center">
                        <span className="font-medium text-slate-900 truncate">{r.item_name}</span>
                        <span className="text-right w-12 tabular-nums text-slate-600">{r.par}</span>
                        <span className="text-right w-12 tabular-nums text-slate-600">{r.on_hand}</span>
                        <span className="text-right w-14 tabular-nums font-bold text-red-600">
                          {Math.max(0, Number(r.par) - Number(r.on_hand))}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
