"use client";

import { useState } from "react";
import { Check, History, Moon, Save, Sun } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Input, PageHeader } from "@/components/ui";
import { IndividualLoginNotice, LoadState, jsonRequest, messageOf } from "@/components/btb/Feedback";
import OnePagePrint, { PrintSheetButton } from "@/components/btb/OnePagePrint";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { fetchJson } from "@/lib/fetch-json";
import { btbToday, isIsoDate } from "@/lib/btb-team";
import { canonicalCheckItems, checklistStaff, type BtbShiftCheck, type CheckType } from "@/lib/btb-operations";
import { checkDraftKey, parseCheckDraft, previewChecks, type CheckDraft } from "@/lib/btb-check-drafts";

type ChecksData = { checks: BtbShiftCheck[]; hasMore: boolean };
const checkTitle = (type: CheckType) => type === "opening" ? "Opening" : "Closing";

export default function ChecklistsPage() {
  return <BtbFeatureGate feature="checklists" wide>{(readOnly) => <DailyChecks readOnly={readOnly} />}</BtbFeatureGate>;
}

function DailyChecks({ readOnly }: { readOnly: boolean }) {
  const [date, setDate] = useState(btbToday);
  const [history, setHistory] = useState(false);
  return <div className="ops-workspace"><div className="btb-screen ops-workspace"><PageHeader title="Opening & closing checks" subtitle="A ready restaurant, a careful close, and a name behind every completed duty." action={<Button variant="ghost" onClick={() => setHistory(!history)} aria-expanded={history}><History size={18} />{history ? "Hide history" : "Saved history"}</Button>} />
    <div className="ops-toolbar"><label className="ops-inline-field">Checklist date<Input type="date" max={btbToday()} value={date} onChange={(event) => { if (isIsoDate(event.target.value)) setDate(event.target.value); }} /></label><Button variant="soft" onClick={() => setDate(btbToday())}>Today</Button></div>
  </div><CheckDay key={date} date={date} readOnly={readOnly} />{history && <div className="btb-screen"><CheckHistory onView={(day) => { setDate(day); window.scrollTo({ top: 0, behavior: "instant" }); }} /></div>}</div>;
}

function CheckDay({ date, readOnly }: { date: string; readOnly: boolean }) {
  const { identity } = useBtbWorkspace();
  const { data, loading, error, reload, update } = useBtbData<ChecksData>(`/api/btb/checklists?date=${date}`);
  return <>
    <div className="btb-screen ops-workspace">{!identity?.employeeId && !readOnly && <IndividualLoginNotice next="/between-the-buns/checklists" />}
      <div className="ops-toolbar"><p className="ops-meta">{date} · Completed duties show the employee who saved them.</p><PrintSheetButton disabled={!data} label="Print opening + closing" /></div>
      <LoadState loading={loading} error={error} onRetry={reload} />
      {data && <div className="btb-check-grid">{(["opening", "closing"] as const).map((type) => <CheckCard key={type} date={date} type={type} saved={data.checks.find((check) => check.check_type === type)} readOnly={readOnly || !identity?.employeeId} onReload={reload} onSaved={(check) => update((current) => ({ ...current, checks: [...current.checks.filter((item) => item.check_type !== type), check] }))} />)}</div>}
    </div>
    {data && <OnePagePrint label="Daily opening and closing print sheet"><header className="ops-print-heading"><div><h1>Between the Buns · Daily checks</h1><p>{date} · Saved opening & closing records</p></div><span>Employee attribution on each checked duty</span></header><div className="check-print-columns">{(["opening", "closing"] as const).map((type) => {
      const saved = data.checks.find((check) => check.check_type === type);
      const items = canonicalCheckItems(type, saved?.items);
      return <section key={type}><h2>{checkTitle(type)} <span>{items.filter((item) => item.completed).length}/{items.length}</span></h2>{["Front", "Kitchen"].map((section) => <div key={section}><h3>{section}</h3>{items.filter((item) => item.section === section).map((item) => <div className="check-print-item" key={item.id}><span className="check-print-box">{item.completed ? "✓" : ""}</span><div>{item.text}<p>{item.completed ? item.completed_by_name || "Legacy · staff not recorded" : "Not completed"}</p></div></div>)}</div>)}<p className="check-print-notes"><strong>Handover notes:</strong> {saved?.notes || "—"}</p><p className="ops-print-footer">{saved ? `Saved by ${saved.saved_by_name} · version ${saved.version}` : "No saved record for this shift."}</p></section>;
    })}</div><p className="ops-print-footer">This printout includes confirmed saves. Unsaved device drafts are shown on screen.</p></OnePagePrint>}
  </>;
}

function CheckCard({ date, type, saved, readOnly, onSaved, onReload }: { date: string; type: CheckType; saved?: BtbShiftCheck; readOnly: boolean; onSaved: (check: BtbShiftCheck) => void; onReload: () => void }) {
  const { identity } = useBtbWorkspace();
  const key = checkDraftKey(identity?.employeeId ?? "shared", date, type);
  const [draft, setDraft] = useState<CheckDraft | null>(() => {
    try { return readOnly ? null : parseCheckDraft(localStorage.getItem(key), type); } catch { return null; }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const items = previewChecks(type, saved?.items ?? [], draft, identity?.name ?? "Employee");
  const done = items.filter((item) => item.completed).length;
  const stale = !!draft && draft.version !== (saved?.version ?? 0);
  const notes = draft?.notes ?? saved?.notes ?? "";
  const persist = (next: CheckDraft | null) => {
    setDraft(next); setNotice("");
    try { if (next) localStorage.setItem(key, JSON.stringify(next)); else localStorage.removeItem(key); setStorageError(""); }
    catch { setStorageError("This browser cannot retain the draft after closing. Keep this page open until your save succeeds."); }
  };
  const change = (id: string, completed: boolean) => persist({ version: draft?.version ?? saved?.version ?? 0, ...draft, changes: { ...draft?.changes, [id]: completed } });
  const save = async () => {
    if (!draft || saving || readOnly || stale) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await fetchJson<{ check: BtbShiftCheck }>("/api/btb/checklists", jsonRequest({ date, type, version: draft.version, notes, changes: Object.entries(draft.changes).map(([id, completed]) => ({ id, completed })) }));
      onSaved(result.check); persist(null); setNotice(`${checkTitle(type)} checks saved under your employee account.`);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  };
  return <section className="btb-check-card" aria-label={`${checkTitle(type)} checklist`}>
    <header className="btb-check-card__head"><div className="ops-card-heading"><span className="ui-icon ui-tone--purple">{type === "opening" ? <Sun size={22} /> : <Moon size={22} />}</span><div><h2>{checkTitle(type)}</h2><p>{type === "opening" ? "Ready for the first guest" : "Ready for tomorrow"}</p></div><Badge accent={done === items.length ? "green" : "slate"}>{done}/{items.length}</Badge></div><progress className="ops-progress" value={done} max={items.length} aria-label={`${checkTitle(type)} checklist progress`} /><p className="ops-meta">{draft ? "Unsaved changes on this device" : saved ? `Last saved by ${saved.saved_by_name}` : "No checks saved yet"}</p></header>
    {stale && <div className="ui-notice ui-notice--warning"><div><strong>The saved checklist has changed.</strong><p>Your changes are still visible below. Review them against the latest record, then apply your draft.</p><Button variant="ghost" disabled={saving} onClick={() => persist({ ...draft!, version: saved?.version ?? 0 })}>Apply my changes to latest</Button></div></div>}
    {["Front", "Kitchen"].map((section) => <fieldset className="btb-check-section" key={section} disabled={readOnly || saving}><legend>{section === "Front" ? "Front of house" : "Kitchen"}</legend>{items.filter((item) => item.section === section).map((item) => <label className={`btb-duty ${item.completed ? "btb-duty--done" : ""}`} key={item.id}><input type="checkbox" checked={item.completed} onChange={(event) => change(item.id, event.target.checked)} /><span><span className="btb-duty__text">{item.text}</span><span className="btb-duty__by">{item.completed && <Check size={13} aria-hidden="true" />}{item.completed ? item.completed_by_name || "Legacy · staff not recorded" : "Not completed"}</span></span></label>)}</fieldset>)}
    <div className="btb-check-card__foot"><label className="ui-form-stack">Handover notes<textarea className="ui-input" rows={3} maxLength={2000} disabled={readOnly || saving} value={notes} onChange={(event) => persist({ version: draft?.version ?? saved?.version ?? 0, changes: draft?.changes ?? {}, notes: event.target.value })} placeholder="Anything the next shift should know?" /></label>
      {error && <div className="ui-notice ui-notice--error" role="alert"><div>{error}<br /><Button variant="ghost" onClick={onReload} disabled={saving}>Reload saved checks</Button></div></div>}{storageError && <p className="ui-notice ui-notice--warning" role="status">{storageError}</p>}{notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}
      {!readOnly && <div className="ui-actions"><Button disabled={!draft || saving || stale} onClick={save}><Save size={17} />{saving ? "Saving…" : `Save ${type} checks`}</Button>{draft && <Button variant="ghost" disabled={saving} onClick={() => { persist(null); setError(""); }}>Discard this draft</Button>}</div>}
    </div>
  </section>;
}

function CheckHistory({ onView }: { onView: (date: string) => void }) {
  const { data, loading, error, reload } = useBtbData<ChecksData>("/api/btb/checklists");
  const [older, setOlder] = useState<BtbShiftCheck[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const checks = [...(data?.checks ?? []), ...older];
  const loadMore = async () => {
    if (busy || !checks.length) return;
    setBusy(true); setPageError("");
    try { const result = await fetchJson<ChecksData>(`/api/btb/checklists?before=${checks[checks.length - 1].check_date}`); setOlder([...older, ...result.checks]); setMore(result.hasMore); }
    catch (cause) { setPageError(messageOf(cause)); }
    finally { setBusy(false); }
  };
  return <section className="ops-workspace"><div className="ops-section-heading"><h2>Saved check history</h2><span className="ops-meta">Opening and closing records with employee names</span></div><LoadState loading={loading} error={error} onRetry={reload} />
    {!!checks.length && <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th scope="col">Date / shift</th><th scope="col">Completed by</th><th scope="col">Progress</th><th scope="col">Record</th></tr></thead><tbody>{checks.map((check) => <tr key={check.id}><td><strong>{check.check_date}</strong><p>{checkTitle(check.check_type)}</p></td><td>{checklistStaff(check.items).join(", ") || "No completed duties"}</td><td><Badge accent={check.completed ? "green" : "amber"}>{check.done_count}/{check.total_count}</Badge></td><td><Button variant="ghost" onClick={() => onView(check.check_date)}>View {check.check_date}</Button></td></tr>)}</tbody></table></div>}
    {data && !checks.length && <div className="ui-empty"><History size={26} /><h3>Your saved shifts will appear here.</h3></div>}{pageError && <p className="ui-notice ui-notice--error" role="alert">{pageError}</p>}{(more ?? data?.hasMore) && <Button variant="ghost" onClick={loadMore} disabled={busy}>{busy ? "Loading…" : "Load older checks"}</Button>}
  </section>;
}
