"use client";

import { useEffect, useId, useState } from "react";
import { Check, CircleAlert, Download, FileText, Info, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import Modal from "@/components/Modal";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import {
  DOC_ROUTING_HINT, COMPLIANCE_PRESETS, complianceType, expiryLevel, expiryLabel,
  LEVEL_ACCENT, sortByUrgency, alertsFrom,
} from "@/lib/expiry";

interface Doc {
  id: string;
  doc_type: string;
  name: string;
  file_name: string | null;
  file_url: string | null;
  expiry_date: string;
  notes: string;
}

const COLUMNS = "id, doc_type, name, file_name, file_url, expiry_date, notes";

/** Insurance certificates, licences and PDFs — the same ceiling staff
 * certificates use (src/app/between-the-buns/staff-licenses). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function ComplianceRegister({ readOnly = false, restaurant: fixedRestaurant, showHeader = true }: {
  readOnly?: boolean; restaurant?: string; showHeader?: boolean;
}) {
  const auth = useAuth();
  const restaurant = fixedRestaurant ?? auth.restaurantName;
  // BTB's independent company register never inherits a FoodSafe site selection.
  const locationId = fixedRestaurant ? null : auth.locationId;
  const scopeLabel = fixedRestaurant ?? auth.locations.find((site) => site.id === locationId)?.name ?? "Location unavailable";
  return <RenewalWorkspace key={`${restaurant}:${locationId}`} {...{ readOnly, restaurant, locationId, scopeLabel, showHeader }} companyWide={!!fixedRestaurant} />;
}

function RenewalWorkspace({ readOnly, restaurant, locationId, scopeLabel, companyWide, showHeader }: {
  readOnly: boolean; restaurant: string; locationId: string | null; scopeLabel: string; companyWide: boolean; showHeader: boolean;
}) {
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [preset, setPreset] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const formId = useId();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    (async () => {
      try {
        if (!restaurant || (!companyWide && !locationId)) throw new Error("Choose a connected location to view its renewal register.");
        let query = supabase.from("compliance_documents").select(COLUMNS)
          .eq("restaurant_name", restaurant).not("expiry_date", "is", null);
        if (locationId) query = query.eq("location_id", locationId);
        const { data, error } = await query.order("expiry_date").abortSignal(controller.signal);
        if (error) throw new Error("Your renewal register couldn’t be loaded. Please try again.");
        if (!cancelled) { setRows((data ?? []) as Doc[]); setLoadError(""); }
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Your renewal register is unavailable.");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [companyWide, locationId, restaurant, revision]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly || saving || !name.trim() || !expiry || !restaurant || (!companyWide && !locationId)) return;
    setSaving(true); setFormError(""); setNotice("");
    try {
      // An attached certificate (insurance, business licence, lease…) is stored
      // beside the expiry date as a data URL, the same pattern the staff
      // licence register and Document Vault use.
      const attachment = file ? await fileToDataUrl(file) : null;
      const { data, error } = await supabase.from("compliance_documents").insert({
        restaurant_name: restaurant, doc_type: preset, name: name.trim(), expiry_date: expiry,
        notes: notes.trim(), location_id: locationId,
        ...(file ? { file_name: file.name, file_url: attachment } : {}),
      }).select(COLUMNS).abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The renewal wasn’t saved. Your details are still here; please try again.");
      setRows((current) => [...current, data as Doc]);
      setNotice(`${name.trim()} added to the renewal register.`);
      setName(""); setExpiry(""); setNotes(""); setFile(null); setOpen(false); setAttentionOnly(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The renewal couldn’t be saved.");
    } finally { setSaving(false); }
  }

  async function remove(row: Doc) {
    if (readOnly || deletingId || !confirm(`Delete the renewal for “${row.name}”?`)) return;
    setDeletingId(row.id); setError(""); setNotice("");
    try {
      let query = supabase.from("compliance_documents").delete().eq("id", row.id).eq("restaurant_name", restaurant);
      if (locationId) query = query.eq("location_id", locationId);
      const { data, error } = await query.select("id").abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The renewal wasn’t deleted. It is still in the register; please try again.");
      setRows((current) => current.filter((item) => item.id !== row.id));
      setNotice(`${row.name} removed from the register.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The renewal couldn’t be deleted.");
    } finally { setDeletingId(null); }
  }

  const sorted = sortByUrgency(rows, (row) => row.doc_type, (row) => row.expiry_date);
  const alerts = alertsFrom(rows, (row) => row.doc_type, (row) => row.expiry_date);
  const visible = attentionOnly ? alerts : sorted;
  const actions = <div className="ui-actions">
    <Badge accent={loading || loadError || !rows.length ? "slate" : alerts.length ? "amber" : "green"}>{loading ? "Loading renewals…" : loadError ? "Status unavailable" : !rows.length ? "No renewals yet" : alerts.length ? `${alerts.length} need attention` : "All current"}</Badge>
    {!readOnly && <Button disabled={loading || !!loadError} onClick={() => { setFormError(""); setFile(null); setOpen(true); }}><Plus size={17} aria-hidden="true" />Add renewal</Button>}
  </div>;

  return <div className="compliance-workspace">
    {showHeader ? <PageHeader title="Compliance & Renewals" subtitle="Licences, permits and agreements — with the next renewal always in view." action={actions} /> : <div className="dash-section__head"><div><h2>Renewal register</h2><p>Licences, permits and agreements for {scopeLabel}.</p></div>{actions}</div>}
    <p className="document-hint"><Info size={17} aria-hidden="true" /><span>{DOC_ROUTING_HINT}</span></p>
    {notice && <div className="ui-notice ui-notice--success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}
    {error && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
    {loading ? <Card className="ui-empty"><span className="ui-loader" aria-hidden="true" /><p role="status">Loading your renewal dates…</p></Card> : loadError ? (
      <Card className="ui-empty"><CircleAlert size={30} aria-hidden="true" /><h2>Renewals are unavailable</h2><p role="alert">{loadError}</p><Button variant="ghost" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Retry renewals</Button></Card>
    ) : <>
      <div className="document-toolbar">
        <div className="dash__segmented" role="group" aria-label="Filter renewals"><button aria-pressed={!attentionOnly} onClick={() => setAttentionOnly(false)}>All renewals · {rows.length}</button><button aria-pressed={attentionOnly} onClick={() => setAttentionOnly(true)}>Needs attention · {alerts.length}</button></div>
        <p>{scopeLabel} · {readOnly ? "View only" : "Shared renewal register"}</p>
      </div>
      {visible.length === 0 ? <Card className="ui-empty"><ShieldCheck size={32} aria-hidden="true" /><h2>{attentionOnly ? "No renewals need attention" : "Keep your next renewal in sight"}</h2><p>{attentionOnly ? "Your saved renewals are outside their reminder windows." : "Add an expiry date to start tracking a licence, permit or agreement."}</p></Card> : (
        <div className="space-y-3">{visible.map((row) => {
          const type = complianceType(row.doc_type);
          const level = expiryLevel(row.expiry_date, type.notifyDays);
          return <article key={row.id} className="ui-card compliance-row" aria-label={row.name}>
            <span className={`ui-icon ui-tone--${LEVEL_ACCENT[level]}`}><ShieldCheck size={21} aria-hidden="true" /></span>
            <div className="compliance-row__body"><h3>{row.name}</h3><p>{type.label} · {new Date(`${row.expiry_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>{row.notes && <p>{row.notes}</p>}</div>
            <Badge accent={LEVEL_ACCENT[level]}>{expiryLabel(row.expiry_date)}</Badge>
            {row.file_url && <button className="ui-iconbutton" aria-label={`Download ${row.file_name ?? row.name}`} title={row.file_name ?? "Download"} onClick={() => downloadDataUrl(row.file_url!, row.file_name ?? `${row.name}.pdf`)}><Download size={17} aria-hidden="true" /></button>}
            {!readOnly && <button disabled={!!deletingId} onClick={() => remove(row)} className="ui-iconbutton ui-iconbutton--danger" aria-label={`Delete ${row.name}`}><Trash2 size={17} aria-hidden="true" /></button>}
          </article>;
        })}</div>
      )}
    </>}
    {!readOnly && <Modal open={open} title="Add renewal" description="Choose a type and expiry date. The register highlights it when the reminder window begins." busy={saving} onClose={() => setOpen(false)}>
      <form onSubmit={add}>
        {formError && <div className="ui-notice ui-notice--error" role="alert">{formError}</div>}
        <fieldset disabled={saving} className="ui-form-stack">
          <div><span className="block text-sm font-medium text-gray-600 mb-2" id={`${formId}-type`}>Renewal type</span><div className="ui-actions" role="group" aria-labelledby={`${formId}-type`}>{COMPLIANCE_PRESETS.map((value) => <Button key={value} variant={preset === value ? "soft" : "ghost"} aria-pressed={preset === value} onClick={() => setPreset(value)}>{complianceType(value).label}</Button>)}</div></div>
          <label htmlFor={`${formId}-name`}>Name<Input id={`${formId}-name`} data-modal-autofocus required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Food premises licence" /></label>
          <label htmlFor={`${formId}-expiry`}>Expiry date<Input id={`${formId}-expiry`} type="date" required value={expiry} onChange={(event) => setExpiry(event.target.value)} /><small>Reminder window: {complianceType(preset).notifyDays} days before expiry.</small></label>
          <label htmlFor={`${formId}-notes`}>Notes <span>(optional)</span><Input id={`${formId}-notes`} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Renewal contact or reference" /></label>
          <div><label htmlFor={`${formId}-file`}>Certificate or document <span>(optional)</span></label><input id={`${formId}-file`} className="mt-2" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(event) => {
            const picked = event.target.files?.[0] || null;
            if (picked && picked.size > MAX_FILE_BYTES) { setFormError("Choose a file no larger than 5 MB."); event.target.value = ""; return; }
            setFormError(""); setFile(picked);
          }} /><small>PDF, image or Word document — e.g. the signed insurance certificate, business licence or lease. Maximum 5 MB.</small></div>
          {file && <p className="text-sm text-gray-600"><FileText size={14} className="inline-block align-[-2px]" aria-hidden="true" /> Attached: {file.name} ({formatFileSize(file.size)})</p>}
        </fieldset>
        <div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={() => { setFile(null); setOpen(false); }}>Cancel</Button><Button type="submit" disabled={saving || !name.trim() || !expiry}>{saving ? "Saving renewal…" : "Save renewal"}</Button></div>
      </form>
    </Modal>}
  </div>;
}
