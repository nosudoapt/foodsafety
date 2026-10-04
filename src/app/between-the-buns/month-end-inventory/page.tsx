"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, PackagePlus, Save, Trash2 } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader, StatTile } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import {
  countQty,
  monthLabel,
  prevMonth,
  recentMonths,
  thisMonth,
  toLines,
  totalValue,
  variance,
  type InventoryCount,
  type InventoryItem,
} from "@/lib/month-end-inventory";

const ITEM_COLS = "id, name, unit, category, unit_cost, position, location_id";
const COUNT_COLS = "id, item_id, count_month, qty, counted_by";

// Month-end count sheet: pick the closing month, count each item, compare the
// value against the previous close. Staff read; managers count and edit.
export default function MonthEndInventoryPage() {
  return (
    <BtbFeatureGate feature="month_end_inventory">
      {(readOnly) => <MonthEndInventory readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function MonthEndInventory({ readOnly }: { readOnly: boolean }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [prevCounts, setPrevCounts] = useState<InventoryCount[]>([]);
  const [month, setMonth] = useState(() => prevMonth(thisMonth()));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", unit: "ea", unit_cost: "" });

  const months = useMemo(() => recentMonths(thisMonth(), 12), []);
  const prevKey = prevMonth(month);

  const loadItems = async () => {
    const scope = locationScope();
    let q = supabase.from("inventory_items").select(ITEM_COLS).order("position").order("name");
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load items — run supabase/schema-month-end-inventory.sql, then reload.");
      setLoading(false);
      return;
    }
    setItems((data ?? []) as InventoryItem[]);
    setError(null);
  };

  const loadCounts = async (key: string) => {
    const scope = locationScope();
    let q = supabase.from("inventory_counts").select(COUNT_COLS).eq("count_month", key);
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load counts — run supabase/schema-month-end-inventory.sql, then reload.");
      setLoading(false);
      return;
    }
    setCounts(((data ?? []) as InventoryCount[]).map((c) => ({ ...c, qty: countQty(c.qty) })));

    // Previous close, for the variance column.
    let pq = supabase.from("inventory_counts").select(COUNT_COLS).eq("count_month", prevMonth(key));
    if (scope) pq = pq.or(scope);
    const { data: pdata } = await pq;
    setPrevCounts(((pdata ?? []) as InventoryCount[]).map((c) => ({ ...c, qty: countQty(c.qty) })));
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadItems();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadCounts(month);
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const lines = useMemo(() => toLines(items, counts), [items, counts]);
  const prevQty = useMemo(() => new Map(prevCounts.map((c) => [c.item_id, countQty(c.qty)])), [prevCounts]);

  const storedQty = (id: string): number => counts.find((c) => c.item_id === id)?.qty ?? 0;
  // Draft overrides whatever is stored so typing feels instant.
  const qtyOf = (id: string): string => (draft[id] !== undefined ? draft[id] : String(storedQty(id)));
  const liveQty = (id: string): number => (draft[id] !== undefined ? countQty(draft[id]) : storedQty(id));

  const currentTotal = totalValue(items.map((item) => ({ item, qty: liveQty(item.id) })));
  const previousTotal = totalValue(items.map((item) => ({ item, qty: prevQty.get(item.id) ?? 0 })));
  const valueVar = variance(currentTotal, previousTotal);
  const counted = lines.filter((l) => liveQty(l.item.id) > 0).length;

  const save = async () => {
    if (readOnly || saving) return;
    setSaving(true);
    setError(null);
    const scope = locationScope();
    let del = supabase.from("inventory_counts").delete().eq("count_month", month);
    if (scope) del = del.or(scope);
    const { error: delErr } = await del;
    if (delErr) {
      setError("Couldn't save — run supabase/schema-month-end-inventory.sql, then retry.");
      setSaving(false);
      return;
    }
    const rows = lines
      .map((l) => ({
        item_id: l.item.id,
        count_month: month,
        qty: liveQty(l.item.id),
        location_id: activeLocationId(),
      }))
      .filter((r) => r.qty > 0);
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("inventory_counts").insert(rows);
      if (insErr) {
        setError("Couldn't save — run supabase/schema-month-end-inventory.sql, then retry.");
        setSaving(false);
        return;
      }
    }
    setDraft({});
    setNotice(`${monthLabel(month)} saved · ${rows.length} counted`);
    setSaving(false);
    await loadCounts(month);
  };

  const addItem = async () => {
    if (readOnly || saving) return;
    const name = newItem.name.trim();
    if (!name) {
      setError("Name the item first.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("inventory_items").insert({
      name,
      unit: newItem.unit.trim() || "ea",
      unit_cost: countQty(newItem.unit_cost),
      category: null,
      position: items.length,
      location_id: activeLocationId(),
    });
    if (err) {
      setError("Couldn't add the item — run supabase/schema-month-end-inventory.sql, then retry.");
      setSaving(false);
      return;
    }
    setNewItem({ name: "", unit: "ea", unit_cost: "" });
    setNotice(`${name} added to the list`);
    setSaving(false);
    await loadItems();
  };

  const removeItem = async (id: string) => {
    if (readOnly) return;
    setError(null);
    const { error: err } = await supabase.from("inventory_items").delete().eq("id", id);
    if (err) {
      setError("Couldn't remove the item — run supabase/schema-month-end-inventory.sql, then retry.");
      return;
    }
    setNotice("Item removed (its counts went too)");
    await loadItems();
  };

  return (
    <div>
      <PageHeader
        title="Month-End Inventory"
        subtitle="Closing count sheet with value and month-over-month variance"
        action={notice ? <Badge accent="green">{notice}</Badge> : undefined}
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="text-sm text-slate-500 flex items-center gap-2">
          Closing month
          <select
            className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            value={month}
            onChange={(e) => {
              setDraft({});
              setMonth(e.target.value);
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">
          compared with {monthLabel(prevKey)} · counts kept 24 months
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatTile label="Closing value" value={currentTotal.toFixed(2)} icon={Layers} accent="green" />
        <StatTile
          label={`vs ${monthLabel(prevKey)}`}
          value={`${valueVar.delta >= 0 ? "+" : ""}${valueVar.delta.toFixed(2)}`}
          icon={Layers}
          accent={valueVar.delta < 0 ? "red" : "blue"}
        />
        <StatTile label="Items counted" value={`${counted}/${lines.length}`} icon={Layers} accent="slate" />
      </div>

      <Card className="overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="text-left px-4 py-2 font-bold">Item</th>
                <th className="text-left px-3 py-2 font-bold">Unit</th>
                <th className="text-right px-3 py-2 font-bold">Cost</th>
                <th className="text-right px-3 py-2 font-bold w-28">{monthLabel(month)}</th>
                <th className="text-right px-3 py-2 font-bold">Value</th>
                <th className="text-right px-3 py-2 font-bold">vs {monthLabel(prevKey)}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No items yet{readOnly ? "" : " — add your first one below"}.
                  </td>
                </tr>
              ) : (
                lines.map((l) => {
                  const qty = liveQty(l.item.id);
                  const before = prevQty.get(l.item.id);
                  const d = before === undefined ? null : qty - before;
                  return (
                    <tr key={l.item.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {l.item.name}
                        {l.item.category && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                            {l.item.category}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{l.item.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {l.item.unit_cost.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={qtyOf(l.item.id)}
                          readOnly={readOnly}
                          onChange={(e) => setDraft((d0) => ({ ...d0, [l.item.id]: e.target.value }))}
                          className="w-24 text-right rounded-lg border border-slate-300 px-2 py-1 tabular-nums focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {(qty * l.item.unit_cost).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d === null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={d > 0 ? "text-red-600" : d < 0 ? "text-blue-600" : "text-slate-400"}>
                            {d > 0 ? "+" : ""}
                            {d.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!readOnly && (
                          <button
                            aria-label={`Remove ${l.item.name}`}
                            className="text-slate-300 hover:text-red-600"
                            onClick={() => removeItem(l.item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {!readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 lg:col-span-2 flex flex-wrap items-end gap-3">
            <Button accent="green" onClick={save} disabled={saving}>
              <Save className="w-4 h-4 mr-1 inline" />
              {saving ? "Saving…" : `Close ${monthLabel(month)}`}
            </Button>
            <p className="text-xs text-slate-400">
              Saves every non-zero count for {monthLabel(month)} and replaces what was there before.
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-green-600" /> Add an item
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-sm grow min-w-[8rem]">
                <span className="block text-xs font-medium text-slate-500 mb-1">Name *</span>
                <Input
                  accent="green"
                  value={newItem.name}
                  onChange={(e) => setNewItem((n) => ({ ...n, name: e.target.value }))}
                  placeholder="Sesame buns"
                />
              </label>
              <label className="block text-sm w-20">
                <span className="block text-xs font-medium text-slate-500 mb-1">Unit</span>
                <Input
                  accent="green"
                  value={newItem.unit}
                  onChange={(e) => setNewItem((n) => ({ ...n, unit: e.target.value }))}
                />
              </label>
              <label className="block text-sm w-28">
                <span className="block text-xs font-medium text-slate-500 mb-1">Cost</span>
                <Input
                  accent="green"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={newItem.unit_cost}
                  onChange={(e) => setNewItem((n) => ({ ...n, unit_cost: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
              <Button accent="green" onClick={addItem} disabled={saving}>
                Add
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
