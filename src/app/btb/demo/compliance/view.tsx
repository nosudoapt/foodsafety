"use client";
// Interactive view; page.tsx owns the request-time server gate.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, FileText,
  Inbox, Mail, ShieldCheck, UploadCloud, X,
} from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import ComplianceRegister from "@/components/ComplianceRegister";
import DocumentVault from "@/components/DocumentVault";
import TaxDatesPanel from "@/components/TaxDatesPanel";
import StaffLicencesPage from "@/app/btb/demo/staff-licenses/view";
import LicenceRemindersPage from "@/app/btb/demo/licence-reminders/view";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import Modal from "@/components/Modal";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { supabase } from "@/lib/supabase";
import { btbCanEdit } from "@/lib/btb-access";
import { accessibleBtbCards } from "@/lib/btb-page-access";
import { BTB_RESTAURANT } from "@/lib/btb-roles";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import { fetchJson } from "@/lib/fetch-json";
import { jsonRequest } from "@/components/btb/Feedback";
import {
  COMPLIANCE_PRESETS, REMINDER_LEAD_OPTIONS, alertsFrom, complianceType,
  daysUntil, effectiveNotifyDays, expiryLabel, expiryLevel, sortByUrgency,
} from "@/lib/expiry";

// The revised compliance hub, built for a non-technical owner:
// 1. Home — plain-language status tiles, what needs attention today, and what's
//    coming next, all in one glance. No digging through lists.
// 2. Add documents — drop several files in one go and answer three simple
//    questions per file; everything is saved in a single pass.
// 3. The working sections (renewals, staff certificates, tax dates, business
//    documents, email reminders) stay as tabs — each item is saved once.

type Tab = "home" | "upload" | "renewals" | "certs" | "dates" | "documents" | "reminders";
const SECTIONS = [
  { id: "renewals", label: "Renewals", page: "compliance" },
  { id: "certs", label: "Staff certificates", page: "staff-licenses" },
  { id: "dates", label: "Tax & filing dates", page: "tax-dates" },
  { id: "documents", label: "Business documents", page: "documents" },
  { id: "reminders", label: "Email reminders", page: "licence-reminders" },
] as const;

export default function Page() {
  return (
    <BtbFeatureGate feature="compliance">
      {(readOnly) => <ComplianceHub readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function ComplianceHub({ readOnly }: { readOnly: boolean }) {
  const [tab, setTab] = useState<Tab>("home");
  const { identity, rows, pageGrants } = useBtbWorkspace();
  if (!identity) return null;
  const allowed = accessibleBtbCards(identity.role, rows, pageGrants);
  const sectionTabs = SECTIONS.filter((section) => allowed.some((card) => card.href === `/btb/demo/${section.page}`));
  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Home" },
    ...(btbCanEdit("compliance", identity.role) && !readOnly ? [{ id: "upload" as Tab, label: "Add documents" }] : []),
    ...sectionTabs.map((s) => ({ id: s.id as Tab, label: s.label })),
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "home";

  return (
    <div className="compliance-hub">
      <PageHeader
        title="Compliance, docs & reminders"
        subtitle="One place for everything that expires, needs a certificate or needs a reminder — set up once, then just answer what needs you today."
      />
      <nav className="dash__segmented compliance-hub__tabs" role="tablist" aria-label="Compliance sections">
        {tabs.map((t, index) => (
          <button key={t.id} role="tab" aria-pressed={active === t.id} aria-selected={active === t.id}
            tabIndex={active === t.id ? 0 : -1}
            onKeyDown={(event) => {
              const last = tabs.length - 1;
              const target = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? last : null;
              if (target === null) return;
              event.preventDefault();
              setTab(tabs[target].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
            }}
            onClick={() => setTab(t.id)}>
            {t.id === "home" && <ShieldCheck size={15} aria-hidden="true" />}
            {t.id === "upload" && <UploadCloud size={15} aria-hidden="true" />}
            {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === active)?.label} className="compliance-hub__panel">
      {active === "home" && <ComplianceHome readOnly={readOnly} onOpen={(next) => setTab(next)} tabs={tabs.map((t) => t.id)} />}
      {active === "upload" && <MultiDocumentUpload restaurant={BTB_RESTAURANT} destinations={allowed.filter(card => btbCanEdit(card.feature, identity.role)).map(card => card.href.slice("/btb/demo/".length))} />}
      {active === "renewals" && <ComplianceRegister readOnly={readOnly} restaurant={BTB_RESTAURANT} showHeader={false} embedded />}
      {active === "certs" && <StaffLicencesPage />}
      {active === "dates" && <TaxDatesPanel readOnly={!btbCanEdit("tax_dates", identity.role)} showHeader={false} embedded />}
      {active === "documents" && <DocumentVault title="Business documents" subtitle="Forms, SOPs, brand assets & menus — files that don’t expire."
        readOnly={!btbCanEdit("documents", identity.role)} showHeader={false} embedded uploader={{ restaurantName: BTB_RESTAURANT }} />}
      {active === "reminders" && <LicenceRemindersPage />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home: status tiles, attention list, upcoming timeline, quick actions */
/* ------------------------------------------------------------------ */

interface Doc {
  id: string;
  doc_type: string;
  name: string;
  file_name: string | null;
  file_url: string | null;
  other_file_name?: string | null;
  other_file_url?: string | null;
  expiry_date: string;
  notes: string;
  notify?: boolean | null;
  notify_days?: number | null;
}
const COLUMNS = "id, doc_type, name, file_name, file_url, other_file_name, other_file_url, expiry_date, notes, notify, notify_days";

const dayChip = (days: number | null) =>
  days === null ? "No date" : days <= 0 ? `${-days} day${days === 0 ? "" : "s"} overdue` : `${days} day${days === 1 ? "" : "s"} left`;

function ComplianceHome({ readOnly, onOpen, tabs }: { readOnly: boolean; onOpen: (tab: Tab) => void; tabs: Tab[] }) {
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    (async () => {
      try {
        const { data, error: err } = await supabase.from("compliance_documents").select(COLUMNS)
          .eq("restaurant_name", BTB_RESTAURANT).not("expiry_date", "is", null)
          .order("expiry_date").abortSignal(controller.signal);
        if (err) throw new Error("The compliance overview couldn’t be loaded.");
        if (!cancelled) { setRows((data ?? []) as Doc[]); setError(""); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The compliance overview is unavailable.");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  const levels = useMemo(() => rows.map((row) => ({
    row,
    level: expiryLevel(row.expiry_date, effectiveNotifyDays(row.notify_days, row.doc_type)),
    days: daysUntil(row.expiry_date),
  })), [rows]);
  const expired = levels.filter((x) => x.level === "expired");
  const urgent = levels.filter((x) => x.level === "critical");
  const watch = levels.filter((x) => x.level === "warning");
  const fine = levels.filter((x) => x.level === "ok");
  const attached = rows.filter((r) => r.file_url || r.other_file_url).length;
  const attention = sortByUrgency(
    [...expired, ...urgent, ...watch],
    (x) => x.row.doc_type, (x) => x.row.expiry_date, (x) => x.row.notify_days,
  );
  const upcoming = useMemo(() => [...fine].sort((a, b) => (a.days ?? 0) - (b.days ?? 0)).slice(0, 5), [fine]);
  const alerts = alertsFrom(rows, (r) => r.doc_type, (r) => r.expiry_date, (r) => r.notify_days);
  const canUpload = tabs.includes("upload");

  const tiles = [
    { icon: <AlertTriangle size={20} aria-hidden="true" />, tone: "red", label: "Overdue", value: expired.length, hint: "Renew these now" },
    { icon: <Clock size={20} aria-hidden="true" />, tone: "amber", label: "Due within 30 days", value: urgent.length, hint: "Book the renewal" },
    { icon: <CalendarClock size={20} aria-hidden="true" />, tone: "amber", label: "Watch list", value: watch.length, hint: "In the reminder window" },
    { icon: <CheckCircle2 size={20} aria-hidden="true" />, tone: "green", label: "All current", value: fine.length, hint: "Nothing to do" },
    { icon: <FileText size={20} aria-hidden="true" />, tone: "slate", label: "Tracked items", value: rows.length, hint: `${attached} with files attached` },
  ] as const;

  return <div className="space-y-5">
    {error && <div className="ui-notice ui-notice--error" role="alert">{error}</div>}
    <div className="compliance-overview__tiles">
      {tiles.map((tile) => (
        <Card key={tile.label} className="compliance-overview__tile">
          <span className={`ui-icon ui-tone--${tile.tone}`}>{tile.icon}</span>
          <p className="compliance-overview__value">{loading ? "…" : tile.value}</p>
          <p className="compliance-overview__label">{tile.label}</p>
          <p className="compliance-overview__hint">{tile.hint}</p>
        </Card>
      ))}
    </div>

    <div className="compliance-overview__actions">
      {!readOnly && canUpload && <Button variant="soft" onClick={() => onOpen("upload")}><UploadCloud size={17} aria-hidden="true" />Add documents &amp; deadlines</Button>}
      {tabs.includes("reminders") && <Button variant="ghost" onClick={() => onOpen("reminders")}><Mail size={17} aria-hidden="true" />Check email reminders</Button>}
    </div>

    <Card className="compliance-overview__panel">
      <div className="compliance-overview__panel-head">
        <h2>{attention.length ? "What needs you today" : "Everything is in good shape"}</h2>
        <Badge accent={loading ? "slate" : attention.length ? "amber" : "green"}>
          {loading ? "Checking…" : attention.length ? `${attention.length} to look at · ${alerts.length} reminded` : "No reminders due"}
        </Badge>
      </div>
      {loading ? <p className="ops-meta" role="status">Loading your compliance status…</p> : error ? <p className="ops-meta" role="alert">{error}</p> : attention.length ? (
        <ul className="compliance-overview__list">
          {attention.map(({ row, days, level }) => (
            <li key={row.id}>
              <span className={`ui-icon ui-tone--${level === "expired" ? "red" : "amber"}`}><AlertTriangle size={17} aria-hidden="true" /></span>
              <div className="compliance-overview__item">
                <strong>{row.name}</strong>
                <span>{complianceType(row.doc_type).label} · expires {new Date(`${row.expiry_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
              <Badge accent={level === "expired" ? "red" : "amber"}>{dayChip(days)}</Badge>
              {row.file_url && <button className="ui-iconbutton" aria-label={`Open the certificate for ${row.name}`} title="Open certificate"
                onClick={() => downloadDataUrl(row.file_url!, row.file_name ?? `${row.name}.pdf`)}><FileText size={16} aria-hidden="true" /></button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ops-meta">Nothing is overdue or inside a reminder window. New dates you add appear here the moment they need attention.</p>
      )}
    </Card>

    <Card className="compliance-overview__panel">
      <div className="compliance-overview__panel-head"><h2>Coming up next</h2><span className="ops-meta">The five soonest renewals</span></div>
      {loading ? <p className="ops-meta" role="status">Loading…</p> : upcoming.length ? (
        <ol className="compliance-overview__timeline">
          {upcoming.map(({ row, days }) => (
            <li key={row.id}>
              <span className="compliance-overview__dot" aria-hidden="true" />
              <div className="compliance-overview__item">
                <strong>{row.name}</strong>
                <span>{new Date(`${row.expiry_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {complianceType(row.doc_type).label}</span>
              </div>
              <span className="ops-meta">{dayChip(days)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="ops-meta">Add your first expiry date under “Add a renewal” and it will show up here.</p>}
    </Card>
  </div>;
}

/* ------------------------------------------------------------------ */
/* Add documents: ONE intake. Drop files (or add a date-only deadline),  */
/* answer a few questions, save — each item is auto-categorised and      */
/* routed to Tax & filing dates, Renewals or Business documents.         */
/* ------------------------------------------------------------------ */

const MAX_FILE_BYTES = 3 * 1024 * 1024;

/** Where each "what is it?" answer goes. tax / payroll → the tax & filing
 * calendar (corporate_dates); certificate types with an expiry → the renewal
 * register; "file" (no date) → the business documents vault. */
const FILING_KINDS = [
  { value: "tax", label: "Tax return (CRA, GST/HST…)" },
  { value: "payroll", label: "Payroll remittance" },
] as const;
const FILE_KIND = "file";
const isFilingKind = (kind: string) => FILING_KINDS.some((f) => f.value === kind);

interface QueueItem {
  id: string;
  file: File | null;
  name: string;
  kind: string;
  expiry: string;
  notifyChoice: string;
  recurrence: string;
  notes: string;
  status: "queued" | "saving" | "saved" | "error";
  savedTo?: string;
  error?: string;
}

function MultiDocumentUpload({ restaurant, destinations }: { restaurant: string; destinations: string[] }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");

  const patch = (id: string, changes: Partial<QueueItem>) =>
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setNotice("");
    const fresh: QueueItem[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        setNotice(`“${file.name}” is ${formatFileSize(file.size)} — the limit is 3 MB, so it wasn’t added.`);
        continue;
      }
      fresh.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file, name: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
        kind: destinations.includes("compliance") ? "other" : destinations.includes("documents") ? FILE_KIND : "tax", expiry: "", notifyChoice: "default", recurrence: "none", notes: "", status: "queued",
      });
    }
    if (fresh.length) setQueue((current) => [...current, ...fresh]);
  };

  /** A deadline without a document — tax & filing dates don't need a file. */
  const addDeadline = () => {
    setNotice("");
    setQueue((current) => [...current, {
      id: `deadline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file: null, name: "", kind: "tax", expiry: "", notifyChoice: "default",
      recurrence: "none", notes: "", status: "queued",
    }]);
  };

  const routeFor = (item: QueueItem) =>
    isFilingKind(item.kind) ? "Tax & filing dates" : item.kind === FILE_KIND ? "Business documents" : "the Renewals register";
  const destinationFor = (item: QueueItem) => isFilingKind(item.kind) ? "tax-dates" : item.kind === FILE_KIND ? "documents" : "compliance";

  const saveAll = async () => {
    const pending = queue.filter((item) => item.status === "queued" || item.status === "error");
    if (!pending.length || saving) return;
    const incomplete = pending.filter((item) => !item.name.trim() || (item.kind !== FILE_KIND && !item.expiry));
    if (incomplete.length) {
      setNotice("Give every item a name, and a date for anything with a deadline, before saving.");
      return;
    }
    if (pending.some(item => !destinations.includes(destinationFor(item)))) { setNotice("One of these destinations is not enabled in your workspace. Choose an allowed type before saving."); return; }
    setSaving(true); setNotice("");
    let saved = 0;
    for (const item of pending) {
      patch(item.id, { status: "saving", error: undefined });
      try {
        let destination = "";
        if (isFilingKind(item.kind)) {
          // Filing deadline → the tax & filing calendar (with the file if one
          // was attached). Recurrence rolls the next date forward automatically.
          const { error } = await supabase.from("corporate_dates").insert({
            title: item.name.trim(), category: item.kind, due_date: item.expiry,
            recurrence: item.recurrence, notes: item.notes.trim() || null, location_id: null,
            created_by: null,
            ...(item.file ? { file_name: item.file.name, file_url: await fileToDataUrl(item.file) } : {}),
          }).select("id").abortSignal(AbortSignal.timeout(15_000)).single();
          if (error) throw new Error(error.message);
          destination = "Tax & filing dates";
        } else if (item.kind === FILE_KIND) {
          // No deadline — a plain document for the vault.
          if (!item.file) throw new Error("Choose a file for Business documents.");
          await fetchJson("/api/btb/documents", jsonRequest({ name: item.name.trim(), notes: item.notes.trim(), file: { name: item.file.name, url: await fileToDataUrl(item.file) } }));
          destination = "Business documents";
        } else {
          // Everything else that expires → the renewal register.
          const notify = item.notifyChoice !== "none";
          const notifyDays = notify && item.notifyChoice !== "default" ? Number(item.notifyChoice) : null;
          const { error } = await supabase.from("compliance_documents").insert({
            restaurant_name: restaurant, doc_type: item.kind, name: item.name.trim(), expiry_date: item.expiry,
            notes: item.notes.trim(), location_id: null, notify, notify_days: notifyDays,
            ...(item.file ? { file_name: item.file.name, file_url: await fileToDataUrl(item.file) } : {}),
          }).select("id").abortSignal(AbortSignal.timeout(15_000)).single();
          if (error) throw new Error(error.message);
          destination = "the Renewals register";
        }
        saved += 1;
        setQueue((current) => current.map((row) => (row.id === item.id ? { ...row, status: "saved", savedTo: destination } : row)));
      } catch (cause) {
        patch(item.id, { status: "error", error: cause instanceof Error ? cause.message : "Couldn’t save this one." });
      }
    }
    setSaving(false);
    if (saved) setNotice(`Saved. ${saved} item${saved === 1 ? "" : "s"} filed automatically into the right section${saved === 1 ? "" : " — see the badges below"}.`);
  };

  return <div className="compliance-upload">
    <Card className="compliance-upload__intro">
      <h2>Add it once — it files itself</h2>
      <p className="ops-meta">Drop in documents, or just a deadline. Say what it is and when it’s due, add a reminder if you want one, and press Save all. Each item is automatically categorised: filing deadlines go to <strong>Tax &amp; filing dates</strong>, expiring certificates to <strong>Renewals</strong>, and plain files to <strong>Business documents</strong>. No need to know which tab is which.</p>
    </Card>

    <div className="compliance-upload__sources">
      <label
        className={`compliance-upload__drop ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
      >
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="compliance-upload__input"
          onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
        <UploadCloud size={28} aria-hidden="true" />
        <strong>{dragging ? "Drop the files here" : "Drop documents here, or tap to choose"}</strong>
        <span className="ops-meta">Certificates, licences, tax papers — anything. PDF, photo or Word, up to 3 MB each.</span>
      </label>
      {!saving && destinations.includes("tax-dates") && <Button variant="ghost" onClick={addDeadline}><CalendarClock size={17} aria-hidden="true" />Just a deadline (no document)</Button>}
    </div>

    {notice && <div className="ui-notice ui-notice--success" role="status">{notice}</div>}

    {queue.length > 0 && <Card className="compliance-upload__queue">
      <div className="compliance-overview__panel-head"><h2>Your list ({queue.length})</h2>
        <Button onClick={() => void saveAll()} disabled={saving || queue.every((item) => item.status !== "queued" && item.status !== "error")}>
          {saving ? "Saving…" : "Save all"}
        </Button>
      </div>
      <ul className="compliance-upload__list">
        {queue.map((item) => (
          <li key={item.id} className={item.status === "error" ? "is-error" : ""}>
            <span className="ui-icon ui-tone--slate">{item.file ? <FileText size={17} aria-hidden="true" /> : <CalendarClock size={17} aria-hidden="true" />}</span>
            <div className="compliance-upload__fields">
              <label>What is it?
                <input className="ui-input" value={item.name} maxLength={200} disabled={saving || item.status === "saved"}
                  onChange={(event) => patch(item.id, { name: event.target.value })} placeholder="e.g. GST return — Q3 2026" />
              </label>
              <label>Type — decides where it goes
                <select className="ui-input" value={item.kind} disabled={saving || item.status === "saved"}
                  onChange={(event) => patch(item.id, { kind: event.target.value })}>
                  {destinations.includes("tax-dates") && <optgroup label="Filing deadlines → Tax & filing dates">
                    {FILING_KINDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </optgroup>}
                  {destinations.includes("compliance") && <optgroup label="Certificates & agreements → Renewals">
                    {COMPLIANCE_PRESETS.map((value) => <option key={value} value={value}>{complianceType(value).label}</option>)}
                  </optgroup>}
                  {item.file && destinations.includes("documents") && <optgroup label="No expiry → Business documents">
                    <option value={FILE_KIND}>Just a file (never expires)</option>
                  </optgroup>}
                </select>
              </label>
              <label>{isFilingKind(item.kind) ? "Due date" : item.kind === FILE_KIND ? "No date needed" : "Expiry date"}
                <input className="ui-input" type="date" value={item.expiry} required={item.kind !== FILE_KIND}
                  disabled={saving || item.status === "saved" || item.kind === FILE_KIND}
                  onChange={(event) => patch(item.id, { expiry: event.target.value })} />
              </label>
              {isFilingKind(item.kind) && <label>Repeats
                <select className="ui-input" value={item.recurrence} disabled={saving || item.status === "saved"}
                  onChange={(event) => patch(item.id, { recurrence: event.target.value })}>
                  <option value="none">One-off</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </label>}
              {item.kind !== FILE_KIND && !isFilingKind(item.kind) && <label>Remind me
                <select className="ui-input" value={item.notifyChoice} disabled={saving || item.status === "saved"}
                  onChange={(event) => patch(item.id, { notifyChoice: event.target.value })}>
                  <option value="default">Type default ({complianceType(item.kind).notifyDays} days before)</option>
                  {REMINDER_LEAD_OPTIONS.map((days) => (
                    <option key={days} value={days}>{days === 0 ? "On the due date" : `${days} days before`}</option>
                  ))}
                  <option value="none">No reminder</option>
                </select>
              </label>}
              <label className="compliance-upload__wide">Note (optional)
                <input className="ui-input" value={item.notes} maxLength={500} disabled={saving || item.status === "saved"}
                  onChange={(event) => patch(item.id, { notes: event.target.value })} placeholder="Reference, who it’s filed with…" />
              </label>
              {item.file && <div className="compliance-upload__file">
                <span className="ops-meta">{item.file.name} · {formatFileSize(item.file.size)}</span>
                <span className="ui-actions">
                  <Button variant="ghost" onClick={() => { setPreview(item.id); setPreviewName(item.file!.name); }}>Check file</Button>
                  <button className="ui-iconbutton" aria-label={`Remove ${item.file.name}`} disabled={saving}
                    onClick={() => setQueue((current) => current.filter((row) => row.id !== item.id))}><X size={15} aria-hidden="true" /></button>
                </span>
              </div>}
              {!item.file && item.status !== "saved" && <div className="compliance-upload__file">
                <span className="ops-meta">Deadline only — no document attached.</span>
                <span className="ui-actions">
                  <button className="ui-iconbutton" aria-label="Remove this deadline" disabled={saving}
                    onClick={() => setQueue((current) => current.filter((row) => row.id !== item.id))}><X size={15} aria-hidden="true" /></button>
                </span>
              </div>}
            </div>
            <span className="compliance-upload__status">
              {item.status === "saving" && <span className="ui-loader" aria-hidden="true" />}
              {item.status === "saved" && <Badge accent="green"><CheckCircle2 size={14} aria-hidden="true" /> {item.savedTo ?? "Saved"}</Badge>}
              {item.status === "error" && <Badge accent="red">{item.error ?? "Failed"}</Badge>}
            </span>
          </li>
        ))}
      </ul>
      <p className="ops-meta">When you press “Save all”, every line is filed into the right section automatically — you’ll see where each one went on its green badge.</p>
    </Card>}

    {queue.length === 0 && <Card className="ui-empty"><Inbox size={30} aria-hidden="true" /><h2>Nothing waiting</h2><p>Files and deadlines you add here wait in this list until you press “Save all”. Nothing is saved by accident.</p></Card>}

    <Modal open={preview !== null} title="Check the file" description={previewName} onClose={() => setPreview(null)}>
      {preview && (() => {
        const item = queue.find((row) => row.id === preview);
        if (!item?.file) return null;
        const url = URL.createObjectURL(item.file);
        return item.file.type === "application/pdf"
          ? <iframe src={url} title={item.file.name} className="compliance-upload__preview" />
          : <img src={url} alt={item.file.name} className="compliance-upload__preview" />;
      })()}
    </Modal>
  </div>;
}
