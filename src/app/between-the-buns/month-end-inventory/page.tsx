"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Layers, LockKeyhole, PackagePlus, Pencil, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader, StatTile } from "@/components/ui";
import { monthDates, monthlyTotal, dailyTotal, type PurchaseEntry } from "@/lib/inventory-purchases";
import { computeAccounting, nullableAmount } from "@/lib/inventory-accounting";
import { countQty, lineValue, monthLabel, prevMonth, recentMonths, thisMonth, toLines, totalValue, type InventoryItem } from "@/lib/month-end-inventory";
import { changedInventoryCounts, inventoryCountPayload, loadInventoryMonth, type InventoryMonthData, type InventorySnapshot } from "@/lib/inventory-workspace";
import { fetchJson, RequestError } from "@/lib/fetch-json";

const emptyItem = { name: "", unit: "ea", unit_cost: "" };
const emptyPurchase = { type: "gfs", date: "", description: "", amount: "", reference: "", supplier: "GFS" };
const money = (value: number | null | undefined) => value == null ? "—" : Number(value).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MonthEndInventoryPage() {
  return <BtbFeatureGate feature="month_end_inventory">{(readOnly) => <InventoryWorkspace readOnly={readOnly} />}</BtbFeatureGate>;
}

function InventoryWorkspace({ readOnly }: { readOnly: boolean }) {
  const [month, setMonth] = useState(() => prevMonth(thisMonth()));
  const months = useMemo(() => recentMonths(thisMonth(), 24), []);
  // A month owns its requests and drafts. An old response cannot populate the
  // newly selected month, even if it arrives after navigation.
  return <InventoryMonth key={month} month={month} months={months} onMonthChange={setMonth} readOnly={readOnly} />;
}

function InventoryMonth({ month, months, onMonthChange, readOnly }: { month: string; months: string[]; onMonthChange: (month: string) => void; readOnly: boolean }) {
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{ revision: number; data: InventoryMonthData | null; error: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [salesDraft, setSalesDraft] = useState<string | null>(null);
  const [purchase, setPurchase] = useState(emptyPurchase);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const mutation = useRef<AbortController | null>(null);
  const loaded = resource?.revision === revision;
  const data = loaded ? resource.data : null;
  const loadError = loaded ? resource.error : "";
  const finalized = data?.snapshot?.status === "finalized";
  const canEdit = !!data && !readOnly && !finalized;
  const sales = salesDraft ?? data?.sales ?? "";
  const countChanges = changedInventoryCounts(data?.counts ?? [], draft);
  const salesChanged = salesDraft !== null && salesDraft !== data?.sales;
  const purchaseChanged = !!(purchase.date || purchase.description || purchase.amount || purchase.reference);
  const itemChanged = !!(itemForm.name || itemForm.unit_cost || itemForm.unit !== "ea");
  const unsaved = countChanges > 0 || salesChanged || purchaseChanged || itemChanged;

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    let cancelled = false;
    void loadInventoryMonth(month, controller.signal)
      .then((data) => { if (!cancelled) setResource({ revision, data, error: "" }); })
      .catch(() => { if (!cancelled) setResource({ revision, data: null, error: "The count sheet, purchases or month status couldn’t be loaded. Retry to open this month." }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [month, revision]);

  useEffect(() => () => { mutation.current?.abort(); }, []);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const update = (change: (current: InventoryMonthData) => InventoryMonthData) => {
    setResource((current) => current?.data ? { ...current, data: change(current.data) } : current);
  };

  async function mutate<T>(action: string, url: string, body: unknown, apply: (response: T) => void, message: string, method = "POST") {
    if (mutation.current || readOnly || !data) return;
    const controller = new AbortController();
    mutation.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setSaving(action);
    setError("");
    setNotice("");
    try {
      const response = await fetchJson<T>(url, { method, signal: controller.signal,
        ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      if (controller.signal.aborted) return;
      apply(response);
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof RequestError ? `Couldn’t complete the update: ${cause.message}` : "The update wasn’t confirmed. Your entries are still here. Check your connection and try again.");
    } finally {
      window.clearTimeout(timeout);
      mutation.current = null;
      setSaving("");
    }
  }

  const saveCounts = () => {
    if (!canEdit || !data) return;
    const parsed = inventoryCountPayload(month, data.items, data.counts, draft);
    if (!parsed.ok) { setError("Enter a valid quantity for every item. Use 0 for none; don’t leave a changed count blank."); return; }
    const rows = parsed.value.rows.filter((row) => row.qty > 0).map((row) => ({ ...row, count_month: month }));
    void mutate<{ ok: boolean }>("counts", "/api/btb/inventory-counts", { count_month: month, counts: parsed.value.rows }, (response) => {
      if (!response.ok) throw new Error("Save not confirmed");
      update((current) => ({ ...current, counts: rows }));
      setDraft({});
    }, `${monthLabel(month)} counts saved.`);
  };

  const saveSales = () => {
    if (!canEdit) return;
    if (sales === "" || !Number.isFinite(Number(sales)) || Number(sales) < 0) { setError("Enter food sales of zero or more before saving."); return; }
    void mutate<{ ok: boolean }>("sales", "/api/btb/inventory-summary", { count_month: month, sales }, (response) => {
      if (!response.ok) throw new Error("Save not confirmed");
      update((current) => ({ ...current, sales: String(countQty(sales)) }));
      setSalesDraft(null);
    }, `${monthLabel(month)} food sales saved.`);
  };

  const addPurchase = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!purchase.date || !purchase.description.trim() || purchase.amount === "" || !Number.isFinite(Number(purchase.amount)) || Number(purchase.amount) < 0) {
      setError("Enter a purchase date, description and amount of zero or more."); return;
    }
    if (purchase.type === "gfs" && !purchase.reference.trim()) { setError("Enter the GFS invoice reference."); return; }
    void mutate<{ purchase: PurchaseEntry }>("purchase", "/api/btb/inventory-purchases", {
      count_month: month, purchase_date: purchase.date, description: purchase.description.trim(), amount: Number(purchase.amount),
      type: purchase.type, supplier: purchase.type === "gfs" ? purchase.supplier || "GFS" : null, reference: purchase.reference.trim() || null,
    }, (response) => {
      if (!response.purchase) throw new Error("Save not confirmed");
      update((current) => ({ ...current, purchases: [...current.purchases, response.purchase] }));
      setPurchase(emptyPurchase);
    }, "Purchase saved to the ledger.");
  };

  const saveItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!itemForm.name.trim() || !Number.isFinite(Number(itemForm.unit_cost)) || Number(itemForm.unit_cost) < 0) {
      setError("Enter an item name and a unit cost of zero or more."); return;
    }
    void mutate<{ item: InventoryItem }>("item", `/api/btb/inventory-items${editingItem ? `?id=${encodeURIComponent(editingItem)}` : ""}`, itemForm, (response) => {
      if (!response.item) throw new Error("Save not confirmed");
      const item = { ...response.item, unit_cost: Number(response.item.unit_cost) };
      update((current) => ({ ...current, items: editingItem ? current.items.map((row) => row.id === editingItem ? item : row) : [...current.items, item] }));
      setItemForm(emptyItem);
      setEditingItem(null);
    }, editingItem ? "Inventory item updated." : "Inventory item added.", editingItem ? "PATCH" : "POST");
  };

  const removeItem = (item: InventoryItem) => {
    if (!canEdit || saving || !window.confirm(`Remove ${item.name}? Its draft counts will also be removed.`)) return;
    void mutate<{ ok: boolean }>("remove", `/api/btb/inventory-items?id=${encodeURIComponent(item.id)}`, undefined, (response) => {
      if (!response.ok) throw new Error("Removal not confirmed");
      update((current) => ({ ...current, items: current.items.filter((row) => row.id !== item.id), counts: current.counts.filter((row) => row.item_id !== item.id), prevCounts: current.prevCounts.filter((row) => row.item_id !== item.id) }));
      setDraft((current) => { const next = { ...current }; delete next[item.id]; return next; });
      if (editingItem === item.id) { setEditingItem(null); setItemForm(emptyItem); }
    }, `${item.name} removed.`, "DELETE");
  };

  const finalize = () => {
    if (!canEdit || !data || unsaved) return;
    void mutate<{ ok: boolean; snapshot: InventorySnapshot }>("finalize", "/api/btb/inventory-finalize", { count_month: month, sales: data.sales }, (response) => {
      if (!response.ok || response.snapshot?.status !== "finalized") throw new Error("Finalization not confirmed");
      update((current) => ({ ...current, snapshot: response.snapshot }));
    }, `${monthLabel(month)} finalized. The saved close is ready to carry forward.`);
  };

  const reopen = (event: React.FormEvent) => {
    event.preventDefault();
    if (!finalized || !reopenReason.trim()) return;
    void mutate<{ ok: boolean; snapshot: InventorySnapshot }>("reopen", "/api/btb/inventory-reopen", { count_month: month, reason: reopenReason.trim() }, (response) => {
      if (!response.ok || response.snapshot?.status !== "draft") throw new Error("Reopen not confirmed");
      update((current) => ({ ...current, snapshot: response.snapshot }));
      setReopenReason("");
    }, `${monthLabel(month)} reopened. Make your corrections, save and finalize again.`);
  };

  const stored = new Map((data?.counts ?? []).map((row) => [row.item_id, row.qty]));
  const previous = new Map((data?.prevCounts ?? []).map((row) => [row.item_id, row.qty]));
  const live = (id: string) => draft[id] !== undefined ? countQty(draft[id]) : stored.get(id) ?? 0;
  const lines = toLines(data?.items ?? [], data?.counts ?? []);
  const matchingLines = lines.filter(({ item }) => `${item.name} ${item.category ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const total = totalValue(lines.map(({ item }) => ({ item, qty: live(item.id) })));
  const priorTotal = totalValue(lines.map(({ item }) => ({ item, qty: previous.get(item.id) ?? 0 })));
  const ledger = monthlyTotal(data?.purchases ?? []);
  const accounting = computeAccounting({ opening: data?.opening.opening ?? null, purchases: data ? ledger : null, closing: data ? total : null, sales: nullableAmount(sales) });
  const savedSnapshot = finalized ? data!.snapshot! : null;
  const closing = savedSnapshot ? Number(savedSnapshot.closing_value) : total;
  const cogs = savedSnapshot ? savedSnapshot.cogs : accounting.cogs;
  const costPct = savedSnapshot ? savedSnapshot.food_cost_pct : accounting.foodCostPct;

  return <div className="inventory-workspace">
    <PageHeader title="Month-end inventory" subtitle="Count your stock, reconcile purchases and save a clear close for the next month."
      action={data ? <Badge accent={finalized ? "green" : "purple"}>{finalized ? <LockKeyhole size={13} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}{finalized ? "Finalized" : data.snapshot ? "Reopened draft" : "Draft"}</Badge> : undefined} />
    <div className="inventory-toolbar">
      <label className="inventory-month"><span>Closing month</span><select value={month} disabled={!!saving} onChange={(event) => {
        if (unsaved && !window.confirm("Switch month and discard your unsaved entries?")) return;
        onMonthChange(event.target.value);
      }}>{months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></label>
      <p>Compared with {monthLabel(prevMonth(month))} · company-wide inventory</p>
      <button className="dash__refresh" aria-label="Refresh inventory" disabled={!!saving || !loaded || unsaved} onClick={() => { setNotice(""); setError(""); setRevision((value) => value + 1); }}><RefreshCw size={17} aria-hidden="true" /></button>
    </div>

    {notice && <div className="ui-notice inventory-success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}
    {error && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
    {!loaded ? <div className="ui-empty" role="status"><span className="ui-loader" aria-hidden="true" /><h2>Opening {monthLabel(month)}…</h2><p>Loading the count sheet, ledger and saved month status.</p></div> : !data ? <div className="ui-empty"><CircleAlert size={30} aria-hidden="true" /><h2>Inventory is unavailable</h2><p role="alert">{loadError}</p><Button onClick={() => setRevision((value) => value + 1)}>Retry inventory</Button></div> : <>
      <section className="inventory-metrics" aria-label="Inventory figures">
        <StatTile label={finalized ? "Finalized closing value $" : "Closing value $"} value={money(closing)} accent="purple" />
        <StatTile label="Value vs previous count $" value={data.prevCounts.length ? `${closing - priorTotal >= 0 ? "+" : ""}${money(closing - priorTotal)}` : "—"} />
        <StatTile label="Items with a count" value={`${lines.filter(({ item }) => live(item.id) > 0).length} / ${lines.length}`} />
        <StatTile label="COGS $" value={money(cogs)} />
        <StatTile label="Food cost" value={costPct == null ? "—" : `${Number(costPct).toFixed(1)}%`} />
      </section>
      {unsaved && <div className="ui-notice ui-notice--warning" role="status"><Pencil size={18} aria-hidden="true" /><span>You have unsaved entries. Figures preview your changes. Save or clear them before finalizing this month.</span></div>}
      {readOnly && <div className="ui-notice"><LockKeyhole size={18} aria-hidden="true" />You have read-only access. A manager can update counts and finalize the month.</div>}
      {!finalized && data.opening.baseline && <div className="ui-notice"><CircleAlert size={18} aria-hidden="true" />No finalized close for {monthLabel(prevMonth(month))}. Opening inventory, COGS and food cost are unavailable for this period.</div>}
      {!finalized && accounting.flags.negativeCogs && <div className="ui-notice ui-notice--warning"><CircleAlert size={18} aria-hidden="true" />Closing value exceeds opening plus purchases. Review the counts and ledger before finalizing.</div>}

      <section className="dash-panel" aria-labelledby="count-sheet-title">
        <div className="dash-panel__header"><div><h2 id="count-sheet-title">1. Count your stock</h2><p>{monthLabel(month)} quantities · values calculated from unit costs</p></div><Badge>{countChanges ? `${countChanges} changed` : "Saved quantities"}</Badge></div>
        <div className="inventory-sectionbar"><label className="dash-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search inventory items</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an item…" /></label>{canEdit && <Button onClick={saveCounts} disabled={!!saving}><Save size={16} aria-hidden="true" />{saving === "counts" ? "Saving counts…" : "Save counts"}</Button>}</div>
        <div className="inventory-table" tabIndex={0} role="region" aria-label="Inventory count sheet">
          <table><caption className="sr-only">Stock quantities and values for {monthLabel(month)}</caption><thead><tr><th scope="col">Item</th><th scope="col">Unit</th><th scope="col">Unit cost $</th><th scope="col">Quantity</th><th scope="col">Value $</th><th scope="col">Quantity change</th>{canEdit && <th scope="col"><span className="sr-only">Item actions</span></th>}</tr></thead>
            <tbody>{matchingLines.map(({ item }) => {
              const value = draft[item.id] ?? String(stored.get(item.id) ?? 0);
              const invalid = value === "" || !Number.isFinite(Number(value)) || Number(value) < 0;
              const before = previous.get(item.id);
              return <tr key={item.id}><th scope="row"><strong>{item.name}</strong>{item.category && <small>{item.category}</small>}</th><td>{item.unit}</td><td>{money(item.unit_cost)}</td><td><Input type="number" inputMode="decimal" step="0.01" min="0" aria-label={`Quantity for ${item.name}`} aria-invalid={invalid} value={value} readOnly={!canEdit} disabled={!!saving} onChange={(event) => { setNotice(""); setDraft((current) => ({ ...current, [item.id]: event.target.value })); }} />{invalid && <small className="inventory-field-error">Enter 0 or more</small>}</td><td>{invalid ? "—" : money(lineValue(live(item.id), item.unit_cost))}</td><td>{before === undefined || invalid ? "—" : `${live(item.id) - before > 0 ? "+" : ""}${countQty(value) - before}`}</td>{canEdit && <td><div className="inventory-row-actions"><button disabled={!!saving} aria-label={`Edit ${item.name}`} onClick={() => { setEditingItem(item.id); setItemForm({ name: item.name, unit: item.unit, unit_cost: String(item.unit_cost) }); document.getElementById("inventory-item-form")?.scrollIntoView({ block: "center" }); document.getElementById("inventory-item-name")?.focus(); }}><Pencil size={16} aria-hidden="true" /></button><button disabled={!!saving} aria-label={`Remove ${item.name}`} onClick={() => removeItem(item)}><Trash2 size={16} aria-hidden="true" /></button></div></td>}</tr>;
            })}</tbody></table>
        </div>
        {!matchingLines.length && <div className="ui-empty"><Layers size={26} aria-hidden="true" /><h3>{search ? "No matching items" : "No inventory items yet"}</h3><p>{search ? "Try another item name." : readOnly ? "Items added by your manager will appear here." : "Add an item below to start the count sheet."}</p></div>}
        {canEdit && <div className="inventory-savebar"><span role="status">{countChanges ? `${countChanges} unsaved ${countChanges === 1 ? "quantity" : "quantities"}` : "Counts are up to date"}</span>{countChanges > 0 && <Button variant="ghost" disabled={!!saving} onClick={() => setDraft({})}>Reset counts</Button>}<Button disabled={!!saving} onClick={saveCounts}><Save size={16} aria-hidden="true" />{saving === "counts" ? "Saving counts…" : "Save counts"}</Button></div>}
      </section>

      {canEdit && <details className="inventory-item" open={editingItem ? true : undefined}>
        <summary><PackagePlus size={18} aria-hidden="true" />{editingItem ? "Edit inventory item" : "Add an inventory item"}</summary>
        <form id="inventory-item-form" onSubmit={saveItem}><fieldset disabled={!!saving} className="inventory-form-grid">
          <label className="inventory-field inventory-field--wide">Item name<Input id="inventory-item-name" required maxLength={200} value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="Sesame buns" /></label>
          <label className="inventory-field">Unit<Input maxLength={40} value={itemForm.unit} onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))} /></label>
          <label className="inventory-field">Unit cost $<Input type="number" min="0" step="0.01" inputMode="decimal" value={itemForm.unit_cost} onChange={(event) => setItemForm((current) => ({ ...current, unit_cost: event.target.value }))} placeholder="0.00" /></label>
          <Button type="submit" disabled={!!saving}>{saving === "item" ? "Saving item…" : editingItem ? "Save item" : "Add item"}</Button>
          {itemChanged && <Button variant="ghost" disabled={!!saving} onClick={() => { setItemForm(emptyItem); setEditingItem(null); }}>Clear item form</Button>}
        </fieldset></form>
      </details>}

      <section className="dash-panel" aria-labelledby="purchases-title"><div className="dash-panel__header"><div><h2 id="purchases-title">2. Reconcile purchases</h2><p>Daily invoices and local purchases for {monthLabel(month)}</p></div><Badge>{data.purchases.length} {data.purchases.length === 1 ? "entry" : "entries"}</Badge></div>
        <div className="inventory-purchase-totals"><span>GFS <strong>${money(monthlyTotal(data.purchases, "gfs"))}</strong></span><span>Local <strong>${money(monthlyTotal(data.purchases, "local"))}</strong></span><span>Total <strong>${money(ledger)}</strong></span></div>
        {canEdit && <form onSubmit={addPurchase} className="inventory-purchase-form"><fieldset disabled={!!saving} className="inventory-form-grid">
          <label className="inventory-field">Purchase type<select value={purchase.type} onChange={(event) => setPurchase((current) => ({ ...current, type: event.target.value }))}><option value="gfs">GFS invoice</option><option value="local">Local purchase</option></select></label>
          <label className="inventory-field">Purchase date<select required value={purchase.date} onChange={(event) => setPurchase((current) => ({ ...current, date: event.target.value }))}><option value="">Choose a date</option>{monthDates(month).map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
          <label className="inventory-field inventory-field--wide">Description<Input required maxLength={500} value={purchase.description} onChange={(event) => setPurchase((current) => ({ ...current, description: event.target.value }))} placeholder="Weekly stock delivery" /></label>
          <label className="inventory-field">Amount $<Input required type="number" step="0.01" min="0" inputMode="decimal" value={purchase.amount} onChange={(event) => setPurchase((current) => ({ ...current, amount: event.target.value }))} /></label>
          {purchase.type === "gfs" && <><label className="inventory-field">Supplier<Input maxLength={200} value={purchase.supplier} onChange={(event) => setPurchase((current) => ({ ...current, supplier: event.target.value }))} /></label><label className="inventory-field">Invoice reference<Input required maxLength={200} value={purchase.reference} onChange={(event) => setPurchase((current) => ({ ...current, reference: event.target.value }))} /></label></>}
          <Button type="submit" disabled={!!saving}>{saving === "purchase" ? "Saving purchase…" : "Add purchase"}</Button>{purchaseChanged && <Button variant="ghost" disabled={!!saving} onClick={() => setPurchase(emptyPurchase)}>Clear purchase</Button>}
        </fieldset></form>}
        <div className="inventory-ledger">{monthDates(month).map((day) => {
          const entries = data.purchases.filter((row) => row.purchase_date === day);
          return entries.length ? <section key={day}><div className="inventory-ledger__day"><h3>{new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</h3><strong>${money(dailyTotal(data.purchases, day))}</strong></div>{entries.map((row, index) => <div className="inventory-ledger__entry" key={row.id ?? index}><Badge accent={row.type === "gfs" ? "purple" : "slate"}>{row.type === "gfs" ? "GFS" : "Local"}</Badge><span>{row.description}{row.reference && <small>Invoice {row.reference}</small>}</span><strong>${money(Number(row.amount))}</strong></div>)}</section> : null;
        })}{!data.purchases.length && <div className="ui-empty"><h3>No purchases recorded</h3><p>Saved invoices and local purchases for this month will appear here.</p></div>}</div>
      </section>

      <Card className="inventory-close"><div className="dash-section__head"><div><h2>3. Review the month’s close</h2><p>{finalized ? "This finalized snapshot is the saved accounting record." : "Save sales, review the figures, then finalize your saved records."}</p></div></div>
        <div className="inventory-close__figures"><div><span>Opening $</span><strong>{money(data.opening.baseline ? null : savedSnapshot ? savedSnapshot.opening_value : data.opening.opening)}</strong><small>{data.opening.carriedFrom ? `From ${monthLabel(data.opening.carriedFrom)}` : "No prior finalized close"}</small></div><div><span>Purchases $</span><strong>{money(savedSnapshot ? savedSnapshot.purchases : ledger)}</strong><small>From the purchase ledger</small></div><div><span>Closing $</span><strong>{money(closing)}</strong><small>{finalized ? "Finalized count value" : countChanges ? "Preview · unsaved counts" : "Saved count value"}</small></div><label className="inventory-field">Food sales $<Input type="number" step="0.01" min="0" inputMode="decimal" readOnly={!canEdit} disabled={!!saving} value={savedSnapshot ? savedSnapshot.sales ?? "" : sales} onChange={(event) => { setNotice(""); setSalesDraft(event.target.value); }} placeholder="Not entered" /><small>{salesChanged ? "Unsaved sales" : "Manual sales figure"}</small></label></div>
        <p className="inventory-formula">COGS = Opening + Purchases − Closing · Food cost = COGS ÷ Sales × 100</p>
        {!finalized && (accounting.status === "no_sales" || accounting.status === "zero_sales") && <p className="inventory-help">{accounting.status === "zero_sales" ? "Food sales are $0. Food cost percentage is unavailable." : "Enter food sales to calculate the food cost percentage."}</p>}
        {canEdit && <div className="inventory-close__actions"><Button variant="ghost" onClick={saveSales} disabled={!!saving || !salesChanged}>{saving === "sales" ? "Saving sales…" : "Save sales"}</Button>{salesChanged && <Button variant="ghost" disabled={!!saving} onClick={() => setSalesDraft(null)}>Reset sales</Button>}<Button disabled={!!saving || unsaved || (total <= 0 && ledger <= 0)} onClick={finalize}><LockKeyhole size={16} aria-hidden="true" />{saving === "finalize" ? "Finalizing…" : "Finalize month"}</Button><p>{unsaved ? "Save or clear all entries before finalizing." : "Finalizing locks this month and carries its closing value into the next month."}</p></div>}
        {finalized && !readOnly && <form className="inventory-reopen" onSubmit={reopen}><label className="inventory-field">Reason for reopening<Input required maxLength={1000} disabled={!!saving} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Describe the correction needed" /></label><Button type="submit" variant="ghost" disabled={!!saving || !reopenReason.trim()}>{saving === "reopen" ? "Reopening…" : "Reopen month"}</Button></form>}
      </Card>
      <p className="dash__provenance">Inventory is shared across the BTB company. Counts are retained for 24 months. Finalized figures come from the saved snapshot; unavailable opening inventory remains “—”.</p>
    </>}
  </div>;
}
