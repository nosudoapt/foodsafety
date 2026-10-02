"use client";

import { useEffect, useState } from "react";
import { prepGroups } from "@/lib/btb-prep-list";
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

const EMPTY: PrepEntry = { par: "", oh: "", make: "", initial: "", urgent: false };

// Flat catalog so load / save / prefill iterate exactly the items the grid
// renders, in the same order.
const CATALOG: string[] = prepGroups.flatMap((g) =>
  g.sections.flatMap((s) => s.items.map((i) => i.name)),
);

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

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setLoading(true);
    const d = new Date(newDate + "T12:00:00");
    setDay(d.toLocaleDateString("en-US", { weekday: "long" }));
  };

  // The sheet for this count_date (plus legacy rows with no location), and the
  // history that seeds PAR for anything not saved yet — same-weekday first,
  // most recent otherwise (see src/lib/par-prefill.ts).
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
      let histQ = supabase
        .from("prep_counts")
        .select("item_name, par, urgent, count_date, created_at")
        .neq("count_date", date)
        .order("count_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (scope) histQ = histQ.or(scope);

      const [{ data: sheet, error: sheetErr }, { data: hist }] = await Promise.all([sheetQ, histQ]);
      if (cancelled) return;
      if (sheetErr) {
        setError("Couldn't load this day's prep sheet — run supabase/schema-locations.sql, then reload.");
        setLoading(false);
        return;
      }

      const saved = new Map(
        ((sheet ?? []) as { item_name: string; par: number; on_hand: number; urgent?: boolean | null }[]).map(
          (r) => [r.item_name, r] as const,
        ),
      );
      const histRows = ((hist ?? []) as { item_name: string; par: number; urgent?: boolean | null; count_date: string }[]).map(
        (r) => ({ item_name: r.item_name, par: r.par, urgent: r.urgent, date: r.count_date }),
      );
      const maps = buildParMaps(histRows, date);

      const next: PrepData = {};
      for (const name of CATALOG) {
        const row = saved.get(name);
        if (row) {
          const par = String(Number(row.par) || 0);
          const oh = String(Number(row.on_hand) || 0);
          next[name] = { par, oh, make: makeOf(par, oh), initial: "", urgent: !!row.urgent };
          continue;
        }
        // Nothing saved for this date yet — seed PAR so a manager doesn't
        // retype it every day. On Hand stays blank: staff still counts it.
        const snap = parFor(maps, name);
        next[name] = snap && snap.par > 0
          ? { ...EMPTY, par: String(snap.par) }
          : { ...EMPTY };
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

  const updateEntry = (itemName: string, field: keyof PrepEntry, value: string | boolean) => {
    setSavedAt(null);
    setPrepData((prev) => {
      const current = prev[itemName] || { ...EMPTY };
      const updated: PrepEntry = {
        ...current,
        [field]: typeof value === "boolean" ? value : value,
      };

      // Auto-calculate Make = Par - OH (only when both are numbers)
      if (field === "par" || field === "oh") {
        updated.make = makeOf(updated.par, updated.oh);
      }

      return { ...prev, [itemName]: updated };
    });
  };

  // Replace this count_date wholesale (location-scoped, same as the order
  // sheet): rows with a value — a prefilled PAR counts, a blank row doesn't.
  const savePrepList = async () => {
    if (readOnly || saving) return;
    setSaving(true);
    setError(null);
    const rows = Object.entries(prepData)
      .filter(([, e]) => (Number(e.par) || 0) > 0 || (Number(e.oh) || 0) > 0 || e.urgent)
      .map(([name, e]) => ({
        item_name: name,
        par: Number(e.par) || 0,
        on_hand: Number(e.oh) || 0,
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
        setError("Couldn't save — run supabase/schema-locations.sql if you haven't, then retry.");
        setSaving(false);
        return;
      }
    } else if (delErr) {
      setError("Couldn't save — run supabase/schema-locations.sql if you haven't, then retry.");
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

  const getTotalItems = () => {
    let total = 0;
    prepGroups.forEach((group) =>
      group.sections.forEach((section) => {
        total += section.items.length;
      }),
    );
    return total;
  };

  const getFilledCount = () => {
    let filled = 0;
    prepGroups.forEach((group) =>
      group.sections.forEach((section) => {
        section.items.forEach((item) => {
          if (prepData[item.name]?.make) filled++;
        });
      }),
    );
    return filled;
  };

  const tabClass = (tab: typeof activeTab) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
      activeTab === tab ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
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

          {/* Tabs */}
          <div className="flex gap-2">
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

        {activeTab === "today" ? (
          <>
            {/* Date & Day + Stats */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Date:</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Day:</label>
                <span className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-900">
                  {day}
                </span>
              </div>
              <div className="ml-auto text-sm text-gray-600">
                {loading ? "Loading…" : `${getFilledCount()} of ${getTotalItems()} items filled`}
              </div>
            </div>

            {/* Three Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {prepGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <h2 className="font-bold text-gray-900 text-sm">{group.label}</h2>
                  </div>

                  {group.sections.map((section, sectionIdx) => (
                    <div key={sectionIdx}>
                      {/* Section Header */}
                      <div className="px-4 py-1.5 bg-red-50 border-b border-gray-100">
                        <h3 className="text-xs font-bold text-red-700 uppercase tracking-wide">
                          {section.title}
                        </h3>
                      </div>

                      {/* Column Headers */}
                      <div className="grid grid-cols-[1fr_44px_36px_34px_36px_28px_34px] gap-1 px-3 py-1 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                        <span>Item</span>
                        <span>Unit</span>
                        <span title="Par level">Par</span>
                        <span title="On hand">OH</span>
                        <span>Make</span>
                        <span title="Urgent">Urg</span>
                        <span>Init</span>
                      </div>

                      {/* Items */}
                      {section.items.map((item, itemIdx) => {
                        const e = prepData[item.name] || EMPTY;
                        return (
                          <div
                            key={itemIdx}
                            className={`grid grid-cols-[1fr_44px_36px_34px_36px_28px_34px] gap-1 px-3 py-1.5 items-center ${
                              itemIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                            } border-b border-gray-50`}
                          >
                            <span className="text-xs font-medium text-gray-900 truncate">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-gray-500 truncate">{item.unit}</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={e.par}
                              onChange={(ev) => updateEntry(item.name, "par", ev.target.value)}
                              readOnly={!canEditPar}
                              title={canEditPar ? undefined : "PAR is set by a manager"}
                              className={`w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 text-center focus:ring-1 focus:ring-red-500 ${
                                canEditPar && !readOnly ? "bg-white" : "bg-gray-50"
                              }`}
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={e.oh}
                              onChange={(ev) => updateEntry(item.name, "oh", ev.target.value)}
                              readOnly={readOnly}
                              className={`w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 text-center focus:ring-1 focus:ring-red-500 ${readOnly ? "bg-gray-50" : "bg-white"}`}
                            />
                            <input
                              type="text"
                              value={e.make}
                              readOnly
                              className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-gray-50 text-center font-bold"
                              title="Auto-calculated: Par - OH"
                            />
                            {readOnly ? (
                              e.urgent ? (
                                <span className="flex justify-center" title="Urgent">
                                  <span aria-label="Urgent">🔥</span>
                                </span>
                              ) : (
                                <span className="text-center text-gray-300">—</span>
                              )
                            ) : (
                              <input
                                type="checkbox"
                                aria-label={`Urgent: ${item.name}`}
                                checked={e.urgent}
                                onChange={(ev) => updateEntry(item.name, "urgent", ev.target.checked)}
                                className="w-4 h-4 accent-red-600 justify-self-center"
                              />
                            )}
                            <input
                              type="text"
                              value={e.initial}
                              onChange={(ev) => updateEntry(item.name, "initial", ev.target.value)}
                              readOnly={readOnly}
                              className={`w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 text-center focus:ring-1 focus:ring-red-500 ${readOnly ? "bg-gray-50" : "bg-white"}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
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
                        {list.day}, {new Date(list.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
                    {Object.values(list.data).filter((d) => d.make).length} items filled
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
