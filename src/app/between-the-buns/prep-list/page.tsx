"use client";

import { useEffect, useState } from "react";
import {
  itemKey,
  parKeys,
  prepCatalog,
  prepColumns,
  type PrepColumn as PrepColumnModel,
  type PrepItem,
} from "@/lib/btb-prep-list";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import PrintButton from "@/components/PrintButton";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import {
  defaultStore,
  drain,
  enqueue,
  newOp,
  pendingCount,
  shouldQueue,
  type OfflineOp,
  type PrepSavePayload,
} from "@/lib/offline-queue";
import { buildParMaps, parFor } from "@/lib/par-prefill";
import { BTB_RESTAURANT, btbToday, isIsoDate } from "@/lib/btb-team";

interface PrepEntry {
  par: string;
  oh: string;
  make: string;
  initial: string;
  /** Freezer/Dairy column only (prep_counts.pull). */
  pull: string;
  /** The client's Urgent flag — checkbox beside every item name in all three
   *  columns. Loads from prep_counts.urgent and saves back with the row. */
  urgent: boolean;
}

type PrepData = Record<string, PrepEntry>;

interface SavedPrepList {
  id: string;
  date: string;
  day: string;
  data: PrepData;
  savedAt: string;
  pullMissing: boolean;
}

const EMPTY: PrepEntry = { par: "", oh: "", make: "", initial: "", pull: "", urgent: false };

// Only the left/middle columns carry a Par — prefill and the manager-only gate
// skip the freezer/Dairy rows.
const PAR_KEY_SET = new Set(parKeys);

// MAKE = PAR - OH, blank until both are numbers.
const makeOf = (par: string, oh: string): string => {
  const p = parseFloat(par);
  const o = parseFloat(oh);
  return !isNaN(p) && !isNaN(o) ? String(Math.max(0, p - o)) : "";
};

// Finish each saved date before stopping at seven sheets. The same paginated
// reader opens a single sheet, so loading older catalog items never cuts them off.
async function readSavedPrepLists(signal: AbortSignal, date?: string): Promise<SavedPrepList[]> {
  const groups = new Map<string, SavedPrepList>();
  const scope = locationScope();
  for (let from = 0; from < 100_000; from += 500) {
    // SELECT * also reads installations where the optional Pull column is absent.
    let query = supabase.from("prep_counts").select("*").eq("restaurant_name", BTB_RESTAURANT)
      .order("count_date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, from + 499);
    if (scope) query = query.or(scope);
    if (date) query = query.eq("count_date", date);
    const { data: rows, error } = await query.abortSignal(signal);
    if (error) throw error;
    if (!rows) throw new Error("Saved prep sheets could not be read.");
    for (const row of rows) {
      if (!isIsoDate(row.count_date) || typeof row.item_name !== "string") continue;
      if (!groups.has(row.count_date)) {
        if (groups.size === 7) return [...groups.values()];
        groups.set(row.count_date, {
          id: row.count_date, date: row.count_date,
          day: new Date(`${row.count_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
          data: Object.create(null) as PrepData, savedAt: row.created_at ?? `${row.count_date}T12:00:00Z`, pullMissing: false,
        });
      }
      const list = groups.get(row.count_date)!;
      if (Object.hasOwn(list.data, row.item_name)) continue;
      const par = String(row.par ?? 0), oh = String(row.on_hand ?? 0);
      list.data[row.item_name] = { par, oh, make: makeOf(par, oh), pull: row.pull == null ? "" : String(row.pull), initial: "", urgent: !!row.urgent };
      list.pullMissing ||= !Object.hasOwn(row, "pull");
    }
    if (rows.length < 500) return [...groups.values()];
  }
  throw new Error("History is too large to load completely.");
}

// Staff/manager/owner fill it daily; corporate can read the sheet but not
// type into it (btb-access.ts) — hence `readOnly` on the boxes and Save.
// PAR is a manager decision, so the gate passes the role too: a manager types
// PAR, everyone else (staff, supervisor) sees it read-only and only edits OH.
export default function PrepListPage() {
  return (
    <BtbFeatureGate feature="prep_list" wide>
      {(readOnly, role) => <PrepList readOnly={readOnly} canEditPar={role === "manager"} />}
    </BtbFeatureGate>
  );
}

function PrepList({ readOnly, canEditPar }: { readOnly: boolean; canEditPar: boolean }) {
  const [date, setDate] = useState(btbToday);
  const [day, setDay] = useState(() =>
    new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })
  );
  const [prepData, setPrepData] = useState<PrepData>({});
  const [savedLists, setSavedLists] = useState<SavedPrepList[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(-1);
  const [historyError, setHistoryError] = useState("");
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [loading, setLoading] = useState(true);
  const [sheetRevision, setSheetRevision] = useState(0);
  const [sheetError, setSheetError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pullMissing, setPullMissing] = useState(false);
  const [offlinePending, setOfflinePending] = useState(0);

  // Offline outbox — one store per mount so IndexedDB survives a reload and
  // SSR (no indexedDB) falls back to a harmless in-memory queue.
  const [queue] = useState(() => defaultStore());
  const PREP_KINDS = ["prep_save"] as const;

  const refreshPending = async () => {
    setOfflinePending(await pendingCount(queue, PREP_KINDS));
  };

  const sendQueuedSave = async (op: OfflineOp) => {
    const payload = op.payload as PrepSavePayload;
    let del = supabase.from("prep_counts").delete().eq("restaurant_name", BTB_RESTAURANT).eq("count_date", payload.date);
    if (payload.scope) del = del.or(payload.scope);
    const { error: delErr } = await del;
    if (delErr) throw delErr;
    if (payload.rows.length) {
      const { error: insErr } = await supabase.from("prep_counts").insert(payload.rows.map((row) => ({ ...row, restaurant_name: BTB_RESTAURANT })));
      if (insErr) throw insErr;
    }
  };

  // Replay anything the tablet saved while it was offline — on load and
  // whenever the browser reports the connection is back.
  const syncOffline = async () => {
    const res = await drain(queue, sendQueuedSave, PREP_KINDS);
    if (res.sent) { setError(null); setHistoryRevision((value) => value + 1); }
    await refreshPending();
    return res;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await syncOffline();
    })();
    const onOnline = () => {
      void syncOffline();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount sync
  }, []);

  // History is refreshed from the database after confirmed saves and offline sync.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const lists = await readSavedPrepLists(controller.signal);
        if (!cancelled) { setSavedLists(lists); setHistoryError(""); }
      } catch {
        if (!cancelled) setHistoryError("Saved prep history couldn’t be loaded. Please try again.");
      } finally {
        if (!cancelled) setHistoryLoaded(historyRevision);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [historyRevision]);

  const handleDateChange = (newDate: string) => {
    if (!isIsoDate(newDate) || newDate === date || saving) return;
    setDate(newDate);
    setLoading(true);
    setSavedAt(null);
    const d = new Date(newDate + "T12:00:00");
    setDay(d.toLocaleDateString("en-US", { weekday: "long" }));
  };

  // The sheet for this count_date (plus legacy rows with no location), the Pull
  // column, and the history that seeds PAR for anything not saved yet —
  // same-weekday first, most recent otherwise (see src/lib/par-prefill.ts).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const scope = locationScope();
        let histQ = supabase
          .from("prep_counts")
          .select("item_name, par, urgent, count_date, created_at")
          .eq("restaurant_name", BTB_RESTAURANT)
          .neq("count_date", date)
          .order("count_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200);
        if (scope) histQ = histQ.or(scope);

        const [lists, { data: hist }] = await Promise.all([readSavedPrepLists(controller.signal, date), histQ.abortSignal(controller.signal)]);
        if (cancelled) return;
        const sheet = lists[0];
        setPullMissing(sheet?.pullMissing ?? false);
        const histRows = ((hist ?? []) as { item_name: string; par: number; urgent?: boolean | null; count_date: string }[]).map(
          (r) => ({ item_name: r.item_name, par: r.par, urgent: r.urgent, date: r.count_date }),
        );
        const maps = buildParMaps(histRows, date);

        const next: PrepData = { ...sheet?.data };
        for (const key of prepCatalog) {
          if (Object.hasOwn(next, key)) continue;
          // Nothing saved for this date yet — seed PAR so a manager doesn't
          // retype it every day. On Hand stays blank: staff still counts it.
          const snap = PAR_KEY_SET.has(key) ? parFor(maps, key) : undefined;
          next[key] = snap && snap.par > 0 ? { ...EMPTY, par: String(snap.par), urgent: !!snap.urgent } : { ...EMPTY };
        }
        setPrepData(next);
        setError(null);
        setSheetError("");
        setSavedAt(null);
      } catch {
        if (!cancelled) setSheetError("This day’s saved prep sheet couldn’t be loaded. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [date, sheetRevision]);

  const updateEntry = (key: string, field: keyof PrepEntry, value: string | boolean) => {
    setSavedAt(null);
    setPrepData((prev) => {
      const current = prev[key] || { ...EMPTY };
      const updated: PrepEntry = {
        ...current,
        [field]: typeof value === "boolean" ? value : value,
      };

      // Auto-calculate Make = Par - OH (only when both are numbers)
      if (field === "par" || field === "oh") {
        updated.make = makeOf(updated.par, updated.oh);
      }

      return { ...prev, [key]: updated };
    });
  };

  // Replace this count_date wholesale (location-scoped, same as the order
  // sheet): rows with a value — a prefilled PAR counts, a blank row doesn't.
  const savePrepList = async () => {
    if (readOnly || saving || loading || sheetError) return;
    setSaving(true);
    setError(null);
    const rows = Object.entries(prepData)
      .filter(
        ([, e]) =>
          e.par !== "" ||
          e.oh !== "" ||
          e.pull !== "" ||
          e.urgent,
      )
      .map(([key, e]) => ({
        restaurant_name: BTB_RESTAURANT,
        item_name: key,
        par: Number(e.par) || 0,
        on_hand: Number(e.oh) || 0,
        pull: Number(e.pull) || 0,
        urgent: e.urgent,
        count_date: date,
        location_id: activeLocationId(),
      }));

    const scope = locationScope();
    let del = supabase.from("prep_counts").delete().eq("restaurant_name", BTB_RESTAURANT).eq("count_date", date);
    if (scope) del = del.or(scope);
    const { error: delErr } = await del;
    let insErr = delErr;
    if (!delErr && rows.length) {
      insErr = (await supabase.from("prep_counts").insert(rows)).error;
    }
    const fail = delErr ?? insErr;
    if (fail) {
      // Offline (or any non-schema failure): park the save in IndexedDB and
      // replay it on the next load / 'online' event. A missing table or
      // column is a migration the owner runs by hand — queueing won't fix it.
      if (shouldQueue(fail.message)) {
        await enqueue(
          queue,
          newOp("prep_save", `Prep sheet · ${date}`, {
            date,
            scope,
            rows,
          } satisfies PrepSavePayload),
        );
        await refreshPending();
        setSavedAt(null);
        setSaving(false);
        return;
      }
      setError(
        "Couldn't save — run supabase/schema-locations.sql and supabase/schema-prep-sheet.sql (adds the Pull column), then retry.",
      );
      setSaving(false);
      return;
    }

    setHistoryRevision((value) => value + 1);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setSaving(false);
  };

  const loadPrepList = (list: SavedPrepList) => {
    setLoading(true);
    setDate(list.date);
    setSheetRevision((value) => value + 1);
    setDay(list.day);
    setPrepData(list.data);
    setSavedAt(null);
    setActiveTab("today");
  };

  // A row counts once it can produce an answer: Make for the Par columns
  // (both ends present), an OH or a Pull for the freezer column.
  const filledItems = prepCatalog.filter((key) => {
    const e = prepData[key];
    if (!e) return false;
    return PAR_KEY_SET.has(key) ? e.make !== "" : e.oh !== "" || e.pull !== "";
  }).length;

  const tabClass = (tab: typeof activeTab) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
      activeTab === tab ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">BTB</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Daily Prep Sheet</h1>
              <p className="text-xs text-gray-500">
                Between the Buns — MAKE = PAR − On Hand · PAR is set by a manager
              </p>
            </div>
            {savedAt && (
              <span className="ml-auto text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
                Saved {savedAt}
              </span>
            )}
            {!savedAt && offlinePending > 0 && (
              <span className="ml-auto text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                Saved on this device · syncing later
              </span>
            )}
          </div>

          {/* Date & Day — top centre, as on the printed sheet */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="prep-date" className="text-sm font-medium text-gray-700">
                Date:
              </label>
              <input
                id="prep-date"
                type="date"
                value={date}
                disabled={saving}
                onChange={(e) => handleDateChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Day:</label>
              <span className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-900 min-w-[7rem] text-center">
                {day}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex justify-center gap-2 print:hidden">
            <button onClick={() => setActiveTab("today")} className={tabClass("today")}>
              Today&apos;s Prep
            </button>
            <button onClick={() => setActiveTab("history")} className={tabClass("history")}>
              History ({savedLists.length}/7)
            </button>
            <PrintButton />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {sheetError && <div className="ui-notice ui-notice--error"><p role="alert">{sheetError}</p><button className="ui-button ui-button--ghost" disabled={loading} onClick={() => { setLoading(true); setSheetRevision((value) => value + 1); }}>Retry saved sheet</button></div>}

        {offlinePending > 0 && (
          <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            {offlinePending} save{offlinePending === 1 ? "" : "s"} stored on this device — they&apos;ll sync to
            the database the next time the connection comes back.
          </div>
        )}

        {pullMissing && !error && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            The Pull column isn&apos;t in the database yet — run{" "}
            <code className="font-mono">supabase/schema-prep-sheet.sql</code> in the Supabase SQL
            editor. Pull values can&apos;t load or save until then.
          </div>
        )}

        {activeTab === "today" ? (
          <>
            <div className="mb-4 text-right text-sm text-gray-600">
              {loading ? "Loading…" : `${filledItems} of ${prepCatalog.length} items filled`}
            </div>

            {/* Left / Middle / Right — the printed sheet's three columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {prepColumns.map((column) => (
                <SheetColumn
                  key={column.label}
                  column={column}
                  prepData={prepData}
                  readOnly={readOnly || loading || saving || !!sheetError}
                  canEditPar={canEditPar}
                  updateEntry={updateEntry}
                />
              ))}
            </div>

            {/* Save Button */}
            {!readOnly && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={savePrepList}
                  disabled={saving || loading || !!sheetError}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Prep Sheet"}
                </button>
                <button
                  disabled={saving || loading || !!sheetError}
                  onClick={() => {
                    setPrepData({});
                    setSavedAt(null);
                  }}
                  className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Clear All
                </button>
              </div>
            )}
          </>
        ) : (
          /* History Tab */
          <div className="space-y-4">
            <div className="ops-toolbar"><p className="ops-meta">Your seven most recent saved sheets, including older catalog items.</p><button className="ui-button ui-button--ghost" disabled={historyLoaded !== historyRevision} onClick={() => setHistoryRevision((value) => value + 1)}>Refresh saved sheets</button></div>
            {historyLoaded !== historyRevision ? <p role="status">Loading saved prep sheets…</p> : historyError ? <p className="ui-notice ui-notice--error" role="alert">{historyError}</p> : savedLists.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p className="text-gray-500">No saved prep sheets yet</p>
                <p className="text-gray-400 text-sm mt-1">
                  Fill out today&apos;s prep sheet and save it
                </p>
              </div>
            ) : (
              savedLists.map((list) => (
                <article
                  key={list.id}
                  aria-label={`Prep sheet ${list.date}`}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="font-semibold text-gray-900">
                        {list.day},{" "}
                        {new Date(list.date + "T12:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </h2>
                      <p className="text-xs text-gray-500">
                        Saved {new Date(list.savedAt).toLocaleTimeString("en-CA", { timeZone: "America/Regina", hour: "2-digit", minute: "2-digit" })} · Saskatchewan time
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadPrepList(list)}
                        disabled={saving}
                        className="ui-button ui-button--ghost"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    {Object.keys(list.data).length} saved items
                  </div>
                  <details className="mt-3"><summary className="ops-text-link cursor-pointer">View saved quantities</summary><div className="ops-table-wrap"><table className="ops-table"><caption>Saved quantities for {list.date}</caption><thead><tr><th scope="col">Item</th><th scope="col">Par</th><th scope="col">On hand</th><th scope="col">Make</th><th scope="col">Pull</th></tr></thead><tbody>{Object.entries(list.data).map(([name, entry]) => <tr key={name}><th scope="row">{name}{entry.urgent ? " · Urgent" : ""}</th><td>{entry.par}</td><td>{entry.oh}</td><td>{entry.make}</td><td>{entry.pull || "—"}</td></tr>)}</tbody></table></div></details>
                </article>
              ))
            )}
          </div>
        )}
      </div>

      {/* Print sheet — the full prep list unfiltered, values as text, laid out
          like the paper form: the three columns side-by-side with tight rows so
          everything lands on a single printed page. */}
      <div id="print-section" className="hidden print:block max-w-[46rem] mx-auto px-2 py-1 text-gray-900">
        <div className="flex items-baseline justify-between gap-2 border-b border-gray-400 pb-1 mb-1.5">
          <h1 className="text-sm font-bold">Daily Prep Sheet — {day}, {date}</h1>
          <p className="text-[8px] text-gray-500 whitespace-nowrap">Between the Buns · MAKE = PAR − On Hand · 🔥 = urgent</p>
        </div>
        <div className="grid grid-cols-3 gap-2 items-start">
          {prepColumns.map((column) => (
            <div key={column.label} className="break-inside-avoid">
              <h2 className="font-bold text-[9px] uppercase tracking-wide border-b border-gray-400 pb-0.5 mb-0.5">{column.label}</h2>
              {column.sections.map((section) => (
                <div key={section.title} className="mb-1 break-inside-avoid">
                  <h3 className="text-[8px] font-bold uppercase tracking-wide text-gray-600">{section.title}</h3>
                  <table className="w-full text-[9px] leading-tight border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 text-gray-500">
                        <th className="text-left py-0.5">Item</th>
                        <th className="text-right">Par</th>
                        <th className="text-right">OH</th>
                        <th className="text-right">Make</th>
                        <th className="text-right">Init</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item) => {
                        const e = prepData[itemKey(item)];
                        return (
                          <tr key={itemKey(item)} className="border-b border-gray-100">
                            <td className="py-0.5 whitespace-nowrap max-w-[8rem] overflow-hidden text-ellipsis">
                              {item.name}
                              {item.unit ? <span className="text-gray-400"> {item.unit}</span> : null}
                              {e?.urgent ? " 🔥" : ""}
                              {e?.pull ? <span className="text-gray-500"> ·pull {e.pull}</span> : null}
                            </td>
                            <td className="text-right">{e?.par ?? ""}</td>
                            <td className="text-right">{e?.oh ?? ""}</td>
                            <td className="text-right font-bold">{e?.make ?? ""}</td>
                            <td className="text-right">{e?.initial ?? ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- the three sheet columns ----------------------------------------------
// Left/middle columns print Item · Unit · Par · OH · Make · Initial.
// The right column (Freezer pull & Dairy) prints Item · OH · Pull · Initial —
// no Unit, Par or Make — so Dairy's unit rides inside the item cell.
function SheetColumn({
  column,
  prepData,
  readOnly,
  canEditPar,
  updateEntry,
}: {
  column: PrepColumnModel;
  prepData: PrepData;
  readOnly: boolean;
  canEditPar: boolean;
  updateEntry: (key: string, field: keyof PrepEntry, value: string | boolean) => void;
}) {
  const pullMode = column.mode === "pull";
  const rowClass = pullMode
    ? "grid grid-cols-[1fr_30px_42px_42px_34px] gap-1"
    : "grid grid-cols-[1fr_30px_44px_36px_32px_36px_34px] gap-1";
  const cellClass =
    "w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 text-center focus:ring-1 focus:ring-red-500";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h2 className="font-bold text-gray-900 text-sm">{column.label}</h2>
      </div>

      {column.sections.map((section) => (
        <div key={section.title}>
          <div className="px-4 py-1.5 bg-red-50 border-b border-gray-100">
            <h3 className="text-xs font-bold text-red-700 uppercase tracking-wide">
              {section.title}
            </h3>
          </div>

          <div
            className={`${rowClass} px-3 py-1 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase`}
          >
            <span>Item</span>
            <span title="Urgent — flag for the manager">Urg</span>
            {!pullMode && <span>Unit</span>}
            {!pullMode && <span title="Par level">Par</span>}
            <span title="On hand">OH</span>
            {!pullMode && <span>Make</span>}
            {pullMode && <span title="Pull from freezer">Pull</span>}
            <span>Init</span>
          </div>

          {section.items.map((item, itemIdx) => (
            <Row
              key={itemKey(item)}
              item={item}
              index={itemIdx}
              pullMode={pullMode}
              rowClass={rowClass}
              cellClass={cellClass}
              prepData={prepData}
              readOnly={readOnly}
              canEditPar={canEditPar}
              updateEntry={updateEntry}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Row({
  item,
  index,
  pullMode,
  rowClass,
  cellClass,
  prepData,
  readOnly,
  canEditPar,
  updateEntry,
}: {
  item: PrepItem;
  index: number;
  pullMode: boolean;
  rowClass: string;
  cellClass: string;
  prepData: PrepData;
  readOnly: boolean;
  canEditPar: boolean;
  updateEntry: (key: string, field: keyof PrepEntry, value: string | boolean) => void;
}) {
  const key = itemKey(item);
  const e = prepData[key] || { ...EMPTY };

  return (
    <div
      className={`${rowClass} px-3 py-1.5 items-center ${
        index % 2 === 0 ? "bg-white" : "bg-gray-50"
      } border-b border-gray-50`}
    >
      <span className="flex items-center gap-1 min-w-0">
        <span
          className={`text-xs font-medium min-w-0 truncate ${
            e.urgent ? "text-red-700 font-semibold" : "text-gray-900"
          }`}
          title={item.name}
        >
          {item.name}
          {pullMode && item.unit && (
            <span className="ml-1 text-[10px] font-normal text-gray-400">{item.unit}</span>
          )}
        </span>
      </span>
      <input
        type="checkbox"
        aria-label={`Urgent: ${item.name}`}
        title="Urgent"
        checked={e.urgent}
        disabled={readOnly}
        onChange={(ev) => updateEntry(key, "urgent", ev.target.checked)}
        className="w-3.5 h-3.5 place-self-center accent-red-600 cursor-pointer disabled:cursor-not-allowed"
      />

      {!pullMode && (
        <span className="text-[10px] text-gray-500 truncate">{item.unit}</span>
      )}

      {!pullMode && (
        <input
          type="text"
          inputMode="numeric"
          value={e.par}
          aria-label={`Par: ${key}`}
          onChange={(ev) => updateEntry(key, "par", ev.target.value)}
          readOnly={!canEditPar || readOnly}
          title={canEditPar ? undefined : "PAR is set by a manager"}
          className={`${cellClass} ${canEditPar && !readOnly ? "bg-white" : "bg-gray-50"}`}
        />
      )}

      <input
        type="text"
        inputMode="numeric"
        value={e.oh}
        aria-label={`On hand: ${key}`}
        onChange={(ev) => updateEntry(key, "oh", ev.target.value)}
        readOnly={readOnly}
        className={`${cellClass} ${readOnly ? "bg-gray-50" : "bg-white"}`}
      />

      {pullMode ? (
        <input
          type="text"
          inputMode="numeric"
          value={e.pull}
          aria-label={`Pull: ${key}`}
          onChange={(ev) => updateEntry(key, "pull", ev.target.value)}
          readOnly={readOnly}
          title="Pull from the freezer"
          className={`${cellClass} ${readOnly ? "bg-gray-50" : "bg-white"}`}
        />
      ) : (
        <input
          type="text"
          value={e.make}
          aria-label={`Make: ${key}`}
          readOnly
          className={`${cellClass} bg-gray-50 font-bold`}
          title="Auto-calculated: Par - OH"
        />
      )}

      <input
        type="text"
        value={e.initial}
        aria-label={`Initial: ${key}`}
        onChange={(ev) => updateEntry(key, "initial", ev.target.value)}
        readOnly={readOnly}
        className={`${cellClass} ${readOnly ? "bg-gray-50" : "bg-white"}`}
      />
    </div>
  );
}
