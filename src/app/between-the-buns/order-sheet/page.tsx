"use client";

import { useState } from "react";
import { ClipboardList, History, Save, Search } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import Modal from "@/components/Modal";
import { Badge, Button, Input, PageHeader } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import OnePagePrint, { PrintSheetButton } from "@/components/btb/OnePagePrint";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { BROOKS_ORDER_GUIDE } from "@/lib/brooks-order-guide";
import { btbToday, isIsoDate, isVersion } from "@/lib/btb-team";
import { orderQuantity, orderTotal, validOrderLines, type BtbOrder, type BtbOrderRevision, type OrderLine } from "@/lib/btb-operations";
import { fetchJson } from "@/lib/fetch-json";

type OrderData = { orders: BtbOrder[]; hasMore: boolean };
interface OrderDraft { version: number; lines: OrderLine[] }
const number = (value: number) => Number(value.toFixed(2)).toLocaleString("en-CA");

export default function OrderSheetPage() {
  return <BtbFeatureGate feature="order_sheet" wide>{(readOnly) => <OrderWorkspace readOnly={readOnly} />}</BtbFeatureGate>;
}

function OrderWorkspace({ readOnly }: { readOnly: boolean }) {
  const [date, setDate] = useState(btbToday);
  const [history, setHistory] = useState(false);
  const [revisions, setRevisions] = useState<BtbOrder | null>(null);
  return <div className="ops-workspace"><div className="btb-screen ops-workspace"><PageHeader title="Order sheet" subtitle="Set your PAR, count what’s on hand, and compare with your previous order." action={<Button variant="ghost" onClick={() => setHistory(!history)} aria-expanded={history}><History size={18} />{history ? "Hide order history" : "Order history"}</Button>} /><div className="ops-toolbar"><label className="ops-inline-field">Order date<Input type="date" max={btbToday()} value={date} onChange={(event) => { if (isIsoDate(event.target.value)) setDate(event.target.value); }} /></label><p className="ops-meta">Order = PAR − on hand · minimum 0</p></div></div>
    <OrderDay key={date} date={date} readOnly={readOnly} onHistory={() => setHistory(true)} onRevisions={setRevisions} />
    {history && <div className="btb-screen"><OrderHistory onView={(day) => { setDate(day); window.scrollTo({ top: 0, behavior: "instant" }); }} onRevisions={setRevisions} /></div>}
    {revisions && <OrderRevisions order={revisions} onClose={() => setRevisions(null)} />}
  </div>;
}

function OrderDay({ date, readOnly, onHistory, onRevisions }: { date: string; readOnly: boolean; onHistory: () => void; onRevisions: (order: BtbOrder) => void }) {
  const current = useBtbData<OrderData>(`/api/btb/orders?date=${date}`);
  const prior = useBtbData<OrderData>(`/api/btb/orders?before=${date}`);
  const loading = current.loading || prior.loading;
  const error = current.error || prior.error;
  const reload = () => { current.reload(); prior.reload(); };
  return <><div className="btb-screen"><LoadState loading={loading} error={error} onRetry={reload} /></div>{current.data && prior.data && <OrderEditor date={date} readOnly={readOnly} saved={current.data.orders[0]} previous={prior.data.orders[0]} onReload={reload} onHistory={onHistory} onRevisions={onRevisions} onSaved={(order) => current.update((data) => ({ ...data, orders: [order] }))} />}</>;
}

function OrderEditor({ date, readOnly, saved, previous, onReload, onSaved, onHistory, onRevisions }: { date: string; readOnly: boolean; saved?: BtbOrder; previous?: BtbOrder; onReload: () => void; onSaved: (order: BtbOrder) => void; onHistory: () => void; onRevisions: (order: BtbOrder) => void }) {
  const { identity } = useBtbWorkspace();
  const storageKey = `btb:orders:v2:${identity?.employeeId ?? identity?.role}:${date}`;
  const [draft, setDraft] = useState<OrderDraft | null>(() => {
    if (readOnly) return null;
    try { const value = JSON.parse(localStorage.getItem(storageKey) ?? "null"); return value && isVersion(value.version) && validOrderLines(value.lines) ? value : null; } catch { return null; }
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const lines = draft?.lines ?? saved?.lines ?? [];
  const stale = !!draft && draft.version !== (saved?.version ?? 0);
  const catalogNames = new Set(BROOKS_ORDER_GUIDE.flatMap((group) => group.items.map((item) => item.name)));
  const archived = lines.filter((line) => !catalogNames.has(line.item_name));
  const groups = [...BROOKS_ORDER_GUIDE, ...(archived.length ? [{ category: "Archived items", items: archived.map((line) => ({ n: "", name: line.item_name })) }] : [])];
  const visible = groups.filter((group) => !category || group.category === category).map((group) => ({ ...group, items: group.items.filter((item) => `${item.name} ${item.n}`.toLowerCase().includes(query.toLowerCase())) })).filter((group) => group.items.length);
  const persist = (next: OrderDraft | null) => {
    setDraft(next); setNotice("");
    try { if (next) localStorage.setItem(storageKey, JSON.stringify(next)); else localStorage.removeItem(storageKey); setStorageError(""); }
    catch { setStorageError("This browser cannot retain the draft after closing. Keep the page open until your save succeeds."); }
  };
  const change = (name: string, field: "par" | "on_hand", value: string) => {
    const existing = lines.find((line) => line.item_name === name);
    const prior = previous?.lines.find((line) => line.item_name === name);
    const line = { item_name: name, par: existing?.par ?? prior?.par ?? 0, on_hand: existing?.on_hand ?? 0, [field]: Number(value) || 0 };
    persist({ version: draft?.version ?? saved?.version ?? 0, lines: [...lines.filter((line) => line.item_name !== name), line] });
  };
  const save = async () => {
    if (saving || !draft || stale || readOnly) return;
    setSaving(true); setError(""); setNotice("");
    try { const result = await fetchJson<{ order: BtbOrder }>("/api/btb/orders", jsonRequest({ date, ...draft })); onSaved(result.order); persist(null); setNotice(`Order saved for ${date}. Version ${result.order.version} is in your permanent history.`); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  const copyPars = () => {
    if (!previous) return;
    const copied = [...lines];
    for (const old of previous.lines) {
      if (!catalogNames.has(old.item_name)) continue;
      const index = copied.findIndex((line) => line.item_name === old.item_name);
      if (index >= 0) copied[index] = { ...copied[index], par: old.par };
      else copied.push({ item_name: old.item_name, par: old.par, on_hand: 0 });
    }
    persist({ version: draft?.version ?? saved?.version ?? 0, lines: copied });
  };
  return <><div className="btb-screen ops-workspace">
    <div className="ops-savebar"><div><strong>{number(orderTotal(lines))} units to order</strong><p>{lines.filter((line) => orderQuantity(line) > 0).length} order items · {draft ? "Unsaved draft" : saved ? `Saved by ${saved.saved_by_name} · version ${saved.version}` : "No saved order yet"}</p></div><div className="ui-actions"><PrintSheetButton label="Print saved order" disabled={!saved} />{saved && <Button variant="ghost" onClick={() => onRevisions(saved)}>Versions ({saved.version})</Button>}{!readOnly && <Button disabled={!draft || saving || stale} onClick={save}><Save size={17} />{saving ? "Saving…" : "Save order"}</Button>}</div></div>
    {error && <div className="ui-notice ui-notice--error" role="alert"><div>{error}<br /><Button variant="ghost" disabled={saving} onClick={onReload}>Reload saved order</Button></div></div>}{notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}{storageError && <p className="ui-notice ui-notice--warning" role="status">{storageError}</p>}
    {stale && <div className="ui-notice ui-notice--warning"><div><strong>This order changed on another device.</strong><p>Your draft is retained. Compare it with the saved version before replacing that version.</p><div className="ui-actions">{saved && <Button variant="ghost" onClick={() => onRevisions(saved)}>View saved version</Button>}<Button variant="ghost" onClick={() => persist({ ...draft!, version: saved?.version ?? 0 })}>Use my draft with latest version</Button></div></div></div>}
    <div className="ops-toolbar"><label className="dash-search"><Search size={17} /><span className="sr-only">Search order items</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Item or supplier number" /></label><label className="ops-inline-field">Category<select className="ui-input" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{groups.map((group) => <option key={group.category}>{group.category}</option>)}</select></label></div>
    <div className="ops-toolbar"><p className="ops-meta">Previous column: {previous ? `saved order from ${previous.order_date}` : "no earlier order"}. {readOnly ? "" : "A faint PAR hint is copied when you enter an on-hand count."}</p><div className="ui-actions">{!readOnly && previous && <Button variant="ghost" disabled={saving || stale} onClick={copyPars}>Use previous PARs</Button>}{draft && <Button variant="ghost" disabled={saving} onClick={() => { persist(null); setError(""); }}>Discard order draft</Button>}<Button variant="soft" onClick={onHistory}>View older orders</Button></div></div>
    <div className="ops-table-wrap order-table-wrap"><table className="ops-table order-table"><caption>Brooks order guide · {date} · quantities in supplier units</caption><thead><tr><th scope="col">Item</th><th scope="col">PAR</th><th scope="col">On hand</th><th scope="col">Order</th><th scope="col">Previous<br /><span>{previous?.order_date ?? "—"}</span></th></tr></thead>{visible.map((group) => <tbody key={group.category}><tr className="order-category"><th colSpan={5} scope="colgroup">{group.category}</th></tr>{group.items.map((item) => {
      const line = lines.find((line) => line.item_name === item.name);
      const last = previous?.lines.find((line) => line.item_name === item.name);
      return <tr key={item.name}><th scope="row"><span>{item.name}</span>{item.n && <small>#{item.n}</small>}</th><td>{readOnly ? line ? number(line.par) : "—" : <Input type="number" min={0} max={100000} step="any" inputMode="decimal" aria-label={`PAR for ${item.name}`} disabled={saving} value={line?.par ?? ""} placeholder={last ? String(last.par) : "0"} onChange={(event) => change(item.name, "par", event.target.value)} />}</td><td>{readOnly ? line ? number(line.on_hand) : "—" : <Input type="number" min={0} max={100000} step="any" inputMode="decimal" aria-label={`On hand for ${item.name}`} disabled={saving} value={line?.on_hand ?? ""} placeholder="0" onChange={(event) => change(item.name, "on_hand", event.target.value)} />}</td><td className="order-quantity">{line ? number(orderQuantity(line)) : "—"}</td><td className="order-previous">{last ? number(orderQuantity(last)) : "—"}</td></tr>;
    })}</tbody>)}</table></div>{!visible.length && <div className="ui-empty"><h2>No matching items.</h2><p>Try a different item name or category.</p></div>}
    {!readOnly && <div className="ops-savebar"><p>Save to create a dated snapshot and retain every earlier version.</p><Button disabled={!draft || saving || stale} onClick={save}><Save size={17} />{saving ? "Saving…" : "Save order"}</Button></div>}
  </div>{saved && <OrderPrint order={saved} />}</>;
}

function OrderPrint({ order }: { order: BtbOrder }) {
  const size = Math.max(1, Math.ceil(order.lines.length / 3));
  const chunks = [order.lines.slice(0, size), order.lines.slice(size, size * 2), order.lines.slice(size * 2)];
  return <OnePagePrint label="Saved order print sheet"><header className="ops-print-heading"><div><h1>Between the Buns · Order sheet</h1><p>{order.order_date} · Version {order.version} · {order.saved_by_name}</p></div><span>{number(orderTotal(order.lines))} units · {order.lines.length} recorded items</span></header><div className="order-print-columns">{chunks.filter((chunk) => chunk.length).map((chunk, index) => <table key={index}><thead><tr><th>Item</th><th>PAR</th><th>Hand</th><th>Order</th></tr></thead><tbody>{chunk.map((line) => <tr key={line.item_name}><td>{line.item_name}</td><td>{number(line.par)}</td><td>{number(line.on_hand)}</td><td><strong>{number(orderQuantity(line))}</strong></td></tr>)}</tbody></table>)}</div>{!order.lines.length && <p>No quantities recorded.</p>}<p className="ops-print-footer">ORDER = PAR − ON HAND, minimum 0. All recorded items are included. Saved {order.saved_at}.</p></OnePagePrint>;
}

function OrderHistory({ onView, onRevisions }: { onView: (date: string) => void; onRevisions: (order: BtbOrder) => void }) {
  const { data, loading, error, reload } = useBtbData<OrderData>("/api/btb/orders");
  const [older, setOlder] = useState<BtbOrder[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const orders = [...(data?.orders ?? []), ...older];
  const next = async () => {
    if (busy || !orders.length) return;
    setBusy(true); setPageError("");
    try { const result = await fetchJson<OrderData>(`/api/btb/orders?before=${orders[orders.length - 1].order_date}`); setOlder([...older, ...result.orders]); setMore(result.hasMore); }
    catch (cause) { setPageError(messageOf(cause)); }
    finally { setBusy(false); }
  };
  return <section className="ops-workspace"><div className="ops-section-heading"><h2>Order history</h2><Badge accent="purple">Permanent snapshots</Badge></div><p className="ops-meta">Open any saved date or inspect its earlier versions.</p><LoadState loading={loading} error={error} onRetry={reload} />
    {!!orders.length && <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th scope="col">Date</th><th scope="col">Order</th><th scope="col">Saved by</th><th scope="col">History</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><Button variant="ghost" onClick={() => onView(order.order_date)}>{order.order_date}</Button></td><td>{number(orderTotal(order.lines))} units<br /><span className="ops-meta">{order.lines.filter((line) => orderQuantity(line) > 0).length} items</span></td><td>{order.saved_by_name}</td><td><Button variant="soft" onClick={() => onRevisions(order)}>View versions ({order.version})</Button></td></tr>)}</tbody></table></div>}
    {data && !orders.length && <div className="ui-empty"><ClipboardList size={28} /><h3>Your first saved order will appear here.</h3></div>}{pageError && <p className="ui-notice ui-notice--error" role="alert">{pageError}</p>}{(more ?? data?.hasMore) && <Button variant="ghost" onClick={next} disabled={busy}>{busy ? "Loading…" : "Load older orders"}</Button>}
  </section>;
}

function OrderRevisions({ order, onClose }: { order: BtbOrder; onClose: () => void }) {
  const { data, loading, error, reload } = useBtbData<{ revisions: BtbOrderRevision[]; hasMore: boolean }>(`/api/btb/orders?revisions=${order.id}`);
  const [older, setOlder] = useState<BtbOrderRevision[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [more, setMore] = useState<boolean | null>(null);
  const revisions = [...(data?.revisions ?? []), ...older];
  const revision = revisions.find((item) => item.version === selected) ?? revisions[0];
  const next = async () => {
    if (busy) return; setBusy(true); setPageError("");
    try { const result = await fetchJson<{ revisions: BtbOrderRevision[]; hasMore: boolean }>(`/api/btb/orders?revisions=${order.id}&offset=${revisions.length}`); setOlder([...older, ...result.revisions]); setMore(result.hasMore); }
    catch (cause) { setPageError(messageOf(cause)); }
    finally { setBusy(false); }
  };
  return <Modal open title={`Order versions · ${order.order_date}`} description="Every confirmed save is kept as a permanent snapshot." onClose={onClose}><div className="ops-workspace"><LoadState loading={loading} error={error} onRetry={reload} />{revision && <><label className="ops-inline-field">Saved version<select className="ui-input" value={revision.version} onChange={(event) => setSelected(Number(event.target.value))}>{revisions.map((item) => <option key={item.id} value={item.version}>Version {item.version} · {item.saved_by_name}</option>)}</select></label><p className="ops-meta">{revision.saved_at} · {number(orderTotal(revision.lines))} units</p><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Item</th><th>PAR</th><th>Hand</th><th>Order</th></tr></thead><tbody>{revision.lines.map((line) => <tr key={line.item_name}><td>{line.item_name}</td><td>{number(line.par)}</td><td>{number(line.on_hand)}</td><td>{number(orderQuantity(line))}</td></tr>)}</tbody></table></div></>}{pageError && <p role="alert">{pageError}</p>}{(more ?? data?.hasMore) && <Button variant="ghost" onClick={next} disabled={busy}>{busy ? "Loading…" : "Load earlier versions"}</Button>}</div></Modal>;
}
