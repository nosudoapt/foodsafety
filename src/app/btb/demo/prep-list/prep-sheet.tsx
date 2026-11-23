"use client";
// Daily prep sheet. Server-authoritative: every save goes through
// /api/btb/prep, which decides what this person may see and change. Pressing a
// button never refetches the sheet — local edits are autosaved, and only a
// submit or a PAR update reloads the day.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { jsonRequest } from "@/components/btb/Feedback";
import { prepCategoryItems } from "@/lib/btb-prep";
import { btbToday } from "@/lib/btb-team";
import PrintButton from "@/components/PrintButton";

interface Item { key: string; name: string; unit: string; urgent: boolean; custom: boolean; par: number | null; oh: string; make: string | null; pull: string | null; done: boolean }
interface Section { category: string; mode: "par" | "pull"; assigned: string[]; mine: boolean; items: Item[] }
interface Comment { id: string; author_name: string; author_role: string; body: string; created_at: string }
interface Notice { id: string; body: string }
interface Submission { employee_name: string; categories: string[]; complete: boolean; missing: number; submitted_at: string }
interface Sheet {
  date: string; weekStart: string; historyDays: number; canManage: boolean; canSeePar: boolean;
  parSet: boolean | null; categories: Section[]; team: { id: string; name: string; role: string }[];
  comments: Comment[]; notices: Notice[]; submissions: Submission[]; employeeId: string | null;
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

  const togglePerson = (category: string, id: string) => {
    setAssign((current) => {
      const list = current[category] ?? [];
      return { ...current, [category]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] };
    });
  };


  const sections = sheet ? (sheet.canManage ? sheet.categories : sheet.categories.filter((section) => section.mine)) : [];
  const parChip = sheet?.parSet ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-red-300 bg-red-50 text-red-700";
  const nameOf = (id: string) => sheet?.team.find((person) => person.id === id)?.name ?? "—";

  return (
    <div className="space-y-4 pb-10">
      <style>{`@media print{@page{size:A4 landscape;margin:6mm}body{background:#fff}.no-print{display:none!important}.prep-section{break-inside:avoid;margin:0 0 3mm}.prep-section h2{font-size:9pt;margin:0 0 1mm}.prep-section table{width:100%;font-size:7pt;border-collapse:collapse}.prep-section th,.prep-section td{border:1px solid #999;padding:0.6mm 1mm;line-height:1.05}.prep-section thead th{background:#eee}.prep-sheet-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.prep-done{color:#111}}`}</style>

      <header className="no-print flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">Prep sheet</h1>
        <label className="text-sm">Date <input type="date" className="ml-1 rounded border px-2 py-1" max={btbToday()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {sheet && <span className="ops-meta text-xs">Week of {sheet.weekStart} · {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Not saved" : `History ${sheet.historyDays} days`}</span>}
        <button className="ui-button ui-button--ghost" onClick={() => void load(date)}>Refresh</button>
        <PrintButton label="Print sheet" />
        {sheet?.canManage && (
          <button type="button" onClick={openPar} className={`rounded-full border px-3 py-1 text-xs font-semibold ${parChip}`}>
            PAR levels: {sheet.parSet ? "set for this week" : "not set — tap to set"}
          </button>
        )}
        {sheet && <button type="button" className="ui-button" onClick={() => void submit()}>Submit</button>}
      </header>

      {sheet?.notices?.length ? (
        <div className="no-print rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          <div className="flex items-start justify-between gap-3">
            <ul className="space-y-1">{sheet.notices.map((item) => <li key={item.id}>{item.body}</li>)}</ul>
            <button type="button" className="text-xs underline" onClick={() => void dismissNotices()}>Dismiss</button>
          </div>
        </div>
      ) : null}
      {notice && <p className="no-print rounded border border-slate-300 bg-slate-50 p-2 text-sm">{notice}</p>}
      {error && <p className="no-print rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {loading && !sheet && <p className="text-sm">Loading the sheet…</p>}

      {sheet && !sections.length && (
        <p className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">No section is assigned to you this week. Ask your manager to assign one.</p>
      )}

      {sheet && sections.length > 0 && (
        <div className="prep-sheet-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <section key={section.category} className="prep-section overflow-hidden rounded border border-slate-300">
              <h2 className="flex items-center justify-between bg-slate-100 px-2 py-1 text-sm font-bold">
                <span>{section.category}</span>
                <span className="text-[11px] font-normal text-slate-600">{section.assigned.length ? section.assigned.map(nameOf).join(", ") : "unassigned"}</span>
              </h2>
              <table className="ops-table w-full text-xs">
                <thead>
                  <tr>
                    <th scope="col">Item</th><th scope="col">Unit</th><th scope="col">Urgent</th>
                    {sheet.canSeePar && <th scope="col">PAR</th>}
                    <th scope="col">OH</th>
                    {section.mode === "pull" ? <th scope="col">Pull</th> : <th scope="col">Make</th>}
                    <th scope="col">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.key} className={item.done ? "prep-done" : ""}>
                      <th scope="row" className="text-left font-medium">{item.name}{item.custom ? " *" : ""}</th>
                      <td>{item.unit || "—"}</td>
                      <td>{item.urgent ? "Urgent" : ""}</td>
                      {sheet.canSeePar && <td className="tabular-nums">{item.par ?? "—"}</td>}
                      <td>
                        {sheet.canManage
                          ? <input inputMode="decimal" className="w-14 rounded border px-1" value={item.oh} onChange={(event) => edit(section.category, item.key, "oh", event.target.value)} />
                          : (item.oh || "—")}
                      </td>
                      <td>
                        {section.mode === "pull" ? (item.pull || "—") : sheet.canManage
                          ? <input inputMode="decimal" className="w-14 rounded border px-1" value={item.make ?? ""} onChange={(event) => edit(section.category, item.key, "make", event.target.value)} />
                          : (item.make || "—")}
                      </td>
                      <td className="text-center">
                        <input type="checkbox" aria-label={`${item.name} done`} checked={item.done} onChange={(event) => edit(section.category, item.key, "done", event.target.checked)} />
                      </td>
                    </tr>
                  ))}
                  {!section.items.length && <tr><td colSpan={7} className="text-slate-500">No items yet — the manager sets the PAR levels for this section.</td></tr>}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      {sheet && (
        <section className="no-print rounded border border-slate-300 p-3">
          <h2 className="mb-2 text-sm font-bold">Comments</h2>
          <ul className="mb-2 space-y-1 text-sm">
            {sheet.comments.map((entry) => (
              <li key={entry.id}><strong>{entry.author_name}</strong> <span className="text-xs text-slate-500">{entry.author_role} · {when(entry.created_at)}</span><br />{entry.body}</li>
            ))}
            {!sheet.comments.length && <li className="text-slate-500">No comments yet.</li>}
          </ul>
          <div className="flex gap-2">
            <textarea className="min-h-16 flex-1 rounded border p-2 text-sm" placeholder="Add a comment for the manager or the team" value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} />
            <button type="button" className="ui-button h-9" disabled={!comment.trim()} onClick={() => void addComment()}>Comment</button>
          </div>
        </section>
      )}

      {sheet && (
        <section className="no-print">
          <button type="button" className="ops-text-link text-sm" onClick={() => setShowHistory((open) => !open)}>
            {showHistory ? "Hide" : "Show"} history (last {sheet.historyDays} days)
          </button>
          {showHistory && (
            <div className="ops-table-wrap mt-2">
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
        <div className="no-print fixed inset-0 z-50 overflow-auto bg-black/40 p-4">
          <div className="mx-auto max-w-5xl space-y-4 rounded bg-white p-4">
            <header className="flex items-center justify-between">
              <h2 className="text-base font-bold">PAR levels · week of {sheet.weekStart}</h2>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setShowPar(false)}>Close</button>
            </header>
            <p className="text-xs text-slate-600">Set the PAR for the seven days starting Friday. Leave an item blank to leave it off the sheet, and add any extra item the branch needs.</p>
            {sheet.categories.map((section) => (
              <section key={section.category} className="rounded border border-slate-300">
                <h3 className="flex items-center justify-between bg-slate-100 px-2 py-1 text-sm font-bold">
                  {section.category}
                  <button type="button" className="rounded border px-2 py-0.5 text-[11px]" onClick={() => addRow(section.category)}>+ Add item</button>
                </h3>
                <table className="ops-table w-full text-xs">
                  <thead><tr><th scope="col">Item</th><th scope="col">Unit</th><th scope="col">PAR</th><th scope="col">Urgent</th></tr></thead>
                  <tbody>
                    {levels.map((row, index) => row.category !== section.category ? null : (
                      <tr key={row.key}>
                        <td>{row.custom
                          ? <input className="w-40 rounded border px-1" placeholder="Item name" value={row.name} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, name: event.target.value } : entry))} />
                          : row.name}</td>
                        <td><input className="w-20 rounded border px-1" value={row.unit} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, unit: event.target.value } : entry))} /></td>
                        <td><input inputMode="decimal" className="w-16 rounded border px-1" value={row.par} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, par: event.target.value } : entry))} /></td>
                        <td className="text-center"><input type="checkbox" checked={row.urgent} onChange={(event) => setLevels((all) => all.map((entry, at) => at === index ? { ...entry, urgent: event.target.checked } : entry))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <fieldset className="flex flex-wrap gap-3 p-2 text-xs">
                  <legend className="px-1 text-[11px] font-semibold text-slate-600">Who does this section</legend>
                  {sheet.team.map((person) => (
                    <label key={person.id} className="flex items-center gap-1">
                      <input type="checkbox" checked={(assign[section.category] ?? []).includes(person.id)} onChange={() => togglePerson(section.category, person.id)} />
                      {person.name}
                    </label>
                  ))}
                  {!sheet.team.length && <span className="text-slate-500">No staff at this branch yet.</span>}
                </fieldset>
              </section>
            ))}
            <footer className="flex justify-end gap-2">
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setShowPar(false)}>Cancel</button>
              <button type="button" className="ui-button" disabled={save === "saving"} onClick={() => void savePar()}>Save PAR levels</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
