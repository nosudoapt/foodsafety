"use client";

import { useEffect, useId, useState } from "react";
import { CalendarDays, Check, CircleAlert, Download, FileText, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import Modal from "@/components/Modal";
import { supabase } from "@/lib/supabase";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import {
  DATE_CATEGORIES, RECURRENCES, categoryLabel, daysUntil, dueStatus,
  isCategory, isRecurrence, nextOccurrence, prettyDate, sortDates, type CorporateDate,
} from "@/lib/tax-dates";

const COLUMNS = "id, title, category, due_date, recurrence, notes, created_by, location_id, file_name, file_url";
const EMPTY_FORM = { title: "", category: "tax", due_date: "", recurrence: "none", notes: "" };

// Same ceiling the compliance certificates use.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Both BTB routes use its company-wide calendar (NULL location in the schema).
// A separate FoodSafe site's browser selection must not change this register.
export default function TaxDatesPanel({ readOnly, showHeader = true }: { readOnly: boolean; showHeader?: boolean }) {
  const [rows, setRows] = useState<CorporateDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const formId = useId();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    (async () => {
      try {
        const { data, error } = await supabase.from("corporate_dates").select(COLUMNS)
          .is("location_id", null).order("due_date").abortSignal(controller.signal);
        if (error) throw new Error("Your filing dates couldn’t be loaded. Please try again.");
        if (!cancelled) { setRows((data ?? []) as CorporateDate[]); setLoadError(""); }
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Your filing calendar is unavailable.");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [revision]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly || saving || !form.title.trim() || !form.due_date) return;
    setSaving(true); setFormError(""); setNotice("");
    try {
      const attachment = file ? await fileToDataUrl(file) : null;
      const { data, error } = await supabase.from("corporate_dates").insert({
        title: form.title.trim(), category: isCategory(form.category) ? form.category : "other",
        due_date: form.due_date, recurrence: isRecurrence(form.recurrence) ? form.recurrence : "none",
        notes: form.notes.trim() || null, created_by: null, location_id: null,
        ...(file ? { file_name: file.name, file_url: attachment } : {}),
      }).select(COLUMNS).abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The deadline wasn’t saved. Your details are still here; please try again.");
      setRows((current) => [...current, data as CorporateDate]);
      setNotice(`${form.title.trim()} added to the filing calendar.`);
      setForm(EMPTY_FORM); setFile(null); setOpen(false); setFilter("all");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The deadline couldn’t be saved.");
    } finally { setSaving(false); }
  }

  async function remove(row: CorporateDate) {
    if (readOnly || deletingId || !confirm(`Delete the deadline for “${row.title}”?`)) return;
    setDeletingId(row.id); setError(""); setNotice("");
    try {
      const { data, error } = await supabase.from("corporate_dates").delete().eq("id", row.id)
        .is("location_id", null).select("id").abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The deadline wasn’t deleted. It is still in your calendar; please try again.");
      setRows((current) => current.filter((item) => item.id !== row.id));
      setNotice(`${row.title} removed from the filing calendar.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The deadline couldn’t be deleted.");
    } finally { setDeletingId(null); }
  }

  const visible = sortDates(filter === "all" ? rows : rows.filter((row) => row.category === filter), today);
  const dueDate = (row: CorporateDate) => row.recurrence === "none" ? row.due_date : nextOccurrence(row.due_date, row.recurrence, today);
  const overdue = rows.filter((row) => dueStatus(dueDate(row), today) === "overdue").length;
  const soon = rows.filter((row) => dueStatus(dueDate(row), today) === "soon").length;
  const actions = <div className="ui-actions">
    <Badge accent={!loading && !loadError && (overdue || soon) ? "amber" : "slate"}>{loading ? "Loading dates…" : loadError ? "Dates unavailable" : `${rows.length} ${rows.length === 1 ? "deadline" : "deadlines"}`}</Badge>
    {!readOnly && <Button disabled={loading || !!loadError} onClick={() => { setFormError(""); setFile(null); setOpen(true); }}><Plus size={17} aria-hidden="true" />Add deadline</Button>}
  </div>;

  return <div className="compliance-workspace">
    {showHeader ? <PageHeader title="Tax & Renewal Dates" subtitle="Filing deadlines and recurring dates, with the next due date always in view." action={actions} />
      : <div className="dash-section__head"><div><h2>Tax & filing dates</h2><p>The shared BTB calendar for returns, renewals and recurring deadlines.</p></div>{actions}</div>}
    {notice && <div className="ui-notice ui-notice--success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}
    {error && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
    {loading ? <Card className="ui-empty"><span className="ui-loader" aria-hidden="true" /><p role="status">Loading your filing calendar…</p></Card> : loadError ? (
      <Card className="ui-empty"><CircleAlert size={30} aria-hidden="true" /><h2>Filing dates are unavailable</h2><p role="alert">{loadError}</p><Button variant="ghost" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Retry filing dates</Button></Card>
    ) : <>
      <div className="document-toolbar">
        <div className="ui-actions" role="group" aria-label="Filter filing dates">{["all", ...DATE_CATEGORIES].map((category) => <Button key={category} variant={filter === category ? "soft" : "ghost"} aria-pressed={filter === category} onClick={() => setFilter(category)}>{category === "all" ? "All dates" : categoryLabel(category)}</Button>)}</div>
        <p>{overdue} overdue · {soon} due within 7 days</p>
      </div>
      {visible.length === 0 ? <Card className="ui-empty"><CalendarDays size={32} aria-hidden="true" /><h2>{filter === "all" ? "Make space for the next deadline" : "No dates in this category"}</h2><p>{filter === "all" ? "Add a filing or renewal date to keep it on the team’s calendar." : "Choose another category to see your saved dates."}</p></Card>
        : <div className="space-y-3">{visible.map((row) => {
          const date = dueDate(row);
          const away = daysUntil(date, today);
          return <article key={row.id} className="ui-card compliance-row" aria-label={row.title}>
            <span className="ui-icon ui-tone--amber"><CalendarDays size={21} aria-hidden="true" /></span>
            <div className="compliance-row__body"><h3>{row.title}</h3><p>{categoryLabel(row.category)} · {prettyDate(date)}{row.recurrence !== "none" && ` · Repeats ${row.recurrence}`}</p>{row.notes && <p>{row.notes}</p>}</div>
            <Badge accent={away < 0 ? "red" : away <= 7 ? "amber" : "slate"}>{away < 0 ? `${Math.abs(away)} days overdue` : away === 0 ? "Due today" : `In ${away} days`}</Badge>
            {row.file_url && <button className="ui-iconbutton" aria-label={`Download ${row.file_name ?? row.title}`} title={row.file_name ?? "Download"} onClick={() => downloadDataUrl(row.file_url!, row.file_name ?? `${row.title}.pdf`)}><Download size={17} aria-hidden="true" /></button>}
            {!readOnly && <button disabled={!!deletingId} onClick={() => remove(row)} className="ui-iconbutton ui-iconbutton--danger" aria-label={`Delete ${row.title}`}><Trash2 size={17} aria-hidden="true" /></button>}
          </article>;
        })}</div>}
    </>}
    {!readOnly && <Modal open={open} title="Add deadline" description="Choose the due date and repeat schedule that apply to your business." busy={saving} onClose={() => setOpen(false)}>
      <form onSubmit={save}>
        {formError && <div className="ui-notice ui-notice--error" role="alert">{formError}</div>}
        <fieldset disabled={saving} className="ui-form-stack">
          <div><span className="block text-sm font-medium mb-2">Start with a template</span><div className="ui-actions">
            <Button variant="soft" onClick={() => setForm((current) => ({ ...current, title: "GST Return", category: "tax", recurrence: "quarterly" }))}>GST return</Button>
            <Button variant="soft" onClick={() => setForm((current) => ({ ...current, title: "CRA Annual Tax Filing", category: "tax", recurrence: "annual" }))}>Annual filing</Button>
          </div><small>Templates fill the form. Review the details before saving.</small></div>
          <label htmlFor={`${formId}-name`}>Name<Input id={`${formId}-name`} data-modal-autofocus required maxLength={200} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. GST/HST return" /></label>
          <label htmlFor={`${formId}-type`}>Type<select id={`${formId}-type`} className="ui-input" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{DATE_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label>
          <label htmlFor={`${formId}-date`}>Due date<Input id={`${formId}-date`} type="date" required value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} /></label>
          <label htmlFor={`${formId}-repeat`}>Repeats<select id={`${formId}-repeat`} className="ui-input" value={form.recurrence} onChange={(event) => setForm((current) => ({ ...current, recurrence: event.target.value }))}>{RECURRENCES.map((recurrence) => <option key={recurrence} value={recurrence}>{recurrence === "none" ? "Doesn’t repeat" : recurrence[0].toUpperCase() + recurrence.slice(1)}</option>)}</select></label>
          <label htmlFor={`${formId}-notes`}>Notes <span>(optional)</span><Input id={`${formId}-notes`} maxLength={1000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Filing reference or contact" /></label>
          <div><label htmlFor={`${formId}-file`}>Attach the document <span>(optional)</span></label><input id={`${formId}-file`} className="mt-2" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(event) => {
            const picked = event.target.files?.[0] || null;
            if (picked && picked.size > MAX_FILE_BYTES) { setFormError("Choose a file no larger than 5 MB."); event.target.value = ""; return; }
            setFormError(""); setFile(picked);
          }} /><small>The return, remittance or certificate this deadline refers to — PDF, image or Word document, maximum 5 MB.</small></div>
          {file && <p className="text-sm text-gray-600"><FileText size={14} className="inline-block align-[-2px]" aria-hidden="true" /> Attached: {file.name} ({formatFileSize(file.size)})</p>}
        </fieldset>
        <div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !form.title.trim() || !form.due_date}>{saving ? "Saving deadline…" : "Save deadline"}</Button></div>
      </form>
    </Modal>}
  </div>;
}
