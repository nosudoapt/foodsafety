"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleAlert, FileText, Lock, RefreshCw, Save, Upload } from "lucide-react";
import { Badge, Button, Card, Input, StatTile } from "@/components/ui";
import { LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";
import {
  closingValue,
  foodCost,
  inventoryReadiness,
  lineValue,
  money,
  monthLabel,
  numberOf,
  parseQuantity,
  purchaseLineDraft,
  purchaseLinesProblem,
  rowsOf,
  salesTotal,
  textOf,
  SALES_BASIS,
  type InventoryData,
  type InventoryImport,
  type PurchaseLineDraft,
  type SalesFigure,
} from "@/lib/btb-platform-inventory";

export default function InventoryPanel({ locationId, month, data, loading, error, reload }: {
  locationId: string;
  month: string;
  data: InventoryData | null;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return <>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && <InventoryWorkspace locationId={locationId} month={month} data={data} reload={reload} />}
  </>;
}

function InventoryWorkspace({ locationId, month, data, reload }: {
  locationId: string;
  month: string;
  data: InventoryData;
  reload: () => void;
}) {
  return <section className="ops-panel" aria-label="Inventory and food cost">
    <div className="ops-toolbar">
      <div>
        <h2 className="ops-section-title">{monthLabel(month)} · inventory &amp; food cost</h2>
        <p className="ops-meta">
          COGS = opening + purchases − closing. Food cost % = COGS ÷ net sales × 100.
          A missing figure is reported as missing and is never counted as zero.
        </p>
      </div>
      <Button variant="ghost" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh ledger</Button>
    </div>
    <ReadinessStrip data={data} />
    <div className="ops-reading-grid">
      <FoodCostCard data={data} />
      <SalesCard locationId={locationId} month={month} data={data} reload={reload} />
    </div>
    <DocumentQueue locationId={locationId} month={month} data={data} reload={reload} />
    <ClosingCount locationId={locationId} month={month} data={data} reload={reload} />
    <PurchasesCard data={data} locationId={locationId} month={month} reload={reload} />
    <PeriodClose locationId={locationId} month={month} data={data} reload={reload} />
  </section>;
}

function ReadinessStrip({ data }: { data: InventoryData }) {
  const steps = inventoryReadiness(data);
  const done = steps.filter((step) => step.done).length;
  return <Card><div className="ops-panel">
    <div className="ops-toolbar">
      <h3>Month close readiness</h3>
      <Badge accent={done === steps.length ? "green" : "amber"}>{done} of {steps.length} complete</Badge>
    </div>
    <ul className="ops-readiness">
      {steps.map((step) => <li key={step.key} className={step.done ? "ops-ready" : "ops-pending"}>
        <span aria-hidden="true">{step.done ? <Check size={15} /> : <CircleAlert size={15} />}</span>
        <div>
          <strong>{step.label}</strong>
          <p className="ops-meta">{step.detail}</p>
        </div>
      </li>)}
    </ul>
  </div></Card>;
}

function FoodCostCard({ data }: { data: InventoryData }) {
  const snapshot = data.snapshot;
  const summary = data.summary;
  const closing = snapshot?.status === "finalized"
    ? snapshot.closing_value
    : closingValue((data.counts ?? []).map((count) => ({
        value: count.line_value === null ? null : lineValue(count.cases, count.packets, null, null) ?? count.line_value,
      })));

  const opening = snapshot?.status === "finalized" ? snapshot.opening_value : summary?.opening_value ?? null;
  const purchases = snapshot?.status === "finalized"
    ? snapshot.purchases
    : (data.purchases ?? []).filter((row) => !row.voided_at).reduce((total, row) => total + row.amount, 0);
  const sales = snapshot?.status === "finalized" ? snapshot.sales : summary?.sales ?? null;
  const result = foodCost(opening, purchases, closing, sales);

  return <Card><div className="ops-panel">
    <h3>Food cost</h3>
    <div className="inventory-metrics">
      <StatTile label="Opening inventory" value={money(opening)} />
      <StatTile label="Purchases" value={money(purchases)} />
      <StatTile label="Closing inventory" value={money(closing)} />
      <StatTile label="COGS" value={money(result.cogs)} icon={AlertTriangle} accent={result.cogs === null ? "amber" : "purple"} />
      <StatTile label="Net sales" value={money(sales)} />
      <StatTile label="Food cost %" value={result.foodCostPct === null ? "Missing" : `${result.foodCostPct.toFixed(2)}%`} icon={AlertTriangle} accent={result.foodCostPct === null ? "amber" : "green"} />
    </div>
    {result.missing.length > 0 && <p className="ui-notice ui-notice--warning">
      <AlertTriangle size={18} aria-hidden="true" />
      <span>Cannot compute yet — missing: {result.missing.join(", ")}.</span>
    </p>}
    {snapshot?.status === "finalized" && <p className="ops-meta">
      Finalized record. Reopen the month to correct a stored figure; every correction is kept in the audit history.
    </p>}
  </div></Card>;
}

function SalesCard({ locationId, month, data, reload }: {
  locationId: string;
  month: string;
  data: InventoryData;
  reload: () => void;
}) {
  const salesImport = (data.imports ?? []).find((row) => row.kind === "sales") ?? null;
  const figures = useMemo(() => {
    const rows = rowsOf(salesImport?.extracted_data?.figures);
    return rows.map((row) => ({ label: textOf(row.label), value: numberOf(row.value) }))
      .filter((row): row is SalesFigure => row.label !== "" && row.value !== null);
  }, [salesImport]);
  const [basis, setBasis] = useState(SALES_BASIS);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const total = salesTotal(figures, basis);
  const confirmed = data.summary?.sales_confirmed && (data.summary.sales ?? 0) > 0;

  const confirm = async () => {
    if (busy || !salesImport) return;
    setBusy(true); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/inventory", jsonRequest({
        location_id: locationId,
        month,
        action: "confirm_sales",
        data: {
          import_id: salesImport.id,
          month,
          basis,
          figures,
          review_confirmed: true,
          reason: confirmed ? "Reconfirmed reviewed POS net sales" : "",
          version: data.summary?.version ?? 0,
        },
      }));
      setNotice(`Net sales confirmed: ${money(total)}.`);
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(false); }
  };

  return <Card><div className="ops-panel">
    <h3>Net sales</h3>
    {!salesImport && <p className="ops-meta">Upload this month&apos;s POS report in the document queue to review its figures.</p>}
    {salesImport && salesImport.status !== "review" && <SalesConfirmed data={data} salesImport={salesImport} />}
    {salesImport && salesImport.status === "review" && <>
      <p className="ops-meta">Review the extracted figures. Choose the one unambiguous basis that will be used for food cost %.</p>
      {figures.length === 0 && <p className="ui-notice ui-notice--warning">
        <AlertTriangle size={18} aria-hidden="true" />
        <span>No figures could be read from this document. Enter the net sales figure on the POS report before confirming.</span>
      </p>}
      {figures.length > 0 && <div className="ops-basis-list">
        {figures.map((figure) => <label key={figure.label} className="ops-checkbox">
          <input type="radio" name="sales-basis" checked={basis === figure.label} onChange={() => setBasis(figure.label)} />
          <span>{figure.label} · {money(figure.value)}</span>
        </label>)}
      </div>}
      {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
      {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      <Button disabled={busy || total === null} onClick={confirm}>
        <Check size={16} aria-hidden="true" />{busy ? "Confirming…" : "Confirm reviewed net sales"}
      </Button>
      {figures.length > 0 && total === null && <p className="ui-notice ui-notice--warning">Choose exactly one figure as the sales basis.</p>}
    </>}
  </div></Card>;
}

function SalesConfirmed({ data }: { data: InventoryData; salesImport: InventoryImport }) {
  return <div className="ops-figure">
    <p className="ops-meta">Confirmed sales basis</p>
    <strong>{data.snapshot?.sales_basis ?? data.summary?.sales_basis ?? SALES_BASIS}</strong>
    <p className="ops-figure__value">{money(data.snapshot?.sales ?? data.summary?.sales)}</p>
    <p className="ops-meta">A correction requires a reason and is recorded in the audit history.</p>
  </div>;
}

const IMPORT_KINDS = [
  { kind: "master", label: "Master inventory" },
  { kind: "gfs", label: "GFS invoice" },
  { kind: "local", label: "Local receipt" },
  { kind: "sales", label: "POS sales report" },
] as const;

const KIND_LABEL: Record<string, string> = {
  master: "Master inventory",
  gfs: "GFS invoice",
  local: "Local receipt",
  sales: "POS sales report",
};

const readFileBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result ?? "");
    resolve(result.slice(result.indexOf(",") + 1));
  };
  reader.onerror = () => reject(new Error("The file could not be read. Choose it again and retry."));
  reader.readAsDataURL(file);
});

function DocumentQueue({ locationId, month, data, reload }: {
  locationId: string;
  month: string;
  data: InventoryData;
  reload: () => void;
}) {
  const [kind, setKind] = useState<(typeof IMPORT_KINDS)[number]["kind"]>("gfs");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const pending = (data.imports ?? []).filter((row) => row.status === "review");

  const upload = async (file: File) => {
    if (busy) return;
    setBusy(true); setFailure(""); setNotice("");
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error("Choose a file no larger than 3 MB.");
      const content_base64 = await readFileBase64(file);
      const mime = file.type || (file.name.endsWith(".csv") ? "text/csv" : "application/pdf");
      const saved = await fetchJson<{ file: { id: string } }>("/api/btb/platform/file", jsonRequest({
        location_id: locationId,
        purpose: kind === "sales" ? "sales" : "purchase",
        name: file.name,
        mime,
        content_base64,
      }));
      await fetchJson("/api/btb/platform/import", jsonRequest({
        location_id: locationId,
        month,
        kind,
        file_id: saved.file.id,
        extractor: "manual-upload",
        error: "No document extraction provider is configured. Read the source document and enter its reviewed values here.",
      }));
      setNotice(`${file.name} was added to the review queue. Nothing reached the ledger yet.`);
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(false); }
  };

  return <Card><div className="ops-panel">
    <div className="ops-toolbar">
      <div>
        <h3><FileText size={18} aria-hidden="true" /> Document review queue</h3>
        <p className="ops-meta">
          Every invoice, receipt and POS report waits here until a person confirms the values.
          A file you upload is not a purchase or a sale until you review it.
        </p>
      </div>
      <Badge accent={pending.length ? "amber" : "green"}>{pending.length} awaiting review</Badge>
    </div>

    <div className="ops-form-grid">
      <label>Document type
        <select className="ui-input" value={kind} disabled={busy}
          onChange={(event) => setKind(event.target.value as typeof kind)}>
          {IMPORT_KINDS.map((row) => <option key={row.kind} value={row.kind}>{row.label}</option>)}
        </select>
      </label>
      <label>Source file (PDF, image or CSV, up to 3 MB)
        <input className="ui-input" type="file" disabled={busy}
          accept="application/pdf,image/png,image/jpeg,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }} />
      </label>
    </div>
    {busy && <p className="ops-meta" role="status"><Upload size={14} aria-hidden="true" /> Uploading to the private review queue…</p>}
    {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}

    {!pending.length && <p className="ui-empty">No documents are waiting for review this month.</p>}
    {pending.map((row) => <ImportReview key={row.id} row={row} locationId={locationId} month={month} reload={reload} />)}
  </div></Card>;
}

function ImportReview({ row, locationId, month, reload }: {
  row: InventoryImport;
  locationId: string;
  month: string;
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");

  const extracted = row.extracted_data ?? {};
  const invoice = {
    vendor: textOf(extracted.vendor),
    reference: textOf(extracted.reference),
    date: textOf(extracted.date),
    total: textOf(extracted.total),
  };
  const [vendor, setVendor] = useState(invoice.vendor);
  const [reference, setReference] = useState(invoice.reference);
  const [date, setDate] = useState(invoice.date);
  const [total, setTotal] = useState(invoice.total);
  const [lines, setLines] = useState<PurchaseLineDraft[]>(() =>
    rowsOf(extracted.lines).map((line) => purchaseLineDraft(line)));
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const reset = () => {
    setVendor(invoice.vendor);
    setReference(invoice.reference);
    setDate(invoice.date);
    setTotal(invoice.total);
    setLines(rowsOf(extracted.lines).map((line) => purchaseLineDraft(line)));
    setReviewConfirmed(false);
  };

  const updateLine = (index: number, key: keyof PurchaseLineDraft, value: string) => {
    setLines((current) => current.map((line, at) => at === index ? { ...line, [key]: value } : line));
  };

  const post = async (action: string, data: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/inventory", jsonRequest({ location_id: locationId, month, action, data }));
      setNotice("Saved. The month's record has been updated.");
      setOpen(false);
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const confirmPurchase = () => {
    if (row.kind !== "gfs" && row.kind !== "local") return;
    setFailure(""); setNotice("");
    const problem = purchaseLinesProblem(lines);
    if (problem) { setFailure(problem); return; }
    const amount = parseQuantity(total);
    if (!vendor.trim()) { setFailure("Enter the supplier shown on the receipt."); return; }
    if (amount === null) { setFailure("Enter the confirmed CAD total."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setFailure("Enter the purchase date as YYYY-MM-DD."); return; }
    if (row.kind === "gfs" && !reference.trim()) { setFailure("Enter the GFS invoice number."); return; }
    if (!reviewConfirmed) { setFailure("Tick to confirm you checked these values against the source document."); return; }
    void post("confirm_purchase", {
      import_id: row.id,
      vendor: vendor.trim(),
      reference: reference.trim(),
      date,
      total: amount,
      currency: "CAD",
      description: vendor.trim(),
      review_confirmed: true,
      duplicate_reason: reason.trim(),
      lines: lines
        .map((line) => ({
          item_id: line.item_id,
          description: line.description.trim(),
          item_code: line.item_code,
          cases: parseQuantity(line.cases) ?? 0,
          packets: parseQuantity(line.packets) ?? 0,
          unit_price: line.unit_price.trim() === "" ? null : parseQuantity(line.unit_price),
          line_total: parseQuantity(line.line_total),
        }))
        .filter((line) => line.description !== ""),
    });
  };

  return <article className="ops-import">
    <div className="ops-import__head">
      <div>
        <Badge accent="amber">{KIND_LABEL[row.kind] ?? row.kind}</Badge>
        <strong>{textOf(extracted.vendor) || textOf(extracted.description) || row.file_id.slice(0, 8)}</strong>
        <p className="ops-meta">
          Uploaded {new Date(row.created_at).toLocaleString("en-CA")} · {row.extractor}
        </p>
      </div>
      <Button variant="ghost" onClick={() => { setOpen((value) => !value); reset(); }}>
        {open ? "Close" : "Review & edit"}
      </Button>
    </div>
    {(row.extraction_error || row.extraction_error !== null) && !open && <p className="ui-notice ui-notice--warning">
      <AlertTriangle size={16} aria-hidden="true" /><span>{row.extraction_error}</span>
    </p>}
    {open && <div className="ops-panel">
      {row.kind !== "master" && row.kind !== "sales" && <>
        <div className="ops-form-grid">
          <label>Supplier<Input value={vendor} disabled={busy} onChange={(event) => setVendor(event.target.value)} /></label>
          <label>Invoice / receipt number<Input value={reference} disabled={busy} placeholder={row.kind === "gfs" ? "Required for GFS" : "Optional"} onChange={(event) => setReference(event.target.value)} /></label>
          <label>Purchase date<Input value={date} disabled={busy} type="date" onChange={(event) => setDate(event.target.value)} /></label>
          <label>Confirmed total (CAD)<Input value={total} disabled={busy} inputMode="decimal" onChange={(event) => setTotal(event.target.value)} /></label>
        </div>
        <div className="ops-import__lines">
          <h4>Purchased lines</h4>
          {lines.map((line, index) => {
            return <div className="ops-line" key={index}>
              <Input aria-label={`Line ${index + 1} description`} value={line.description} disabled={busy} placeholder="Item description" onChange={(event) => updateLine(index, "description", event.target.value)} />
              <Input aria-label={`Line ${index + 1} item code`} value={line.item_code ?? ""} disabled={busy} placeholder="Code" onChange={(event) => updateLine(index, "item_code", event.target.value)} />
              <Input aria-label={`Line ${index + 1} cases`} value={line.cases} disabled={busy} inputMode="decimal" placeholder="Cases" onChange={(event) => updateLine(index, "cases", event.target.value)} />
              <Input aria-label={`Line ${index + 1} packets`} value={line.packets} disabled={busy} inputMode="decimal" placeholder="Packets" onChange={(event) => updateLine(index, "packets", event.target.value)} />
              <Input aria-label={`Line ${index + 1} unit price`} value={line.unit_price} disabled={busy} inputMode="decimal" placeholder="Unit $" onChange={(event) => updateLine(index, "unit_price", event.target.value)} />
              <Input aria-label={`Line ${index + 1} line total`} value={line.line_total} disabled={busy} inputMode="decimal" placeholder="Line total" onChange={(event) => updateLine(index, "line_total", event.target.value)} />
              <Button variant="ghost" aria-label={`Remove line ${index + 1}`} disabled={busy}
                onClick={() => setLines((current) => current.filter((_, at) => at !== index))}>Remove</Button>
            </div>;
          })}
          <Button variant="soft" disabled={busy} onClick={() => setLines((current) => [...current, purchaseLineDraft()])}>Add line</Button>
        </div>
        <label className="ops-checkbox"><input type="checkbox" checked={reviewConfirmed} disabled={busy} onChange={(event) => setReviewConfirmed(event.target.checked)} />
          <span>I checked these values against the original {KIND_LABEL[row.kind ?? "gfs"]}.</span></label>
        <label>Possible duplicate explanation (only if this looks like one already entered)
          <Input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="e.g. separate delivery of the same order" /></label>
      </>}
      {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
      {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      <div className="ops-toolbar">
        {row.kind !== "sales" && row.kind !== "master" && <Button disabled={busy || !reviewConfirmed} onClick={confirmPurchase}>
          <Save size={16} aria-hidden="true" />{busy ? "Saving…" : "Confirm reviewed purchase"}
        </Button>}
        <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void post("reject_import", { import_id: row.id, reason: reason.trim() })}>
          <Lock size={16} aria-hidden="true" />Reject with reason
        </Button>
      </div>
    </div>}
  </article>;
}

function ClosingCount({ locationId, month, data, reload }: {
  locationId: string;
  month: string;
  data: InventoryData;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Record<string, { cases: string; packets: string }>>({});

  const savedCounts = useMemo(() => {
    const byItem: Record<string, { cases: string; packets: string }> = {};
    for (const count of data.counts ?? []) {
      byItem[count.item_id] = {
        cases: count.cases == null ? "" : String(count.cases),
        packets: count.packets == null ? "" : String(count.packets),
      };
    }
    return byItem;
  }, [data.counts]);

  const cell = (itemId: string) => draft[itemId] ?? savedCounts[itemId] ?? { cases: "", packets: "" };

  const setCell = (itemId: string, key: "cases" | "packets", value: string) => {
    setDraft((current) => ({ ...current, [itemId]: { ...cell(itemId), [key]: value } }));
  };

  const lines = data.items.map((item) => {
    const value = cell(item.id);
    const cases = parseQuantity(value.cases);
    const packets = parseQuantity(value.packets);
    const priced = lineValue(cases, packets, item.case_price, item.packet_price);
    return { item, cases, packets, priced };
  });
  const total = closingValue(lines.map((line) => ({ value: line.priced })));
  const incomplete = lines.filter((line) => line.cases === null || line.packets === null).length;
  const unpriced = data.items.filter((item) => item.case_price == null || item.packet_price == null || item.pack_size == null).length;

  const save = async () => {
    if (busy) return;
    const blank = lines.filter((line) => line.cases === null || line.packets === null);
    if (blank.length) {
      setFailure(`Enter cases and packets for every item. ${blank.length} line${blank.length === 1 ? " is" : "s are"} still blank. A blank is not zero.`);
      return;
    }
    setBusy(true); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/inventory", jsonRequest({
        location_id: locationId,
        month,
        action: "counts",
        data: {
          version: data.summary?.version ?? 0,
          counts: lines.map((line) => ({
            item_id: line.item.id,
            cases: line.cases,
            packets: line.packets,
          })),
        },
      }));
      setNotice(`Closing counts saved. Counted value ${money(total)}.`);
      setDraft({});
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const finalized = data.snapshot?.status === "finalized";

  return <Card><div className="ops-panel">
    <div className="ops-toolbar">
      <div>
        <h3>Closing counts</h3>
        <p className="ops-meta">
          Enter cases and packets for every item. Pack conversion comes from the catalogue,
          so a packet is never guessed as a fraction of a case.
        </p>
      </div>
      <Badge accent={incomplete === 0 && data.items.length > 0 ? "green" : "amber"}>
        {data.items.length - incomplete} of {data.items.length} counted
      </Badge>
    </div>
    {unpriced > 0 && <p className="ui-notice ui-notice--warning">
      <AlertTriangle size={18} aria-hidden="true" />
      <span>{unpriced} item(s) have no case/packet price or pack size, so their line value is missing. Correct the catalogue before finalizing.</span>
    </p>}
    {!data.items.length && <p className="ui-empty">Import the master inventory list first — there is nothing to count.</p>}
    {data.items.length > 0 && <div className="ops-table-wrap"><table className="ops-table">
      <caption>Counted closing inventory for {monthLabel(month)}</caption>
      <thead><tr><th>Item</th><th>Source</th><th>Cases</th><th>Packets</th><th>Line value</th></tr></thead>
      <tbody>
        {lines.map(({ item, priced }) => <tr key={item.id}>
          <td><strong>{item.name}</strong>{item.item_number && <small className="ops-meta"> · {item.item_number}</small>}</td>
          <td>{item.source}</td>
          <td><Input aria-label={`${item.name} cases`} inputMode="decimal" value={cell(item.id).cases}
            disabled={busy || finalized} onChange={(event) => setCell(item.id, "cases", event.target.value)} /></td>
          <td><Input aria-label={`${item.name} packets`} inputMode="decimal" value={cell(item.id).packets}
            disabled={busy || finalized} onChange={(event) => setCell(item.id, "packets", event.target.value)} /></td>
          <td>{money(priced)}</td>
        </tr>)}
      </tbody>
      <tfoot><tr><td colSpan={4}><strong>Counted closing total</strong></td><td><strong>{money(total)}</strong></td></tr></tfoot>
    </table></div>}
    {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {data.items.length > 0 && <Button disabled={busy || finalized} onClick={save}>
      <Save size={16} aria-hidden="true" />{busy ? "Saving…" : "Save closing counts"}
    </Button>}
  </div></Card>;
}

function PurchasesCard({ locationId, month, data, reload }: {
  locationId: string;
  month: string;
  data: InventoryData;
  reload: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const active = (data.purchases ?? []).filter((row) => !row.voided_at);
  const voided = (data.purchases ?? []).filter((row) => row.voided_at);
  const total = active.reduce((sum, row) => sum + row.amount, 0);
  const gfs = active.filter((row) => row.type === "gfs").reduce((sum, row) => sum + row.amount, 0);
  const local = active.filter((row) => row.type === "local").reduce((sum, row) => sum + row.amount, 0);

  const act = async (action: string, payload: Record<string, unknown>, prompt: string) => {
    const reason = window.prompt(prompt)?.trim() ?? "";
    if (!reason) return;
    setBusy(action + (payload.id ?? "")); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/inventory", jsonRequest({
        location_id: locationId, month, action, data: { ...payload, reason, version: data.summary?.version ?? 0 },
      }));
      setNotice("The purchase ledger was updated.");
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(""); }
  };

  const confirmPurchases = async () => {
    if (busy) return;
    setBusy("confirm"); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/inventory", jsonRequest({
        location_id: locationId, month, action: "inputs",
        data: { purchases_confirmed: true, version: data.summary?.version ?? 0 },
      }));
      setNotice("Purchases marked complete for this month.");
      setConfirming(false);
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(""); }
  };

  return <Card><div className="ops-panel">
    <div className="ops-toolbar">
      <div>
        <h3>Purchases</h3>
        <p className="ops-meta">
          Only purchases confirmed from a reviewed invoice or receipt count toward COGS.
          Voiding a purchase requires a reason and is kept in the audit history.
        </p>
      </div>
      <div className="ui-stats-inline">
        <Badge accent="purple">GFS {money(gfs)}</Badge>
        <Badge accent="teal">Local {money(local)}</Badge>
        <Badge accent="slate">Total {money(total)}</Badge>
      </div>
    </div>
    {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {!active.length && !voided.length && <p className="ui-empty">No purchases have been confirmed for {monthLabel(month)} yet.</p>}
    {active.length > 0 && <div className="ops-table-wrap"><table className="ops-table">
      <caption>Confirmed purchases</caption>
      <thead><tr><th>Date</th><th>Type</th><th>Supplier</th><th>Reference</th><th>Amount</th><th /></tr></thead>
      <tbody>{active.map((row) => <tr key={row.id}>
        <td>{row.purchase_date}</td><td>{row.type.toUpperCase()}</td><td>{row.supplier}</td>
        <td>{row.reference ?? "—"}</td><td>{money(row.amount)}</td>
        <td><Button variant="ghost" disabled={!!busy} onClick={() => void act("void_purchase", { id: row.id }, "Why is this purchase being voided?")}>
          Void
        </Button></td>
      </tr>)}</tbody>
    </table></div>}
    {voided.length > 0 && <p className="ops-meta">{voided.length} voided purchase(s) retained in the audit history.</p>}
    {data.summary?.purchases_confirmed
      ? <p className="ui-notice ui-notice--success" role="status">Purchases are confirmed complete for {monthLabel(month)}. Adding or voiding a purchase resets this confirmation.</p>
      : confirming
        ? <div className="ops-savebar">
            <p>A new purchase resets this confirmation. Confirm only when every invoice and receipt for the month is entered.</p>
            <div className="ui-actions">
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button disabled={!!busy || !active.length} onClick={confirmPurchases}>
                <Check size={16} aria-hidden="true" />Confirm {active.length} purchase(s) complete
              </Button>
            </div>
          </div>
        : <Button disabled={!!busy || !active.length} onClick={() => setConfirming(true)}>
            <Check size={16} aria-hidden="true" />Confirm purchases complete
          </Button>}
  </div></Card>;
}

function PeriodClose({ locationId, month, data, reload }: {
  locationId: string;
  month: string;
  data: InventoryData;
  reload: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const finalized = data.snapshot?.status === "finalized";

  const run = async (action: "finalize" | "reopen") => {
    if (busy) return;
    let reason = "";
    if (action === "reopen") {
      reason = window.prompt("Why is this finalized month being reopened?")?.trim() ?? "";
      if (!reason) return;
    }
    setBusy(action); setFailure(""); setNotice("");
    try {
      await fetchJson("/api/btb/platform/inventory", jsonRequest({
        location_id: locationId,
        month,
        action,
        data: { reason, version: data.summary?.version ?? 0 },
      }));
      setNotice(action === "finalize"
        ? `${monthLabel(month)} was finalized with COGS ${money(data.snapshot?.cogs)}.`
        : `${monthLabel(month)} was reopened. Correct the record and finalize it again.`);
      reload();
    } catch (cause) { setFailure(messageOf(cause)); }
    finally { setBusy(""); }
  };

  return <Card><div className="ops-panel">
    <h3><Lock size={18} aria-hidden="true" /> Period close</h3>
    <p className="ops-meta">
      Finalizing locks the month and carries its closing inventory into the next opening.
      The database refuses to finalize while any prerequisite is missing.
    </p>
    {data.snapshot?.status === "finalized" && data.snapshot.finalized_at && <p className="ui-notice ui-notice--success">
      Finalized {new Date(data.snapshot.finalized_at).toLocaleString("en-CA")} with COGS {money(data.snapshot.cogs)}
      {data.snapshot.food_cost_pct !== null ? ` and ${data.snapshot.food_cost_pct.toFixed(2)}% food cost` : ""}.
    </p>}
    {failure && <p className="ui-notice ui-notice--error" role="alert">{failure}</p>}
    {notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
    {finalized
      ? <Button variant="danger" disabled={!!busy} onClick={() => void run("reopen")}>
          {busy === "reopen" ? "Reopening…" : "Reopen month"}
        </Button>
      : <Button disabled={!!busy} onClick={() => void run("finalize")}>
          <Lock size={16} aria-hidden="true" />{busy === "finalize" ? "Finalizing…" : `Finalize ${monthLabel(month)}`}
        </Button>}
  </div></Card>;
}
