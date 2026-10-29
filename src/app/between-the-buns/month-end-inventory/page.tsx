"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, PackagePlus, Save, Trash2 } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader, StatTile } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { monthDates, monthlyTotal, dailyTotal, type PurchaseEntry } from "@/lib/inventory-purchases";
import { computeAccounting, nullableAmount } from "@/lib/inventory-accounting";
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
  // Month math. Closing = live count total. Purchases come from the ledger
  // (single source of truth). Opening is carried forward from the prior
  // month's FINALIZED snapshot (null = baseline/unavailable). Sales is the one
  // manually-entered figure, stored on inventory_month_summary.
  const [summary, setSummary] = useState({ sales: "" });
  const [openingInfo, setOpeningInfo] = useState<{ opening: number | null; carriedFrom: string | null; baseline: boolean }>({
    opening: null, carriedFrom: null, baseline: true,
  });
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [purForm, setPurForm] = useState({ type: "gfs", date: "", description: "", amount: "", reference: "", supplier: "GFS" });

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
    await loadSummary(key);
    await loadOpening(key);
    await loadPurchases(key);
    const snapRes = await fetch(`/api/btb/inventory-snapshot?month=${key}`);
    if (snapRes.ok) { const sd = await snapRes.json(); setSnapshot(sd.snapshot ?? null); }
    setLoading(false);
  };

  const loadSummary = async (key: string) => {
    const scope = locationScope();
    let q = supabase
      .from("inventory_month_summary")
      .select("sales")
      .eq("count_month", key);
    if (scope) q = q.or(scope);
    const { data } = await q;
    const row = (data?.[0] as { sales: number } | undefined) ?? null;
    setSummary({ sales: row ? String(Number(row.sales) || 0) : "" });
  };

  // Opening inventory: carried forward from the prior month's FINALIZED
  // snapshot via the protected API. Never fabricated (null on baseline).
  const loadOpening = async (key: string) => {
    try {
      const res = await fetch(`/api/btb/inventory-opening?month=${key}`);
      if (!res.ok) return;
      const d = await res.json();
      setOpeningInfo({ opening: d.opening ?? null, carriedFrom: d.carriedFrom ?? null, baseline: !!d.baseline });
    } catch {
      /* keep previous */
    }
  };

  const loadPurchases = async (key: string) => {
    const { data } = await supabase.from("inventory_purchases").select("*").eq("count_month", key).order("purchase_date").order("created_at");
    setPurchases((data ?? []) as PurchaseEntry[]);
  };

  const addPurchase = async () => {
    if (readOnly || saving) return;
    const amount = Number(purForm.amount);
    if (!purForm.date || !purForm.description.trim() || !Number.isFinite(amount) || amount < 0) {
      setError("Fill date, description and a valid amount.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/btb/inventory-purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        count_month: month,
        purchase_date: purForm.date,
        type: purForm.type,
        supplier: purForm.type === "gfs" ? (purForm.supplier || "GFS") : null,
        description: purForm.description.trim(),
        amount,
        reference: purForm.reference.trim() || null,
      }),
    });
    if (!res.ok) setError("Couldn't save purchase — check permissions/schema.");
    else { setNotice("Purchase saved"); setPurForm({ ...purForm, description: "", amount: "", reference: "" }); await loadPurchases(month); }
    setSaving(false);
  };

  const saveSummary = async () => {
    if (readOnly || saving) return;
    setSaving(true);
    setError(null);
    const scope = locationScope();
    let del = supabase.from("inventory_month_summary").delete().eq("count_month", month);
    if (scope) del = del.or(scope);
    const { error: delErr } = await del;
    if (!delErr) {
      // Only food sales are stored here — opening is carried forward and
      // purchases come from the ledger, so neither is hand-typed any more.
      const { error: insErr } = await supabase.from("inventory_month_summary").insert({
        count_month: month,
        sales: nullableAmount(summary.sales) ?? 0,
        location_id: activeLocationId(),
      });
      if (!insErr) setNotice(`${monthLabel(month)} sales saved`);
      else setError("Couldn't save sales — run supabase/schema-inventory-summary.sql, then retry.");
    } else {
      setError("Couldn't save sales — run supabase/schema-inventory-summary.sql, then retry.");
    }
    setSaving(false);
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

  // Draft accounting — derived, not hand-typed: opening from carry-forward,
  // purchases from the ledger, closing from the live count, sales manual.
  const ledgerPurchases = monthlyTotal(purchases);
  const acct = computeAccounting({
    opening: openingInfo.opening,
    purchases: ledgerPurchases,
    closing: currentTotal,
    sales: nullableAmount(summary.sales),
  });

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
        subtitle="Closing count sheet — value auto-summed, usage and food cost % from month math"
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

      {snapshot && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${snapshot.status === "finalized" ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          {snapshot.status === "finalized" ? "FINALIZED" : "REOPENED (draft) — correct below, then re-finalize"} {monthLabel(month)}
          {" — "}opening {Number(snapshot.opening_value).toFixed(2)}
          {" · "}purchases {Number(snapshot.purchases).toFixed(2)}
          {" · "}closing {Number(snapshot.closing_value).toFixed(2)}
          {" · "}sales {snapshot.sales == null ? "n/a" : Number(snapshot.sales).toFixed(2)}
          {" · "}COGS {snapshot.cogs == null ? "n/a" : Number(snapshot.cogs).toFixed(2)}
          {" · "}Food Cost % {snapshot.food_cost_pct == null ? "n/a" : `${Number(snapshot.food_cost_pct).toFixed(1)}%`}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatTile label="Closing value" value={currentTotal.toFixed(2)} icon={Layers} accent="green" />
        <StatTile
          label={`vs ${monthLabel(prevKey)}`}
          value={`${valueVar.delta >= 0 ? "+" : ""}${valueVar.delta.toFixed(2)}`}
          icon={Layers}
          accent={valueVar.delta < 0 ? "red" : "blue"}
        />
        <StatTile label="Items counted" value={`${counted}/${lines.length}`} icon={Layers} accent="slate" />
        <StatTile
          label="COGS $"
          value={acct.cogs == null ? "—" : acct.cogs.toFixed(2)}
          icon={Layers}
          accent="amber"
        />
        <StatTile
          label="Food cost %"
          value={acct.foodCostPct == null ? "—" : `${acct.foodCostPct.toFixed(1)}%`}
          icon={Layers}
          accent={acct.flags.suspiciousPct ? "red" : "slate"}
        />
      </div>

      {/* Accounting status — never fabricate a missing figure as zero. */}
      {acct.status !== "complete" && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {acct.status === "empty" && "Nothing entered yet for this month."}
          {acct.status === "no_opening" && "Opening inventory unavailable — this is the baseline month, or the prior month isn’t finalized yet. COGS and food cost % can’t be computed."}
          {acct.status === "no_closing" && "Closing count not entered yet — record the count below to compute COGS."}
          {acct.status === "no_sales" && "Food sales not entered yet — COGS is shown, but food cost % needs sales."}
          {acct.status === "zero_sales" && "Food sales are $0 — food cost % is undefined (can’t divide by zero)."}
        </div>
      )}
      {acct.flags.negativeCogs && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠ COGS is negative — closing exceeds opening + purchases. Check the count and purchases for this month.
        </div>
      )}
      {openingInfo.baseline && !acct.flags.negativeCogs && acct.status !== "empty" && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          No prior finalized month — opening inventory is treated as the baseline (0.00) for this first period.
        </div>
      )}

      <Card className="p-4 mb-5">
        <p className="text-sm font-bold text-slate-900 mb-1">Month math — opening, purchases, sales</p>
        <p className="text-xs text-slate-400 mb-3">
          COGS = Opening + Purchases − Closing · Food cost % = COGS ÷ Sales × 100 · Opening carries forward from the prior finalized month · Purchases come from the ledger · Closing is summed from the count below.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm w-44">
            <span className="block text-xs font-medium text-slate-500 mb-1">Opening $ (carried forward)</span>
            <Input
              accent="green"
              type="text"
              value={openingInfo.opening == null ? "unavailable" : openingInfo.opening.toFixed(2)}
              readOnly
              disabled
            />
            <span className="block text-[11px] text-slate-400 mt-1">
              {openingInfo.carriedFrom ? `from ${monthLabel(openingInfo.carriedFrom)} finalized close` : "baseline — no prior finalized month"}
            </span>
          </label>
          <label className="block text-sm w-44">
            <span className="block text-xs font-medium text-slate-500 mb-1">Purchases $ (from ledger)</span>
            <Input
              accent="green"
              type="text"
              value={ledgerPurchases.toFixed(2)}
              readOnly
              disabled
            />
            <span className="block text-[11px] text-slate-400 mt-1">{purchases.length} entry(ies) this month</span>
          </label>
          <label className="block text-sm w-32">
            <span className="block text-xs font-medium text-slate-500 mb-1">Food sales $ (manual)</span>
            <Input
              accent="green"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={summary.sales}
              readOnly={readOnly}
              onChange={(e) => setSummary((s) => ({ ...s, sales: e.target.value }))}
            />
          </label>
          {!readOnly && (
            <>
              <Button accent="green" onClick={saveSummary} disabled={saving}>
                {saving ? "Saving…" : "Save sales"}
              </Button>
              <Button accent="red" onClick={async () => {
                setSaving(true);
                const res = await fetch("/api/btb/inventory-finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count_month: month, sales: nullableAmount(summary.sales) }) });
                setSaving(false);
                if (res.ok) { setNotice(`${monthLabel(month)} finalized`); await loadCounts(month); }
                else { const err = await res.json().catch(() => null); setError(err?.error ? `Finalize failed: ${err.error}` : "Finalize failed (permission/validation)."); }
              }} disabled={saving}>
                {saving ? "Finalizing…" : "Finalize month"}
              </Button>
              <Button accent="amber" onClick={async () => {
                const reason = window.prompt("Reason for reopening? (required)") || "";
                if (!reason.trim()) { setError("Reopen cancelled — a reason is required."); return; }
                setSaving(true);
                const res = await fetch("/api/btb/inventory-reopen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count_month: month, reason: reason.trim() }) });
                setSaving(false);
                if (res.ok) { setNotice(`${monthLabel(month)} reopened — correct below, then re-finalize`); await loadCounts(month); }
                else { const d = await res.json().catch(() => null); setError(d?.error ? `Reopen failed: ${d.error}` : "Reopen failed (permission/downstream)."); }
              }} disabled={saving}>
                {saving ? "Reopening…" : "Reopen month"}
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card className="p-4 mb-5">
        <p className="text-sm font-bold text-slate-900 mb-3">Daily purchases</p>
        {!readOnly && (
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <select className="border rounded-lg px-2 py-1 text-sm" value={purForm.type} onChange={(e) => setPurForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="gfs">GFS invoice</option>
              <option value="local">Local purchase</option>
            </select>
            <select className="border rounded-lg px-2 py-1 text-sm" value={purForm.date} onChange={(e) => setPurForm((f) => ({ ...f, date: e.target.value }))}>
              <option value="">Date</option>
              {monthDates(month).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <Input accent="green" placeholder="Description" value={purForm.description} onChange={(e) => setPurForm((f) => ({ ...f, description: e.target.value }))} />
            <Input accent="green" type="number" placeholder="Amount" value={purForm.amount} onChange={(e) => setPurForm((f) => ({ ...f, amount: e.target.value }))} />
            {purForm.type === "gfs" && (
              <>
                <Input accent="green" placeholder="Supplier" value={purForm.supplier} onChange={(e) => setPurForm((f) => ({ ...f, supplier: e.target.value }))} />
                <Input accent="green" placeholder="Invoice ref" value={purForm.reference} onChange={(e) => setPurForm((f) => ({ ...f, reference: e.target.value }))} />
              </>
            )}
            <Button accent="green" onClick={addPurchase} disabled={saving}>Add</Button>
          </div>
        )}
        <div className="text-xs text-slate-500 mb-2 flex flex-wrap gap-3">
          <span>GFS total: <b className="text-slate-700">{monthlyTotal(purchases, "gfs").toFixed(2)}</b></span>
          <span>Local total: <b className="text-slate-700">{monthlyTotal(purchases, "local").toFixed(2)}</b></span>
          <span>Combined: <b className="text-slate-700">{ledgerPurchases.toFixed(2)}</b></span>
        </div>
        {/* Day-by-day ledger: every date in the month, its entries and total. */}
        <div className="max-h-72 overflow-y-auto text-sm space-y-2">
          {monthDates(month).map((d) => {
            const dayEntries = purchases.filter((p) => p.purchase_date === d);
            if (dayEntries.length === 0) return null;
            return (
              <div key={d} className="rounded-lg border border-slate-100">
                <div className="flex justify-between px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-600">
                  <span>{d}</span>
                  <span>day total {dailyTotal(purchases, d).toFixed(2)}</span>
                </div>
                {dayEntries.map((p) => (
                  <div key={p.id} className="border-t px-3 py-1 flex justify-between text-sm">
                    <span className="text-slate-600">
                      <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${p.type === "gfs" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                        {p.type === "gfs" ? `GFS${p.reference ? ` ${p.reference}` : ""}` : "LOCAL"}
                      </span>
                      {p.description}
                    </span>
                    <span className="tabular-nums">{Number(p.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {purchases.length === 0 && <p className="text-slate-400 py-4 text-center">No purchases recorded for {monthLabel(month)}.</p>}
        </div>
      </Card>
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
