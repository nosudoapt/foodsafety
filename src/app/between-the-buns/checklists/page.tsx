"use client";

// Opening & Closing — its own box on the hub (was the middle tab of the Daily
// Prep Sheet). Duties are shared with the Daily Kitchen Checks page via
// src/lib/btb-checklists.ts. Ticks save to Supabase (btb_checklists, per date +
// type + location) so every tablet sees the same sheet plus a real History tab;
// the same ticks are mirrored to localStorage (keyed by date) so existing
// device ticks carry over and offline ticks survive a reload.
import { useEffect, useState } from "react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import {
  checklistProgress,
  defaultClosingItems,
  defaultOpeningItems,
  type ChecklistItem,
} from "@/lib/btb-checklists";

type CheckType = "opening" | "closing";

// Same key the prep sheet's old Checklist tab wrote — existing ticks carry over.
const checklistKey = (date: string, type: CheckType) => `foodsafety.prep_checklist.${date}.${type}`;

function readLocal(date: string, type: CheckType): ChecklistItem[] | null {
  try {
    const raw = localStorage.getItem(checklistKey(date, type));
    const parsed = raw ? (JSON.parse(raw) as ChecklistItem[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocal(date: string, type: CheckType, items: ChecklistItem[]): void {
  try {
    localStorage.setItem(checklistKey(date, type), JSON.stringify(items));
  } catch {
    // Private browsing / storage disabled — the ticks just won't survive a reload.
  }
}

interface HistoryRow {
  id: string;
  check_date: string;
  check_type: CheckType;
  items: ChecklistItem[];
  done_count: number;
  total_count: number;
  completed: boolean;
  updated_at: string;
}

export default function ChecklistsPage() {
  return (
    <BtbFeatureGate feature="checklists">
      {(readOnly) => <Checklists readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function Checklists({ readOnly }: { readOnly: boolean }) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [day, setDay] = useState(() =>
    new Date().toLocaleDateString("en-US", { weekday: "long" }),
  );
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [opening, setOpening] = useState<ChecklistItem[]>(defaultOpeningItems);
  const [closing, setClosing] = useState<ChecklistItem[]>(defaultClosingItems);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setSavedAt(null);
    setDay(new Date(newDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }));
  };

  // Load this date from Supabase; fall back to the on-device ticks when there
  // is no saved row yet (or when the migration hasn't been run).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const scope = locationScope();
      let q = supabase
        .from("btb_checklists")
        .select("id, check_date, check_type, items, done_count, total_count, completed, updated_at")
        .eq("check_date", date);
      if (scope) q = q.or(scope);
      const { data, error: qErr } = await q;
      if (cancelled) return;
      if (qErr) {
        // Table missing (migration not run) or offline — device ticks only.
        const lo = readLocal(date, "opening");
        const lc = readLocal(date, "closing");
        setOpening(lo ?? defaultOpeningItems.map((i) => ({ ...i })));
        setClosing(lc ?? defaultClosingItems.map((i) => ({ ...i })));
        setError(
          qErr.message.includes("btb_checklists")
            ? "History needs supabase/schema-checklists.sql run once — ticks still save on this device."
            : "Couldn't load saved ticks — showing this device's copy.",
        );
        setLoading(false);
        return;
      }
      const byType = new Map((data ?? []).map((r) => [r.check_type as CheckType, r]));
      // Read device copy after mount so SSR and first render match.
      const lo = readLocal(date, "opening");
      const lc = readLocal(date, "closing");
      const ro = byType.get("opening");
      const rc = byType.get("closing");
      setOpening(
        ro && Array.isArray(ro.items) && ro.items.length
          ? (ro.items as ChecklistItem[])
          : (lo ?? defaultOpeningItems.map((i) => ({ ...i }))),
      );
      setClosing(
        rc && Array.isArray(rc.items) && rc.items.length
          ? (rc.items as ChecklistItem[])
          : (lc ?? defaultClosingItems.map((i) => ({ ...i }))),
      );
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // History list — every saved date/type, newest first.
  useEffect(() => {
    if (activeTab !== "history") return;
    let cancelled = false;
    (async () => {
      const scope = locationScope();
      let q = supabase
        .from("btb_checklists")
        .select("id, check_date, check_type, items, done_count, total_count, completed, updated_at")
        .order("check_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(60);
      if (scope) q = q.or(scope);
      const { data } = await q;
      if (cancelled) return;
      setHistory(((data ?? []) as HistoryRow[]).filter((r) => r.check_type === "opening" || r.check_type === "closing"));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const toggle = (type: CheckType, id: string) => {
    if (readOnly) return;
    setSavedAt(null);
    const update = (prev: ChecklistItem[]) => {
      const next = prev.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i));
      writeLocal(date, type, next);
      return next;
    };
    if (type === "opening") setOpening(update);
    else setClosing(update);
  };

  const reset = (type: CheckType) => {
    if (readOnly) return;
    const next = (type === "opening" ? defaultOpeningItems : defaultClosingItems).map((i) => ({ ...i }));
    if (type === "opening") setOpening(next);
    else setClosing(next);
    writeLocal(date, type, next);
    setSavedAt(null);
  };

  const saveAll = async () => {
    if (readOnly || saving) return;
    setSaving(true);
    setError(null);
    const build = (type: CheckType, items: ChecklistItem[]) => {
      const { done, total } = checklistProgress(items);
      return {
        check_date: date,
        check_type: type,
        items,
        done_count: done,
        total_count: total,
        completed: done === total && total > 0,
        completed_at: done === total && total > 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        location_id: activeLocationId(),
      };
    };
    const rows = [build("opening", opening), build("closing", closing)];
    const scope = locationScope();
    let del = supabase.from("btb_checklists").delete().eq("check_date", date);
    if (scope) del = del.or(scope);
    const { error: delErr } = await del;
    let insErr = delErr;
    if (!delErr) {
      insErr = (await supabase.from("btb_checklists").insert(rows)).error;
    }
    if (insErr) {
      setError(
        "Couldn't save — run supabase/schema-checklists.sql in the Supabase SQL editor, then retry. Ticks are still kept on this device.",
      );
      setSaving(false);
      return;
    }
    writeLocal(date, "opening", opening);
    writeLocal(date, "closing", closing);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setSaving(false);
  };

  const deleteHistoryRow = async (id: string) => {
    if (!confirm("Delete this saved checklist?")) return;
    await supabase.from("btb_checklists").delete().eq("id", id);
    setHistory((prev) => prev.filter((r) => r.id !== id));
  };

  const tabClass = (tab: typeof activeTab) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
      activeTab === tab ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <div>
      <PageHeader
        title="Opening & Closing"
        subtitle="Daily open and close duties · Front and Kitchen · saved per day with history"
      />
      {savedAt && (
        <p className="mb-3 text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full inline-block">
          Saved {savedAt}
        </p>
      )}

      {/* Date & Day — the checklists are per-day, like the printed sheet */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="checklist-date" className="text-sm font-medium text-gray-700">
            Date:
          </label>
          <input
            id="checklist-date"
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
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setActiveTab("today")} className={tabClass("today")}>
            Today&apos;s Checks
          </button>
          <button onClick={() => setActiveTab("history")} className={tabClass("history")}>
            History
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {activeTab === "today" ? (
        <>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChecklistCard
                title="Opening Checklist"
                icon="☀️"
                items={opening}
                readOnly={readOnly}
                onToggle={(id) => toggle("opening", id)}
                onReset={() => reset("opening")}
              />
              <ChecklistCard
                title="Closing Checklist"
                icon="🌙"
                items={closing}
                readOnly={readOnly}
                onToggle={(id) => toggle("closing", id)}
                onReset={() => reset("closing")}
              />
            </div>
          )}
          {!readOnly && (
            <div className="mt-4">
              <button
                onClick={saveAll}
                disabled={saving || loading}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Opening & Closing"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">No saved checklists yet</p>
              <p className="text-gray-400 text-sm mt-1">Tick today&apos;s checks and hit Save</p>
            </div>
          ) : (
            history.map((row) => {
              const expanded = expandedId === row.id;
              return (
                <div key={row.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm">
                          {row.check_type === "opening" ? "☀️ Opening" : "🌙 Closing"} —{" "}
                          {new Date(row.check_date + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {row.done_count}/{row.total_count} done
                          {row.completed ? " · ✓ Complete" : " · Partial"} ·{" "}
                          {new Date(row.updated_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-gray-400 text-sm">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1.5">
                      {(row.items as ChecklistItem[]).map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-sm">
                          <span className={item.completed ? "text-green-500" : "text-red-500"}>
                            {item.completed ? "✓" : "✗"}
                          </span>
                          <span
                            className={item.completed ? "text-gray-500 line-through" : "text-gray-900"}
                          >
                            {item.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-3">
                    <button
                      onClick={() => {
                        handleDateChange(row.check_date);
                        setActiveTab("today");
                      }}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Load
                    </button>
                    {!readOnly && (
                      <button
                        onClick={() => deleteHistoryRow(row.id)}
                        className="text-sm text-gray-400 hover:text-red-500"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ChecklistCard({
  title,
  icon,
  items,
  readOnly,
  onToggle,
  onReset,
}: {
  title: string;
  icon: string;
  items: ChecklistItem[];
  readOnly: boolean;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
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
          <button onClick={onReset} className="text-xs text-gray-400 hover:text-red-600 font-medium">
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
                  onChange={() => onToggle(item.id)}
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
