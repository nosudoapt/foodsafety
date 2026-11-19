"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { Badge, Button, Card, Input } from "@/components/ui";
import { csvDocument, gstEstimate, type FinanceData, type GstPeriod } from "@/lib/btb-finance";
import { money } from "@/lib/btb-platform-inventory";
import { CommandFeedback, downloadCsv, ReasonForm, useFinanceCommand, type FinanceCommand } from "./FinanceControls";

export default function GstPanel({ locationId, data, canWrite, reload }: { locationId: string; data: FinanceData; canWrite: boolean; reload: () => void }) {
  const command = useFinanceCommand(locationId, reload);
  const [editing, setEditing] = useState<GstPeriod | "new" | null>(null), [closing, setClosing] = useState<GstPeriod | null>(null), [filing, setFiling] = useState<GstPeriod | null>(null), [reopening, setReopening] = useState<GstPeriod | null>(null);
  return <>
    <p className="ui-notice">GST tracking is a reviewed bookkeeping record, not tax advice or automatic filing. Enter collected GST from verified sales records, not a guessed percentage. Only verified, eligible purchase GST counts toward input tax credits.</p>
    <Card><div className="ops-panel"><div className="ops-toolbar"><h3>GST periods</h3>{canWrite && <Button onClick={() => setEditing("new")}>New GST period</Button>}</div><CommandFeedback command={command} />
      {!data.gst_periods.length && <p className="ui-empty">No GST period has been created. Choose the actual reporting period used for this location.</p>}
      {data.gst_periods.map((period) => {
        const estimate = gstEstimate(data.invoices, period), finalized = period.status !== "draft";
        const relevant = data.invoices.filter((invoice) => !invoice.voided_at && invoice.invoice_date >= period.from_date && invoice.invoice_date <= period.to_date);
        return <article key={period.id} className="finance-line ops-panel" aria-label={`GST ${period.from_date} to ${period.to_date}`}>
          <div className="ops-toolbar"><h4>{period.from_date} – {period.to_date}</h4><Badge accent={period.status === "filed" ? "green" : finalized ? "blue" : "amber"}>{period.status === "filed" ? "Filed" : finalized ? "Finalized" : "Draft estimate"}</Badge></div>
          <dl className="finance-figures"><div><dt>Collected GST</dt><dd>{money(period.collected)}</dd></div><div><dt>Eligible input tax</dt><dd>{money(finalized ? period.input_tax : estimate.inputTax)}</dd></div><div><dt>Adjustments</dt><dd>{money(period.adjustments)}</dd></div><div><dt>Net GST due / (refund)</dt><dd>{money(finalized ? period.net_due : estimate.netDue)}</dd></div></dl>
          <p className="ops-meta">{relevant.length} approved purchase invoices · {estimate.missing} tax reviews missing · purchases {period.purchases_complete ? "confirmed complete" : "not complete"} · sales {period.sales_complete ? "confirmed complete" : "not complete"}</p>
          {period.notes && <p className="ops-meta">{period.notes}</p>}
          {period.status === "filed" && <p className="ui-notice ui-notice--success">Actual filing recorded: {period.filed_on} · confirmation {period.filing_reference}. This application did not submit the return.</p>}
          <div className="ui-actions"><Button variant="ghost" onClick={() => downloadCsv(csvDocument([["Invoice date", "Supplier", "Reference", "Total CAD", "GST CAD", "Tax verified", "ITC eligible"], ...relevant.map((invoice) => [invoice.invoice_date, invoice.vendor, invoice.reference, invoice.total, invoice.gst, invoice.tax_confirmed ? "Yes" : "No", invoice.itc_eligible === null ? null : invoice.itc_eligible ? "Yes" : "No"])]), `btb-gst-purchases-${period.from_date}-${period.to_date}.csv`)}>Export purchase GST evidence</Button>{canWrite && <>
            {!finalized ? <><Button variant="soft" onClick={() => setEditing(period)}>Edit GST inputs</Button><Button disabled={estimate.netDue === null} onClick={() => setClosing(period)}>Finalize reviewed GST</Button></> : <><Button variant="danger" onClick={() => setReopening(period)}>Reopen GST period</Button>{period.status === "finalized" && <Button onClick={() => setFiling(period)}>Record actual filing</Button>}</>}
          </>}</div>
          {!finalized && estimate.netDue === null && <p className="ops-meta">Net due stays missing until all tax reviews, collected GST, adjustments and completeness confirmations are present. Pending purchase documents also prevent finalization.</p>}
        </article>;
      })}
    </div></Card>
    {editing && <GstForm key={editing === "new" ? "new" : editing.id} period={editing === "new" ? null : editing} command={command} onClose={() => setEditing(null)} />}
    {filing && <FilingForm period={filing} command={command} onClose={() => setFiling(null)} />}
    {reopening && <ReasonForm title="Reopen GST period" description="The recorded close is retained in the audit. If this was already filed, discuss amendments with your accountant; reopening here does not amend a government return." action="gst_reopen" data={{ id: reopening.id, version: reopening.version }} command={command} onClose={() => setReopening(null)} />}
    {closing && <GstCloseForm period={closing} data={data} command={command} onClose={() => setClosing(null)} />}
  </>;
}
function GstForm({ period, command, onClose }: { period: GstPeriod | null; command: FinanceCommand; onClose: () => void }) {
  const [id] = useState(() => period?.id ?? crypto.randomUUID());
  const [form, setForm] = useState({ from_date: period?.from_date ?? "", to_date: period?.to_date ?? "", collected: period?.collected == null ? "" : String(period.collected), adjustments: period?.adjustments == null ? "" : String(period.adjustments), purchases_complete: period?.purchases_complete ?? false, sales_complete: period?.sales_complete ?? false, notes: period?.notes ?? "" });
  return <Modal open title={period ? "Edit GST inputs" : "New GST period"} description="Use the actual reporting dates and GST collected from sales. Blank amounts stay missing; enter 0 only when verified." busy={command.busy} onClose={onClose}>
    <form className="ui-form-stack" onSubmit={async (event) => { event.preventDefault(); if (await command.act("gst_save", { id, version: period?.version ?? 0, ...form, collected: form.collected.trim() === "" ? null : form.collected, adjustments: form.adjustments.trim() === "" ? null : form.adjustments }, "GST draft saved. Nothing has been filed.")) onClose(); }}>
      <fieldset disabled={command.busy} className="ops-fieldset ui-form-stack"><div className="ops-form-grid"><label>Period start<Input data-modal-autofocus required type="date" value={form.from_date} onChange={(event) => setForm({ ...form, from_date: event.target.value })} /></label><label>Period end<Input required type="date" value={form.to_date} onChange={(event) => setForm({ ...form, to_date: event.target.value })} /></label><label>Collected GST (CAD)<Input inputMode="decimal" value={form.collected} onChange={(event) => setForm({ ...form, collected: event.target.value })} /></label><label>Adjustments (CAD, signed)<Input inputMode="text" value={form.adjustments} onChange={(event) => setForm({ ...form, adjustments: event.target.value })} /></label></div>
        <label className="ops-checkbox"><input type="checkbox" checked={form.purchases_complete} onChange={(event) => setForm({ ...form, purchases_complete: event.target.checked })} /><span>All purchase invoices and receipts for this GST period are entered and reviewed.</span></label><label className="ops-checkbox"><input type="checkbox" checked={form.sales_complete} onChange={(event) => setForm({ ...form, sales_complete: event.target.checked })} /><span>All sales and collected GST for this period are verified and complete.</span></label><label>Source notes / accountant adjustments<textarea className="ui-input" maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      </fieldset><CommandFeedback command={command} /><div className="ui-modal__actions"><Button variant="ghost" disabled={command.busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={command.busy}>{command.busy ? "Saving…" : "Save GST draft"}</Button></div>
    </form>
  </Modal>;
}
function GstCloseForm({ period, data, command, onClose }: { period: GstPeriod; data: FinanceData; command: FinanceCommand; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false), estimate = gstEstimate(data.invoices, period);
  return <Modal open title="Finalize GST record" description="Finalization freezes this period and prevents changes to source invoices until it is reopened. It does not submit a return." busy={command.busy} onClose={onClose}>
    <form className="ui-form-stack" onSubmit={async (event) => { event.preventDefault(); if (confirmed && await command.act("gst_finalize", { id: period.id, version: period.version }, "GST record finalized. File externally, then record the actual confirmation.")) onClose(); }}>
      <p>{period.from_date} – {period.to_date} · Net GST due / (refund): <strong>{money(estimate.netDue)}</strong></p><label className="ops-checkbox"><input data-modal-autofocus type="checkbox" disabled={command.busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed purchase evidence, eligible GST, complete sales and adjustments.</span></label><CommandFeedback command={command} /><div className="ui-modal__actions"><Button variant="ghost" disabled={command.busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={command.busy || !confirmed}>{command.busy ? "Finalizing…" : "Confirm GST finalization"}</Button></div>
    </form>
  </Modal>;
}
function FilingForm({ period, command, onClose }: { period: GstPeriod; command: FinanceCommand; onClose: () => void }) {
  const [date, setDate] = useState(""), [reference, setReference] = useState("");
  return <Modal open title="Record actual GST filing" description="Only record this after the return was submitted outside this application. This button never sends a government return." busy={command.busy} onClose={onClose}>
    <form className="ui-form-stack" onSubmit={async (event) => { event.preventDefault(); if (await command.act("gst_file", { id: period.id, version: period.version, filed_on: date, filing_reference: reference.trim() }, "Actual filing date and confirmation recorded.")) onClose(); }}><label>Actual filing date<Input data-modal-autofocus required disabled={command.busy} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Filing confirmation reference<Input required disabled={command.busy} maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} /></label><CommandFeedback command={command} /><div className="ui-modal__actions"><Button variant="ghost" disabled={command.busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={command.busy}>{command.busy ? "Saving…" : "Save actual filing record"}</Button></div></form>
  </Modal>;
}
