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
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import { buildParMaps, parFor } from "@/lib/par-prefill";
import {
  checklistProgress,
  defaultClosingItems,
  defaultOpeningItems,
  type ChecklistItem,
} from "@/lib/btb-checklists";

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
}

type CheckType = "opening" | "closing";

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

// --- checklist persistence ------------------------------------------------
// Kept on the tablet (localStorage) rather than daily_checks: the BTB surface
// has no Supabase session, so an insert would fail on the device that needs it.
const checklistKey = (date: string, type: CheckType) => `foodsafety.prep_checklist.${date}.${type}`;

function readChecklist(date: string, type: CheckType): ChecklistItem[] {
  const fallback = type === "opening" ? defaultOpeningItems : defaultClosingItems;
  try {
    const raw = localStorage.getItem(checklistKey(date, type));
    const parsed = raw ? (JSON.parse(raw) as ChecklistItem[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeChecklist(date: string, type: CheckType, items: ChecklistItem[]): void {
  try {
    localStorage.setItem(checklistKey(date, type), JSON.stringify(items));
  } catch {
    // Private browsing / storage disabled — the ticks just won't survive a reload.
  }
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
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [day, setDay] = useState(() =>
    new Date().toLocaleDateString("en-US", { weekday: "long" })
  );
  const [prepData, setPrepData] = useState<PrepData>({});
  const [savedLists, setSavedLists] = useState<SavedPrepList[]>([]);
  const [activeTab, setActiveTab] = useState<"today" | "checklist" | "history">("today");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pullMissing, setPullMissing] = useState(false);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setLoading(true);
    const d = new Date(newDate + "T12:00:00");
    setDay(d.toLocaleDateString("en-US", { weekday: "long" }));
  };

  // The sheet for this count_date (plus legacy rows with no location), the Pull
  // column, and the history that seeds PAR for anything not saved yet —
  // same-weekday first, most recent otherwise (see src/lib/par-prefill.ts).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scope = locationScope();
      let sheetQ = supabase
        .from("prep_counts")
        .select("id, item_name, par, on_hand, urgent")
        .eq("count_date", date)
        .order("created_at");
      if (scope) sheetQ = sheetQ.or(scope);
      // Pull lives in its own column (supabase/schema-prep-sheet.sql). Fetched
      // separately so a tablet one migration behind still reads the rest.
      let pullQ = supabase
        .from("prep_counts")
        .select("item_name, pull")
        .eq("count_date", date);
      if (scope) pullQ = pullQ.or(scope);
      let histQ = supabase
        .from("prep_counts")
        .select("item_name, par, urgent, count_date, created_at")
        .neq("count_date", date)
        .order("count_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (scope) histQ = histQ.or(scope);

      const [
        { data: sheet, error: sheetErr },
        { data: pullRows, error: pullErr },
        { data: hist },
      ] = await Promise.all([sheetQ, pullQ, histQ]);
      if (cancelled) return;
      if (sheetErr) {
        setError("Couldn't load this day's prep sheet — run supabase/schema-locations.sql, then reload.");
        setLoading(false);
        return;
      }
      setPullMissing(!!pullErr);

      const saved = new Map(
        ((sheet ?? []) as { item_name: string; par: number; on_hand: number; urgent?: boolean | null }[]).map(
          (r) => [r.item_name, r] as const,
        ),
      );
      const pulls = new Map(
        ((pullErr ? [] : pullRows ?? []) as { item_name: string; pull: number }[]).map(
          (r) => [r.item_name, r.pull] as const,
        ),
      );
      const histRows = ((hist ?? []) as { item_name: string; par: number; urgent?: boolean | null; count_date: string }[]).map(
        (r) => ({ item_name: r.item_name, par: r.par, urgent: r.urgent, date: r.count_date }),
      );
      const maps = buildParMaps(histRows, date);

      const next: PrepData = {};
      for (const key of prepCatalog) {
        const row = saved.get(key);
        if (row) {
          const par = String(Number(row.par) || 0);
          const oh = String(Number(row.on_hand) || 0);
          const pull = pulls.has(key) ? String(Number(pulls.get(key)) || 0) : "";
          next[key] = { par, oh, make: makeOf(par, oh), initial: "", pull, urgent: !!row.urgent };
          continue;
        }
        // Nothing saved for this date yet — seed PAR so a manager doesn't
        // retype it every day. On Hand stays blank: staff still counts it.
        const snap = PAR_KEY_SET.has(key) ? parFor(maps, key) : undefined;
        next[key] = snap && snap.par > 0 ? { ...EMPTY, par: String(snap.par) } : { ...EMPTY };
      }
      setPrepData(next);
      setError(null);
      setSavedAt(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

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
    if (readOnly || saving) return;
    setSaving(true);
    setError(null);
    const rows = Object.entries(prepData)
      .filter(
        ([, e]) =>
          (Number(e.par) || 0) > 0 ||
          (Number(e.oh) || 0) > 0 ||
          (Number(e.pull) || 0) > 0 ||
          e.urgent,
      )
      .map(([key, e]) => ({
        item_name: key,
        par: Number(e.par) || 0,
        on_hand: Number(e.oh) || 0,
        pull: Number(e.pull) || 0,
        urgent: e.urgent,
        count_date: date,
        location_id: activeLocationId(),
      }));

    const scope = locationScope();
    let del = supabase.from("prep_counts").delete().eq("count_date", date);
    if (scope) del = del.or(scope);
    const { error: delErr } = await del;
    if (!delErr && rows.length) {
      const { error: insErr } = await supabase.from("prep_counts").insert(rows);
      if (insErr) {
        setError(
          "Couldn't save — run supabase/schema-locations.sql and supabase/schema-prep-sheet.sql (adds the Pull column), then retry.",
        );
        setSaving(false);
        return;
      }
    } else if (delErr) {
      setError(
        "Couldn't save — run supabase/schema-locations.sql and supabase/schema-prep-sheet.sql (adds the Pull column), then retry.",
      );
      setSaving(false);
      return;
    }

    setSavedLists((prev) =>
      [
        {
          id: Date.now().toString(),
          date,
          day,
          data: { ...prepData },
          savedAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 7),
    );
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setSaving(false);
  };

  const loadPrepList = (list: SavedPrepList) => {
    setDate(list.date);
    setLoading(true);
    setDay(list.day);
    setPrepData(list.data);
    setActiveTab("today");
  };

  const deletePrepList = (id: string) => {
    if (!confirm("Delete this prep list?")) return;
    setSavedLists((prev) => prev.filter((l) => l.id !== id));
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
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => setActiveTab("today")} className={tabClass("today")}>
              Today&apos;s Prep
            </button>
            <button onClick={() => setActiveTab("checklist")} className={tabClass("checklist")}>
              Opening / Closing
            </button>
            <button onClick={() => setActiveTab("history")} className={tabClass("history")}>
              History ({savedLists.length}/7)
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            {error}
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
                  readOnly={readOnly}
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
                  disabled={saving || loading}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Prep Sheet"}
                </button>
                <button
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
        ) : activeTab === "checklist" ? (
          /* Opening / Closing */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChecklistCard
              title="Opening Checklist"
              icon="☀️"
              date={date}
              type="opening"
              readOnly={readOnly}
            />
            <ChecklistCard
              title="Closing Checklist"
              icon="🌙"
              date={date}
              type="closing"
              readOnly={readOnly}
            />
          </div>
        ) : (
          /* History Tab */
          <div className="space-y-4">
            {savedLists.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p className="text-gray-500">No saved prep sheets yet</p>
                <p className="text-gray-400 text-sm mt-1">
                  Fill out today&apos;s prep sheet and save it
                </p>
              </div>
            ) : (
              savedLists.map((list) => (
                <div
                  key={list.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {list.day},{" "}
                        {new Date(list.date + "T12:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </h3>
                      <p className="text-xs text-gray-500">
                        Saved {new Date(list.savedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadPrepList(list)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Load
                      </button>
                      {!readOnly && (
                        <button
                          onClick={() => deletePrepList(list.id)}
                          className="text-sm text-gray-400 hover:text-red-500"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    {Object.values(list.data).filter((d) => d.make || d.pull).length} items filled
                  </div>
                </div>
              ))
            )}
          </div>
        )}
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
    ? "grid grid-cols-[1fr_42px_42px_34px] gap-1"
    : "grid grid-cols-[1fr_44px_36px_32px_36px_34px] gap-1";
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
        <input
          type="checkbox"
          aria-label={`Urgent: ${item.name}`}
          title="Urgent"
          checked={e.urgent}
          disabled={readOnly}
          onChange={(ev) => updateEntry(key, "urgent", ev.target.checked)}
          className="w-3.5 h-3.5 shrink-0 accent-red-600 cursor-pointer disabled:cursor-not-allowed"
        />
      </span>

      {!pullMode && (
        <span className="text-[10px] text-gray-500 truncate">{item.unit}</span>
      )}

      {!pullMode && (
        <input
          type="text"
          inputMode="numeric"
          value={e.par}
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
        onChange={(ev) => updateEntry(key, "oh", ev.target.value)}
        readOnly={readOnly}
        className={`${cellClass} ${readOnly ? "bg-gray-50" : "bg-white"}`}
      />

      {pullMode ? (
        <input
          type="text"
          inputMode="numeric"
          value={e.pull}
          onChange={(ev) => updateEntry(key, "pull", ev.target.value)}
          readOnly={readOnly}
          title="Pull from the freezer"
          className={`${cellClass} ${readOnly ? "bg-gray-50" : "bg-white"}`}
        />
      ) : (
        <input
          type="text"
          value={e.make}
          readOnly
          className={`${cellClass} bg-gray-50 font-bold`}
          title="Auto-calculated: Par - OH"
        />
      )}

      <input
        type="text"
        value={e.initial}
        onChange={(ev) => updateEntry(key, "initial", ev.target.value)}
        readOnly={readOnly}
        className={`${cellClass} ${readOnly ? "bg-gray-50" : "bg-white"}`}
      />
    </div>
  );
}

// --- Opening / Closing ----------------------------------------------------
// Same duties as the Daily Kitchen Checks page (src/lib/btb-checklists.ts),
// but living inside the prep sheet so a shift can tick them off in one place.
function ChecklistCard({
  title,
  icon,
  date,
  type,
  readOnly,
}: {
  title: string;
  icon: string;
  date: string;
  type: CheckType;
  readOnly: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(() =>
    type === "opening" ? defaultOpeningItems : defaultClosingItems,
  );

  // localStorage is browser-only: read it just after mount (the dashboard's
  // active-location read does the same) so SSR and the first client render match.
  useEffect(() => {
    const t = setTimeout(() => setItems(readChecklist(date, type)), 0);
    return () => clearTimeout(t);
  }, [date, type]);

  const toggle = (id: string) => {
    const next = items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i));
    setItems(next);
    writeChecklist(date, type, next);
  };

  const reset = () => {
    const next = (type === "opening" ? defaultOpeningItems : defaultClosingItems).map((i) => ({
      ...i,
    }));
    setItems(next);
    writeChecklist(date, type, next);
  };

  const { done, total } = checklistProgress(items);
  const sections = ["Front", "Kitchen"];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span aria-hidden>{icon}</span>
        <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
        <span className="ml-auto text-xs font-semibold text-gray-500">
          {done}/{total} done
        </span>
        {!readOnly && (
          <button
            onClick={reset}
            className="text-xs text-gray-400 hover:text-red-600 font-medium"
          >
            Reset
          </button>
        )}
      </div>

      {sections.map((section) => {
        const list = items.filter((i) => i.section === section);
        if (list.length === 0) return null;
        return (
          <div key={section}>
            <div className="px-4 py-1.5 bg-red-50 border-b border-gray-100">
              <h3 className="text-xs font-bold text-red-700 uppercase tracking-wide">
                {section} Area
              </h3>
            </div>
            {list.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-3 px-4 py-2 border-b border-gray-50 ${
                  readOnly ? "" : "cursor-pointer hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={readOnly}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 w-4 h-4 accent-red-600 shrink-0 disabled:cursor-not-allowed"
                />
                <span
                  className={`text-xs leading-relaxed ${
                    item.completed ? "text-gray-400 line-through" : "text-gray-700"
                  }`}
                >
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
