"use client";
// Daily prep sheet. Server-authoritative: every save goes through
// /api/btb/prep, which decides what this person may see and change. Pressing a
// button never refetches the sheet — local edits are autosaved, and only a
// submit or a PAR update reloads the day.

import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { jsonRequest } from "@/components/btb/Feedback";
import { prepCategoryItems } from "@/lib/btb-prep";
import { btbToday } from "@/lib/btb-team";
import EditLogPanel from "@/components/btb/EditLogPanel";

interface Item { key: string; name: string; unit: string; urgent: boolean; custom: boolean; par: number | null; oh: string; make: string | null; pull: string | null; done: boolean }
interface Section { category: string; mode: "par" | "pull"; assigned: string[]; mine: boolean; items: Item[] }
interface Comment { id: string; author_name: string; author_role: string; body: string; created_at: string }
interface Notice { id: string; body: string }
interface Submission { employee_name: string; categories: string[]; complete: boolean; missing: number; submitted_at: string }
interface Sheet {
  date: string; weekStart: string; historyDays: number; canManage: boolean; canSeePar: boolean;
  parSet: boolean | null; categories: Section[]; team: { id: string; name: string; role: string }[];
  comments: Comment[]; notices: Notice[]; submissions: Submission[]; employeeId: string | null;
  canViewEditLog?: boolean;
}
interface Level { category: string; key: string; name: string; unit: string; par: string; urgent: boolean; custom: boolean }
type Cell = { oh?: string; make?: string; pull?: string; done?: boolean };

const when = (value: string) => new Date(value).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function PrepSheet() {
  const [date, setDate] = useState(btbToday);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notice, setNotice] = useState("");
  const [comment, setComment] = useState("");
  const [showPar, setShowPar] = useState(false);
  const [levels, setLevels] = useState<Level[]>([]);
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [adding, setAdding] = useState<{ category: string; name: string; unit: string; par: string; urgent: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async (day: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError("");
    try {
      setSheet(await fetchJson<Sheet>(`/api/btb/prep?date=${day}`, { signal: controller.signal }));
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "The sheet could not be loaded.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // The load is keyed by the chosen date and owns its own abort; the spinner is
  // a request flag, not state derived during render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(date); return () => abort.current?.abort(); }, [date, load]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const cells = useCallback((current: Sheet) => {
    const data: Record<string, Record<string, Cell>> = {};
    for (const section of current.categories) {
      if (!current.canManage && !section.mine) continue;
      if (!section.items.length) continue;
      data[section.category] = Object.fromEntries(section.items.map((item) => [item.key, { oh: item.oh, make: item.make ?? undefined, pull: item.pull ?? undefined, done: item.done }]));
    }
    return data;
  }, []);

  const schedule = useCallback((next: Sheet) => {
    setSheet(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSave("saving");
      try {
        await fetchJson("/api/btb/prep", jsonRequest({ action: "draft", date: next.date, data: cells(next) }));
        setSave("saved");
      } catch { setSave("error"); }
    }, 700);
  }, [cells]);

  const edit = (category: string, key: string, field: "oh" | "make" | "pull" | "done", value: string | boolean) => {
    if (!sheet) return;
    schedule({
      ...sheet,
      categories: sheet.categories.map((section) => section.category !== category ? section : {
        ...section,
        items: section.items.map((item) => item.key !== key ? item : { ...item, [field]: value }),
      }),
    });
  };


  const submit = async () => {
    if (!sheet) return;
    const mine = sheet.canManage ? sheet.categories.filter((section) => section.mine) : sheet.categories;
    if (!mine.length) { setNotice("Ask your manager to assign you a section first."); return; }
    const open = mine.flatMap((section) => section.items.filter((item) => !item.done).map((item) => `${section.category}: ${item.name}`));
    if (open.length && !window.confirm(`You are submitting only this information — ${open.length} item${open.length === 1 ? "" : "s"} not ticked.\n\n${open.slice(0, 8).join("\n")}${open.length > 8 ? "\n…" : ""}\n\nSubmit anyway?`)) return;
    if (timer.current) clearTimeout(timer.current);
    setSave("saving");
    try {
      const result = await fetchJson<{ missing: number; notice: string }>("/api/btb/prep", jsonRequest({ action: "submit", date: sheet.date }));
      setNotice(result.notice);
      setSave("idle");
      await load(sheet.date);
    } catch (caught) {
      setSave("error");
      setNotice(caught instanceof Error ? caught.message : "The sheet could not be submitted.");
    }
  };

  const openPar = () => {
    if (!sheet) return;
    const rows: Level[] = [];
    for (const section of sheet.categories) {
      if (section.items.length) {
        for (const item of section.items) rows.push({ category: section.category, key: item.key, name: item.name, unit: item.unit, par: item.par === null ? "" : String(item.par), urgent: item.urgent, custom: item.custom });
      } else {
        for (const item of prepCategoryItems(section.category)) rows.push({ category: section.category, key: item.key, name: item.name, unit: item.unit, par: "", urgent: false, custom: false });
      }
    }
    setLevels(rows);
    setAssign(Object.fromEntries(sheet.categories.map((section) => [section.category, [...section.assigned]])));
    setShowPar(true);
  };

  const savePar = async () => {
    if (!sheet) return;
    setSave("saving");
    try {
      await fetchJson("/api/btb/prep", jsonRequest({
        action: "par", weekStart: sheet.weekStart,
        levels: levels.filter((row) => row.par !== "").map((row) => ({ category: row.category, key: row.key, name: row.name, unit: row.unit, par: Number(row.par), urgent: row.urgent, custom: row.custom })),
      }));
      await fetchJson("/api/btb/prep", jsonRequest({ action: "assign", weekStart: sheet.weekStart, assignments: assign }));
      setShowPar(false);
      setSave("idle");
      setNotice("PAR levels and section assignments saved for this week.");
      await load(sheet.date);
    } catch (caught) {
      setSave("error");
      setNotice(caught instanceof Error ? caught.message : "The PAR levels could not be saved.");
    }
  };

  const addRow = (category: string) => {
    setLevels((rows) => [...rows, { category, key: `custom-${Date.now()}`, name: "", unit: "", par: "", urgent: false, custom: true }]);
  };

  const addComment = async () => {
    if (!sheet || !comment.trim()) return;
    try {
      await fetchJson("/api/btb/prep", jsonRequest({ action: "comment", date: sheet.date, body: comment.trim() }));
      setComment("");
      await load(sheet.date);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "The comment could not be saved."); }
  };

  const dismissNotices = async () => {
    if (!sheet) return;
    setSheet({ ...sheet, notices: [] });
    try { await fetchJson("/api/btb/prep", jsonRequest({ action: "notices-read" })); } catch { /* banner is already gone */ }
  };

  const toggleUrgent = async (category: string, item: Item) => {
    if (!sheet) return;
    try {
      await fetchJson("/api/btb/prep", jsonRequest({
        action: "add-item", weekStart: sheet.weekStart, category, name: item.name,
        unit: item.unit, par: item.par ?? 0, urgent: !item.urgent,
      }));
      await load(sheet.date);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Urgent could not be changed."); }
  };

  const addItem = async () => {
    if (!sheet || !adding) return;
    try {
      await fetchJson("/api/btb/prep", jsonRequest({
        action: "add-item", weekStart: sheet.weekStart, category: adding.category,
        name: adding.name.trim(), unit: adding.unit.trim(), par: Number(adding.par || 0), urgent: adding.urgent,
      }));
      setAdding(null);
      await load(sheet.date);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "The item could not be added."); }
  };

  const togglePerson = (category: string, id: string) => {
    setAssign((current) => {
      const list = current[category] ?? [];
      return { ...current, [category]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] };
    });
  };


  const sections = sheet ? (sheet.canManage ? sheet.categories : sheet.categories.filter((section) => section.mine)) : [];
  const nameOf = (id: string) => sheet?.team.find((person) => person.id === id)?.name ?? "—";
  const statusLabel = save === "saving" ? "Saving…" : save === "saved" ? "All changes saved" : save === "error" ? "Not saved" : "";
  const itemCount = sections.reduce((total, section) => total + section.items.length, 0);

  return (
    <div className="prep-page">
      <header className="no-print prep-toolbar">
        <div className="prep-toolbar__heading">
          <h1 className="prep-toolbar__title">Daily prep sheet</h1>
          <p className="prep-toolbar__meta">
            {sheet ? `Week of ${sheet.weekStart} · ${itemCount} ${itemCount === 1 ? "item" : "items"} · History ${sheet.historyDays} days` : "Count what is on hand, make to PAR and tick each item off."}
          </p>
        </div>
        <label className="prep-date">
          <span>Sheet date</span>
          <input type="date" max={btbToday()} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <div className="prep-toolbar__actions">
          {statusLabel && <span className={`prep-status prep-status--${save}`} role="status"><span className="prep-status__dot" aria-hidden="true" />{statusLabel}</span>}
          {sheet?.canManage && (
            <button type="button" onClick={openPar} className={`prep-par-chip ${sheet.parSet ? "is-set" : "is-unset"}`}>
              PAR levels: {sheet.parSet ? "set for this week" : "not set — set now"}
            </button>
          )}
          <button type="button" className="ui-button ui-button--ghost prep-toolbar__button" onClick={() => void load(date)}><RefreshCw size={15} aria-hidden="true" />Refresh</button>
          <button type="button" className="ui-button ui-button--ghost prep-toolbar__button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />Print sheet</button>
          {sheet?.canViewEditLog && <EditLogPanel area="prep" days={sheet.historyDays} />}
          {sheet && <button type="button" className="ui-button" onClick={() => void submit()}>Submit</button>}
        </div>
      </header>

      {sheet?.notices?.length ? (
        <div className="no-print ui-notice ui-notice--warning">
          <div className="prep-notice-row">
            <ul>{sheet.notices.map((item) => <li key={item.id}>{item.body}</li>)}</ul>
            <button type="button" onClick={() => void dismissNotices()}>Dismiss</button>
          </div>
        </div>
      ) : null}
      {notice && <p className="no-print ui-notice ui-notice--success">{notice}</p>}
      {error && <p className="no-print ui-notice ui-notice--error" role="alert">{error}</p>}
      {loading && !sheet && <p className="no-print prep-loading" role="status">Loading the sheet…</p>}

      {sheet && !sections.length && (
        <p className="no-print ui-notice">No section is assigned to you this week. Ask your manager to assign one.</p>
      )}

      {sheet && sections.length > 0 && (
        <div className="prep-sheet prep-sheet__grid">
          {sections.map((section) => {
            const total = section.items.length;
            const done = section.items.filter((item) => item.done).length;
            const complete = total > 0 && done === total;
            return (
              <section key={section.category} className="prep-section">
                <div className="prep-section__head">
                  <div className="prep-section__heading">
                    <h2>{section.category}</h2>
                    <span className="prep-section__who" title={section.assigned.map(nameOf).join(", ")}>
                      {section.assigned.length ? section.assigned.map(nameOf).join(", ") : "Unassigned"}
                    </span>
                  </div>
                  <span className={`prep-section__progress${complete ? " is-complete" : ""}`}>
                    {total ? `${done}/${total} done` : "No items"}
                  </span>
                </div>
                <div className={`prep-section__bar${complete ? " is-complete" : ""}`} aria-hidden="true">
                  <span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
                </div>
                <div className="prep-table-wrap">
                  <table className="prep-table">
                    <colgroup>
                      <col className="prep-col-item" /><col className="prep-col-unit" /><col className="prep-col-flag" />
                      {sheet.canSeePar && <col className="prep-col-par" />}
                      <col className="prep-col-cell" />
                      <col className="prep-col-cell" /><col className="prep-col-done" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Item</th><th scope="col">Unit</th><th scope="col" className="prep-center">Urgent</th>
                        {sheet.canSeePar && <th scope="col" className="prep-center">PAR</th>}
                        <th scope="col" className="prep-center">OH</th>
                        <th scope="col" className="prep-center">{section.mode === "pull" ? "Pull" : "Make"}</th>
                        <th scope="col" className="prep-center">Done</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item) => (
                        <tr key={item.key} className={item.done ? "is-done" : ""}>
                          <th scope="row" className="prep-item">{item.name}{item.custom ? <span className="prep-item__custom"> *</span> : null}</th>
                          <td className="prep-unit-cell">{item.unit || "—"}</td>
                          <td className="prep-center">{sheet.canManage
                            ? <input type="checkbox" aria-label={`${item.name} urgent`} checked={item.urgent} onChange={() => void toggleUrgent(section.category, item)} />
                            : item.urgent ? <span className="prep-urgent">Urgent</span> : <span className="prep-empty">—</span>}</td>
                          {sheet.canSeePar && <td className="prep-center prep-num">{item.par ?? "—"}</td>}
                          <td className="prep-center">
                            {sheet.canManage
                              ? <input inputMode="decimal" className="prep-input" aria-label={`${item.name} on hand`} value={item.oh} onChange={(event) => edit(section.category, item.key, "oh", event.target.value)} />
                              : <span className="prep-num prep-num--value">{item.oh || "—"}</span>}
                          </td>
                          <td className="prep-center">
                            {section.mode === "pull" ? <span className="prep-num prep-num--value">{item.pull || "—"}</span> : sheet.canManage
                              ? <input inputMode="decimal" className="prep-input" aria-label={`${item.name} make`} value={item.make ?? ""} onChange={(event) => edit(section.category, item.key, "make", event.target.value)} />
                              : <span className="prep-num prep-num--value">{item.make || "—"}</span>}
                          </td>
                          <td className="prep-center">
                            <input type="checkbox" className="prep-check" aria-label={`${item.name} done`} checked={item.done} onChange={(event) => edit(section.category, item.key, "done", event.target.checked)} />
                          </td>
                        </tr>
                      ))}
                      {!section.items.length && <tr><td colSpan={sheet.canSeePar ? 7 : 6} className="prep-empty-cell">No items yet — the manager sets the PAR levels for this section.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {sheet.canManage && (
                  <div className="no-print prep-section__add">
                    {adding?.category === section.category ? (
                      <div className="prep-add__form">
                        <input placeholder="Item name" aria-label="Item name" className="prep-field prep-field--name" value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} />
                        <input placeholder="Unit" aria-label="Unit" className="prep-field prep-field--unit" value={adding.unit} onChange={(event) => setAdding({ ...adding, unit: event.target.value })} />
                        <input placeholder="PAR" aria-label="PAR" inputMode="decimal" className="prep-field prep-field--par" value={adding.par} onChange={(event) => setAdding({ ...adding, par: event.target.value })} />
                        <label className="prep-add__urgent"><input type="checkbox" checked={adding.urgent} onChange={(event) => setAdding({ ...adding, urgent: event.target.checked })} />Urgent</label>
                        <button type="button" className="ui-button prep-add__submit" onClick={() => void addItem()}>Add</button>
                        <button type="button" className="prep-add__cancel" onClick={() => setAdding(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="ops-text-link prep-add__toggle" onClick={() => setAdding({ category: section.category, name: "", unit: "", par: "", urgent: false })}>+ Add additional item</button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {sheet && (
        <section className="no-print prep-panel prep-comments">
          <div className="prep-panel__head">
            <h2>Comments</h2>
            <span className="prep-panel__count">{sheet.comments.length ? `${sheet.comments.length} ${sheet.comments.length === 1 ? "note" : "notes"}` : "None yet"}</span>
          </div>
          <ul className="prep-comments__list">
            {sheet.comments.map((entry) => (
              <li key={entry.id} className="prep-comment">
                <strong>{entry.author_name}</strong>
                <span className="prep-comment__meta">{entry.author_role} · {when(entry.created_at)}</span>
                <p>{entry.body}</p>
              </li>
            ))}
            {!sheet.comments.length && <li className="prep-comments__empty">No comments yet — leave a note for the manager or the team.</li>}
          </ul>
          <div className="prep-comment__form">
            <textarea className="prep-textarea" placeholder="Add a comment for the manager or the team" aria-label="Add a comment" value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} />
            <button type="button" className="ui-button" disabled={!comment.trim()} onClick={() => void addComment()}>Comment</button>
          </div>
        </section>
      )}

      {sheet && (
        <section className="no-print prep-panel prep-history">
          <button type="button" className="ops-text-link prep-history__toggle" aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)}>
            {showHistory ? "Hide" : "Show"} history (last {sheet.historyDays} days)
          </button>
          {showHistory && (
            <div className="ops-table-wrap">
              <table className="ops-table w-full text-xs">
                <thead><tr><th scope="col">Who</th><th scope="col">Sections</th><th scope="col">Result</th><th scope="col">When</th></tr></thead>
                <tbody>
                  {sheet.submissions.map((entry, index) => (
                    <tr key={`${entry.submitted_at}-${index}`}>
                      <th scope="row" className="text-left">{entry.employee_name}</th>
                      <td>{entry.categories.join(", ") || "—"}</td>
                      <td>{entry.complete ? "Complete" : `${entry.missing} not ticked`}</td>
                      <td>{when(entry.submitted_at)}</td>
                    </tr>
                  ))}
                  {!sheet.submissions.length && <tr><td colSpan={4} className="text-slate-500">Nothing submitted in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}



      {showPar && sheet && (
        <div className="no-print prep-modal" role="presentation">
          <div className="prep-modal__panel" role="dialog" aria-modal="true" aria-labelledby="prep-par-title">
            <header className="prep-modal__head">
              <div>
                <h2 id="prep-par-title">PAR levels · week of {sheet.weekStart}</h2>
                <p>Set the PAR for the seven days starting Friday. Leave an item blank to leave it off the sheet, and add any extra item the branch needs.</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setShowPar(false)}>Close</button>
            </header>
            <div className="prep-modal__body">
              {sheet.categories.map((section) => (
                <section key={section.category} className="prep-modal__section">
                  <header className="prep-modal__section-head">
                    <h3>{section.category}</h3>
                    <button type="button" className="ui-button ui-button--ghost prep-modal__add" onClick={() => addRow(section.category)}>+ Add item</button>
                  </header>
                  <table className="ops-table w-full text-xs prep-par-table">
                    <thead><tr><th scope="col">Item</th><th scope="col">Unit</th><th scope="col">PAR</th><th scope="col">Urgent</th></tr></thead>
                    <tbody>
                      {levels.map((row, index) => row.category !== section.category ? null : (
                        <tr key={row.key}>
                          <td>{row.custom
                            ? <input className="prep-field prep-field--name" placeholder="Item name" aria-label="Custom item name" value={row.name} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, name: event.target.value } : entry))} />
                            : <span className="prep-item__name">{row.name}</span>}</td>
                          <td><input className="prep-field prep-field--unit" aria-label={`${row.name || "Item"} unit`} value={row.unit} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, unit: event.target.value } : entry))} /></td>
                          <td><input inputMode="decimal" className="prep-field prep-field--par" aria-label={`${row.name || "Item"} PAR`} value={row.par} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, par: event.target.value } : entry))} /></td>
                          <td className="text-center"><input type="checkbox" className="prep-check" aria-label={`${row.name || "Item"} urgent`} checked={row.urgent} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, urgent: event.target.checked } : entry))} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <fieldset className="prep-assign">
                    <legend>Who does this section</legend>
                    {sheet.team.map((person) => (
                      <label key={person.id}>
                        <input type="checkbox" checked={(assign[section.category] ?? []).includes(person.id)} onChange={() => togglePerson(section.category, person.id)} />
                        {person.name}
                      </label>
                    ))}
                    {!sheet.team.length && <span className="prep-empty">None</span>}
                  </fieldset>
                </section>
              ))}
            </div>
            <footer className="prep-modal__foot">
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setShowPar(false)}>Cancel</button>
              <button type="button" className="ui-button" disabled={save === "saving"} onClick={() => void savePar()}>Save PAR levels</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
