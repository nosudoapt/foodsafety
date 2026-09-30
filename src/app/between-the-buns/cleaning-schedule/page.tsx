"use client";

import { useState, useEffect, useCallback } from "react";
import { cleaningTasks } from "@/lib/btb-cleaning";
import BtbFeatureGate from "@/components/BtbFeatureGate";

// One log per task per week: who cleaned it, on what date/time, with a before
// and after photo. Replaces the old 7-column date grid — each task is done once
// a week and recorded here. Everything persists to localStorage so photos and
// entries survive a refresh (the old version lost them).
interface TaskLog {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  name: string; // person who did it (full name, not just initials)
  before: string | null; // base64 data URL
  after: string | null;
}

type WeekData = Record<number, TaskLog>; // taskIdx -> log
type Store = Record<string, WeekData>; // weekStart(YYYY-MM-DD) -> week

const STORE_KEY = "btb.cleaning.v2";

function emptyLog(): TaskLog {
  return { date: "", time: "", name: "", before: null, after: null };
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function weekLabel(weekKey: string): string {
  const start = new Date(weekKey + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// View: everyone. Edit: staff/supervisor/manager — corporate is view-only
// (btb-access.ts), hence `readOnly` hides the write UI.
export default function CleaningSchedulePage() {
  return (
    <BtbFeatureGate feature="cleaning_schedule" wide>
      {(readOnly) => <CleaningSchedule readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function CleaningSchedule({ readOnly }: { readOnly: boolean }) {
  const [store, setStore] = useState<Store>({});
  const [ready, setReady] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");

  const weekKey = toISODate(currentWeekStart);
  const weekData: WeekData = store[weekKey] || {};

  // Load once (async to keep the synchronous-setState-in-effect lint happy).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        const parsed: Store = raw ? JSON.parse(raw) : {};
        if (!cancelled) setStore(parsed);
      } catch {
        /* corrupt or unavailable storage — start empty */
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change (writing localStorage, not setState — lint-safe).
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* quota or unavailable — keep working in memory */
    }
  }, [store, ready]);

  const updateLog = useCallback(
    (taskIdx: number, patch: Partial<TaskLog>) => {
      setStore((prev) => {
        const week = prev[weekKey] || {};
        const log = week[taskIdx] || emptyLog();
        return {
          ...prev,
          [weekKey]: { ...week, [taskIdx]: { ...log, ...patch } },
        };
      });
    },
    [weekKey],
  );

  const handlePhoto = useCallback(
    async (taskIdx: number, which: "before" | "after", file: File | undefined) => {
      if (!file) return;
      const base64 = await fileToBase64(file);
      updateLog(taskIdx, { [which]: base64 } as Partial<TaskLog>);
    },
    [updateLog],
  );

  const clearWeek = () => {
    if (!confirm("Clear all entries for this week?")) return;
    setStore((prev) => {
      const next = { ...prev };
      delete next[weekKey];
      return next;
    });
  };

  const deleteWeek = (key: string) => {
    if (!confirm(`Delete the week of ${weekLabel(key)}?`)) return;
    setStore((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const goToPrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(getStartOfWeek(d));
  };
  const goToNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(getStartOfWeek(d));
  };
  const goToThisWeek = () => setCurrentWeekStart(getStartOfWeek(new Date()));

  const doneCount = cleaningTasks.reduce(
    (n, _, idx) => (weekData[idx]?.name ? n + 1 : n),
    0,
  );

  const savedWeeks = Object.keys(store)
    .filter((k) => Object.values(store[k]).some((l) => l.name || l.before || l.after))
    .sort((a, b) => (a < b ? 1 : -1));

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">BTB</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Weekly Cleaning Schedule</h1>
              <p className="text-xs text-gray-500">Between the Buns — one entry per task, per week</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("today")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "today" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "history" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              History ({savedWeeks.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {activeTab === "today" ? (
          <>
            {/* Week Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={goToPrevWeek} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">
                ← Prev
              </button>
              <div className="text-center">
                <p className="font-bold text-gray-900">Week of {weekLabel(weekKey)}</p>
                <p className="text-xs text-gray-500">{doneCount} of {cleaningTasks.length} tasks logged</p>
              </div>
              <div className="flex gap-2">
                <button onClick={goToThisWeek} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
                  This Week
                </button>
                <button onClick={goToNextWeek} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Next →
                </button>
              </div>
            </div>

            {/* Task cards */}
            <div className="space-y-3">
              {cleaningTasks.map((task, idx) => {
                const log = weekData[idx] || emptyLog();
                const logged = !!log.name;
                return (
                  <div key={idx} className={`bg-white rounded-xl border p-4 ${logged ? "border-green-300" : "border-gray-200"}`}>
                    <div className="flex items-start gap-2 mb-3">
                      <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center ${logged ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {idx + 1}
                      </span>
                      <p className="text-sm font-medium text-gray-900">{task}</p>
                    </div>

                    {/* date / time / name */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                      <label className="block">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Date</span>
                        <input
                          type="date"
                          value={log.date}
                          disabled={readOnly}
                          onChange={(e) => updateLog(idx, { date: e.target.value })}
                          className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 disabled:bg-gray-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Time</span>
                        <input
                          type="time"
                          value={log.time}
                          disabled={readOnly}
                          onChange={(e) => updateLog(idx, { time: e.target.value })}
                          className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 disabled:bg-gray-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Name</span>
                        <input
                          type="text"
                          value={log.name}
                          disabled={readOnly}
                          onChange={(e) => updateLog(idx, { name: e.target.value })}
                          placeholder="Who cleaned it"
                          className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 disabled:bg-gray-50"
                        />
                      </label>
                    </div>

                    {/* before / after upload — always visible */}
                    <div className="grid grid-cols-2 gap-3">
                      {(["before", "after"] as const).map((which) => {
                        const src = log[which];
                        const badge = which === "before" ? "bg-blue-600" : "bg-green-600";
                        return (
                          <div key={which} className="rounded-lg border border-gray-200 p-2">
                            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">
                              {which} photo
                            </p>
                            {src ? (
                              <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element -- data-URL upload preview, next/image can't optimize these */}
                                <img src={src} alt={`${which}`} className="w-full h-28 object-cover rounded" />
                                <span className={`absolute bottom-1 left-1 ${badge} text-white text-[8px] px-1 rounded capitalize`}>
                                  {which}
                                </span>
                                {!readOnly && (
                                  <button
                                    onClick={() => updateLog(idx, { [which]: null } as Partial<TaskLog>)}
                                    className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center"
                                    aria-label={`Remove ${which} photo`}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : readOnly ? (
                              <div className="h-28 rounded bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                No photo
                              </div>
                            ) : (
                              <label className="h-28 rounded border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-red-400 hover:bg-red-50/40 transition-colors">
                                <span className="text-2xl">📷</span>
                                <span className="text-[11px] text-gray-500 mt-1">Upload {which}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={(e) => handlePhoto(idx, which, e.target.files?.[0])}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {!readOnly && (
              <div className="mt-6 flex items-center gap-3">
                <p className="text-xs text-gray-500 mr-auto">Entries save automatically to this device.</p>
                <button onClick={clearWeek} className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                  Clear Week
                </button>
              </div>
            )}
          </>
        ) : (
          /* History */
          <div className="space-y-4">
            {savedWeeks.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p className="text-gray-500">No saved weeks yet</p>
                <p className="text-gray-400 text-sm mt-1">Log this week&apos;s tasks and they&apos;ll appear here</p>
              </div>
            ) : (
              savedWeeks.map((key) => {
                const week = store[key];
                const logged = Object.values(week).filter((l) => l.name).length;
                const photos = Object.values(week).reduce(
                  (n, l) => n + (l.before ? 1 : 0) + (l.after ? 1 : 0),
                  0,
                );
                return (
                  <div key={key} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">Week of {weekLabel(key)}</h3>
                        <p className="text-xs text-gray-500">
                          {logged}/{cleaningTasks.length} tasks · {photos} photos
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setCurrentWeekStart(new Date(key + "T12:00:00"));
                            setActiveTab("today");
                          }}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Open
                        </button>
                        {!readOnly && (
                          <button onClick={() => deleteWeek(key)} className="text-sm text-gray-400 hover:text-red-500" aria-label="Delete week">
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
