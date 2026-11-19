"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input, StatTile } from "@/components/ui";
import { amount, cents, csvDocument, fromCents, invoiceStatus, type FinanceData, type Invoice } from "@/lib/btb-finance";
import { money } from "@/lib/btb-platform-inventory";
import { CommandFeedback, downloadCsv, useFinanceCommand, type FinanceCommand } from "./FinanceControls";

const STATUS_LABELS = { voided: "Voided", paid: "Paid", overdue: "Overdue", "part-paid": "Part-paid", unpaid: "Unpaid" } as const;
export default function InvoicesPanel({ locationId, data, canWrite, today, reload }: { locationId: string; data: FinanceData; canWrite: boolean; today: string; reload: () => void }) {
  const command = useFinanceCommand(locationId, reload);
  const [query, setQuery] = useState(""), [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ invoice: Invoice; mode: "terms" | "tax" } | null>(null);
  const active = data.invoices.filter((invoice) => !invoice.voided_at);
  const outstanding = fromCents(active.reduce((sum, invoice) => sum + cents(invoice.outstanding), 0));
  const overdue = active.filter((invoice) => invoiceStatus(invoice, today) === "overdue");
  const visible = data.invoices.filter((invoice) => (!status || invoiceStatus(invoice, today) === status) && `${invoice.vendor} ${invoice.reference ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="inventory-metrics"><StatTile label="Outstanding invoices" value={money(outstanding)} /><StatTile label="Overdue" value={`${overdue.length} · ${money(fromCents(overdue.reduce((sum, invoice) => sum + cents(invoice.outstanding), 0)))}`} accent="amber" /><StatTile label="Tax review needed" value={active.filter((invoice) => !invoice.tax_confirmed).length} /></div>
    <Card><div className="ops-panel"><div className="ops-toolbar"><h3>Invoice register</h3><Button variant="ghost" disabled={!visible.length} onClick={() => downloadCsv(csvDocument([["Supplier", "Reference", "Invoice date", "Due date", "Total CAD", "Paid CAD", "Outstanding CAD", "Status", "GST CAD", "Tax verified"], ...visible.map((invoice) => [invoice.vendor, invoice.reference, invoice.invoice_date, invoice.due_date, invoice.total, invoice.paid, invoice.outstanding, STATUS_LABELS[invoiceStatus(invoice, today)], invoice.gst, invoice.tax_confirmed ? "Yes" : "No"])]), `btb-invoices-${today}.csv`)}>Export invoice register</Button></div>
      <p className="ops-meta">Upload and approve invoices in Inventory &amp; food cost. Payments come only from explicitly confirmed bank allocations; blank due dates are not guessed.</p>
      <div className="ops-form-grid"><label>Search supplier or reference<Input value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Invoice status<select className="ui-input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <CommandFeedback command={command} />
      {!visible.length ? <p className="ui-empty">No invoices match this view.</p> : <div className="ops-table-wrap"><table className="ops-table"><caption>Approved source invoices · amounts in CAD</caption><thead><tr><th scope="col">Supplier / reference</th><th scope="col">Dates</th><th scope="col">Total</th><th scope="col">Paid</th><th scope="col">Outstanding</th><th scope="col">Status / GST</th><th scope="col">Review</th></tr></thead><tbody>{visible.map((invoice) => {
        const state = invoiceStatus(invoice, today);
        return <tr key={invoice.id}><td><strong>{invoice.vendor}</strong><p className="ops-meta">{invoice.reference ?? "Reference missing"}</p></td><td>{invoice.invoice_date}<p className="ops-meta">Due {invoice.due_date ?? "Missing"}</p></td><td>{money(invoice.total)}</td><td>{money(invoice.paid)}</td><td>{money(invoice.outstanding)}</td><td><Badge accent={state === "overdue" ? "red" : state === "paid" ? "green" : "slate"}>{STATUS_LABELS[state]}</Badge><p className="ops-meta">{invoice.tax_confirmed ? `GST ${money(invoice.gst)} · ${invoice.itc_eligible ? "ITC eligible" : "not ITC eligible"}` : "Tax unverified"}</p></td><td><div className="finance-row-actions"><a className="ops-link" href={`/api/btb/platform/file/${invoice.file_id}`} target="_blank" rel="noopener noreferrer">Original document</a>{canWrite && !invoice.voided_at && <><Button variant="ghost" onClick={() => setEditing({ invoice, mode: "terms" })}>Edit terms</Button><Button variant="soft" onClick={() => setEditing({ invoice, mode: "tax" })}>{invoice.tax_confirmed ? "Review GST" : "Verify GST"}</Button></>}</div></td></tr>;
      })}</tbody></table></div>}
    </div></Card>
    {editing && <InvoiceForm key={`${editing.invoice.id}:${editing.mode}`} invoice={editing.invoice} mode={editing.mode} command={command} onClose={() => setEditing(null)} />}
  </>;
}
function InvoiceForm({ invoice, mode, command, onClose }: { invoice: Invoice; mode: "terms" | "tax"; command: FinanceCommand; onClose: () => void }) {
  const [due, setDue] = useState(invoice.due_date ?? ""), [notes, setNotes] = useState(invoice.notes);
  const [tax, setTax] = useState({ subtotal: invoice.subtotal === null ? "" : String(invoice.subtotal), gst: invoice.gst === null ? "" : String(invoice.gst), other_tax: invoice.other_tax === null ? "" : String(invoice.other_tax), charges: invoice.charges === null ? "" : String(invoice.charges) });
  const [eligible, setEligible] = useState(invoice.itc_eligible === null ? "" : invoice.itc_eligible ? "yes" : "no"), [verified, setVerified] = useState(false);
  const title = mode === "tax" ? "Verify invoice GST" : "Edit invoice terms";
  return <Modal open title={title} description={`${invoice.vendor} · ${invoice.reference ?? invoice.invoice_date} · Total ${money(invoice.total)}`} busy={command.busy} onClose={onClose}>
    <form className="ui-form-stack" onSubmit={async (event) => {
      event.preventDefault();
      const values = mode === "tax" ? { total: invoice.total, subtotal: amount(tax.subtotal), gst: amount(tax.gst), other_tax: amount(tax.other_tax), charges: amount(tax.charges), itc_eligible: eligible === "" ? null : eligible === "yes" } : { due_date: due || null, notes };
      if (mode === "tax" && !verified) return;
      if (await command.act(mode === "tax" ? "invoice_tax" : "invoice_terms", { id: invoice.id, version: invoice.version, ...values }, mode === "tax" ? "GST verified. Purchase cost and month completeness have been updated." : "Invoice terms saved.")) onClose();
    }}>
      <fieldset className="ops-fieldset ui-form-stack" disabled={command.busy}>
        {mode === "terms" ? <><label>Due date (leave missing if unknown)<Input data-modal-autofocus type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label><label>Invoice notes<textarea className="ui-input" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></> : <>
          <p className="ops-meta">Verify against the original document. Subtotal + GST + other tax + charges must equal the total. Do not treat unprinted GST as zero. Reopen finalized GST or inventory periods before correcting purchase costs.</p>
          <div className="ops-form-grid">{([["subtotal", "Subtotal"], ["gst", "GST"], ["other_tax", "Other tax"], ["charges", "Additional charges"]] as const).map(([key, label], index) => <label key={key}>{label} (CAD)<Input data-modal-autofocus={index === 0 || undefined} inputMode="decimal" required value={tax[key]} onChange={(event) => { setTax({ ...tax, [key]: event.target.value }); setVerified(false); }} /></label>)}</div>
          <label>Input-tax-credit eligibility<select className="ui-input" required value={eligible} onChange={(event) => { setEligible(event.target.value); setVerified(false); }}><option value="">Not verified</option><option value="yes">Verified eligible</option><option value="no">Verified not eligible</option></select></label>
          <label className="ops-checkbox"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span>I checked the source tax breakdown and GST eligibility with the appropriate records / accountant.</span></label>
        </>}
      </fieldset><CommandFeedback command={command} />
      <div className="ui-modal__actions"><Button variant="ghost" disabled={command.busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={command.busy || mode === "tax" && !verified}>{command.busy ? "Saving…" : mode === "tax" ? "Save verified GST" : "Save invoice terms"}</Button></div>
    </form>
  </Modal>;
}
