"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleaningTasks } from "@/lib/btb-cleaning";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { supabase } from "@/lib/supabase";
import {
  compressImage,
  photoSrc,
  parsePhotoList,
  removePhotos,
  uploadToSupabase,
} from "@/lib/photos";

// One cleaning_logs row per task per week: who did it, when, and JSON arrays of
// object paths for each photo side (multiple angles). Photos are compressed
// on-device and uploaded to the ops-photos Storage bucket — the row only stores
// paths. History loads from Supabase on mount; edits debounce-save per task.
interface TaskLog {
  id?: string; // cleaning_logs row id (undefined until first save)
  date: string; // YYYY-MM-DD → done_date
  time: string; // HH:MM → done_time
  name: string; // → done_by
  before: string[]; // object paths → before_photo (JSON array)
  after: string[]; // object paths → after_photo (JSON array)
}

type WeekData = Record<number, TaskLog>; // taskIdx -> log
type Store = Record<string, WeekData>; // weekStart(YYYY-MM-DD) -> week
type Side = "before" | "after";
type Zoom = { idx: number; side: Side; i: number };

const SAVE_DEBOUNCE_MS = 600;

function emptyLog(): TaskLog {
  return { date: "", time: "", name: "", before: [], after: [] };
}

/** An entry that has something worth persisting (date alone is not content). */
function hasContent(l: TaskLog): boolean {
  return !!(l.name || l.time || l.before.length || l.after.length);
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

function plusDays(weekKey: string, n: number): string {
  const d = new Date(weekKey + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** The Monday of the week containing dateStr. */
function mondayOf(dateStr: string): string {
  return toISODate(getStartOfWeek(new Date(dateStr + "T12:00:00")));
}

/** Date to file an entry under when the user didn't pick one. */
function defaultDate(weekKey: string): string {
  const today = toISODate(new Date());
  return today >= weekKey && today <= plusDays(weekKey, 6) ? today : weekKey;
}

function weekLabel(weekKey: string): string {
  const start = new Date(weekKey + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
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
  const storeRef = useRef<Store>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const weekKey = toISODate(currentWeekStart);
  const weekData: WeekData = store[weekKey] || {};

  const commitStore = useCallback((next: Store) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  const setLog = useCallback(
    (key: string, idx: number, log: TaskLog) => {
      commitStore({
        ...storeRef.current,
        [key]: { ...(storeRef.current[key] || {}), [idx]: log },
      });
    },
    [commitStore],
  );

  // Persist the CURRENT state of one task row. Always re-reads storeRef so a
  // save that races with typing can't clobber newer edits (pending debounce
  // timers converge the content afterwards).
  const persist = useCallback(
    async (key: string, idx: number) => {
      const t = timers.current.get(`${key}:${idx}`);
      if (t) {
        clearTimeout(t);
        timers.current.delete(`${key}:${idx}`);
      }
      try {
        const log = storeRef.current[key]?.[idx];
        if (!log) return;
        if (!hasContent(log)) {
          if (log.id) {
            const { error: err } = await supabase.from("cleaning_logs").delete().eq("id", log.id);
            if (err) throw new Error(err.message);
            setLog(key, idx, { ...emptyLog(), date: log.date });
            setError("");
          }
          return;
        }
        const taskName = cleaningTasks[idx];
        let id = log.id;
        if (!id) {
          // Idempotent first save: reuse an existing row for this task/week.
          const { data: existing, error: err } = await supabase
            .from("cleaning_logs")
            .select("id")
            .eq("week_start", key)
            .eq("task_name", taskName)
            .limit(1);
          if (err) throw new Error(err.message);
          id = existing?.[0]?.id;
        }
        const doneDate = log.date || defaultDate(key);
        const payload = {
          task_name: taskName,
          week_start: key,
          done_date: doneDate,
          done_by: log.name || null,
          done_time: log.time || null,
          before_photo: JSON.stringify(log.before),
          after_photo: JSON.stringify(log.after),
        };
        if (id) {
          const { error: err } = await supabase.from("cleaning_logs").update(payload).eq("id", id);
          if (err) throw new Error(err.message);
        } else {
          const { data, error: err } = await supabase
            .from("cleaning_logs")
            .insert(payload)
            .select("id")
            .single();
          if (err) throw new Error(err.message);
          id = data.id;
        }
        // Merge the row id / auto date into whatever the latest local edit is.
        const after = storeRef.current[key]?.[idx];
        if (after && hasContent(after)) {
          setLog(key, idx, { ...after, id, date: after.date || doneDate });
        } else if (id) {
          // Content was cleared while this save was in flight — clean the row up.
          await supabase.from("cleaning_logs").delete().eq("id", id);
          setLog(key, idx, { ...emptyLog(), date: after?.date ?? "" });
        }
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save this entry.");
      }
    },
    [setLog],
  );

  const schedulePersist = useCallback(
    (key: string, idx: number) => {
      const k = `${key}:${idx}`;
      const prev = timers.current.get(k);
      if (prev) clearTimeout(prev);
      timers.current.set(
        k,
        setTimeout(() => {
          timers.current.delete(k);
          void persist(key, idx);
        }, SAVE_DEBOUNCE_MS),
      );
    },
    [persist],
  );

  const updateLog = useCallback(
    (key: string, idx: number, patch: Partial<TaskLog>) => {
      const log = storeRef.current[key]?.[idx] || emptyLog();
      setLog(key, idx, { ...log, ...patch });
      schedulePersist(key, idx);
    },
    [setLog, schedulePersist],
  );

  // Load history once from Supabase (newest row wins per task/week).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("cleaning_logs")
          .select(
            "id, task_name, done_by, done_date, done_time, before_photo, after_photo, week_start",
          )
          .order("created_at", { ascending: false });
        if (err) throw new Error(err.message);
        if (cancelled) return;
        const loaded: Store = {};
        for (const row of data ?? []) {
          const idx = cleaningTasks.indexOf(row.task_name);
          if (idx < 0) continue;
          const key = row.week_start ? mondayOf(row.week_start) : mondayOf(row.done_date);
          const week = loaded[key] || (loaded[key] = {});
          if (week[idx]) continue;
          week[idx] = {
            id: row.id,
            date: row.done_date || "",
            time: row.done_time || "",
            name: row.done_by || "",
            before: parsePhotoList(row.before_photo),
            after: parsePhotoList(row.after_photo),
          };
        }
        commitStore(loaded);
        setError("");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the schedule.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commitStore]);

  // Flush debounced saves so navigating away doesn't drop the last edit.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const k of Array.from(pending.keys())) {
        const t = pending.get(k);
        if (t) clearTimeout(t);
        pending.delete(k);
        const [key, idxStr] = k.split(":");
        void persist(key, Number(idxStr));
      }
    };
  }, [persist]);

  // Zoom viewer keyboard shortcuts.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      const list = storeRef.current[weekKey]?.[zoom.idx]?.[zoom.side] || [];
      if (e.key === "Escape") setZoom(null);
      else if (e.key === "ArrowRight" && list.length)
        setZoom((z) => (z ? { ...z, i: (z.i + 1) % list.length } : z));
      else if (e.key === "ArrowLeft" && list.length)
        setZoom((z) => (z ? { ...z, i: (z.i - 1 + list.length) % list.length } : z));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, weekKey]);

  async function handleFiles(idx: number, side: Side, picked: File[]) {
    if (!picked.length) return;
    const ukey = `${idx}:${side}`;
    setUploading((prev) => ({ ...prev, [ukey]: true }));
    setError("");
    try {
      const added: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const blob = await compressImage(picked[i]);
        const path = `cleaning/${weekKey}/${idx}/${side}-${crypto.randomUUID()}.jpg`;
        await uploadToSupabase(path, blob);
        added.push(path);
      }
      const log = storeRef.current[weekKey]?.[idx] || emptyLog();
      const next: TaskLog =
        side === "before"
          ? { ...log, before: [...log.before, ...added] }
          : { ...log, after: [...log.after, ...added] };
      setLog(weekKey, idx, next);
      await persist(weekKey, idx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading((prev) => {
        const next = { ...prev };
        delete next[ukey];
        return next;
      });
    }
  }

  async function removePhoto(idx: number, side: Side, i: number) {
    const log = storeRef.current[weekKey]?.[idx];
    if (!log) return;
    const path = log[side][i];
    const next: TaskLog =
      side === "before"
        ? { ...log, before: log.before.filter((_, j) => j !== i) }
        : { ...log, after: log.after.filter((_, j) => j !== i) };
    setLog(weekKey, idx, next);
    setZoom((z) => {
      if (!z || z.idx !== idx || z.side !== side) return z;
      if (!next[side].length) return null;
      return { ...z, i: Math.min(z.i, next[side].length - 1) };
    });
    if (path) void removePhotos([path]).catch(() => {});
    await persist(weekKey, idx);
  }

  async function deleteWeek(key: string, message: string) {
    if (!confirm(message)) return;
    const week = storeRef.current[key] || {};
    const ids: string[] = [];
    const paths: string[] = [];
    for (const idx of Object.keys(week).map(Number)) {
      const t = timers.current.get(`${key}:${idx}`);
      if (t) {
        clearTimeout(t);
        timers.current.delete(`${key}:${idx}`);
      }
      const l = week[idx];
      if (l.id) ids.push(l.id);
      paths.push(...l.before, ...l.after);
    }
    const next = { ...storeRef.current };
    delete next[key];
    commitStore(next);
    setZoom(null);
    try {
      if (ids.length) {
        const { error: err } = await supabase.from("cleaning_logs").delete().in("id", ids);
        if (err) throw new Error(err.message);
      }
      if (paths.length) await removePhotos(paths).catch(() => {});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this week.");
    }
  }

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
    (n, _, idx) => (weekData[idx] && hasContent(weekData[idx]) ? n + 1 : n),
    0,
  );

  const savedWeeks = Object.keys(store)
    .filter((k) => Object.values(store[k]).some(hasContent))
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
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 font-bold" aria-label="Dismiss error">
              ✕
            </button>
          </div>
        )}

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
                const logged = hasContent(log);
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
                          onChange={(e) => updateLog(weekKey, idx, { date: e.target.value })}
                          className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 disabled:bg-gray-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Time</span>
                        <input
                          type="time"
                          value={log.time}
                          disabled={readOnly}
                          onChange={(e) => updateLog(weekKey, idx, { time: e.target.value })}
                          className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 disabled:bg-gray-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Name</span>
                        <input
                          type="text"
                          value={log.name}
                          disabled={readOnly}
                          onChange={(e) => updateLog(weekKey, idx, { name: e.target.value })}
                          placeholder="Who cleaned it"
                          className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 disabled:bg-gray-50"
                        />
                      </label>
                    </div>

                    {/* before / after photo lists — multiple angles, tap to zoom */}
                    <div className="grid grid-cols-2 gap-3">
                      {(["before", "after"] as const).map((which) => {
                        const photos = log[which];
                        const ukey = `${idx}:${which}`;
                        return (
                          <div key={which} className="rounded-lg border border-gray-200 p-2">
                            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">
                              {which} photos {photos.length ? `(${photos.length})` : ""}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {photos.map((p, i) => (
                                <div key={`${p}-${i}`} className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setZoom({ idx, side: which, i })}
                                    className="block w-16 h-16 rounded overflow-hidden border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-400"
                                    aria-label={`Zoom ${which} photo ${i + 1}`}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic storage URLs */}
                                    <img src={photoSrc(p)} alt={`${which} ${i + 1}`} className="w-full h-full object-cover" />
                                  </button>
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => removePhoto(idx, which, i)}
                                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center"
                                      aria-label={`Remove ${which} photo ${i + 1}`}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                              {readOnly ? (
                                photos.length === 0 && (
                                  <span className="text-xs text-gray-400 self-center">No photos</span>
                                )
                              ) : uploading[ukey] ? (
                                <div className="w-16 h-16 rounded border border-gray-200 flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600" />
                                </div>
                              ) : (
                                <label className="w-16 h-16 rounded border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-red-400 hover:bg-red-50/40 transition-colors">
                                  <span className="text-lg leading-none">＋</span>
                                  <span className="text-[9px] text-gray-500 mt-0.5">Add</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                      const picked = Array.from(e.target.files ?? []);
                                      e.target.value = "";
                                      if (picked.length) void handleFiles(idx, which, picked);
                                    }}
                                  />
                                </label>
                              )}
                            </div>
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
                <p className="text-xs text-gray-500 mr-auto">Entries save automatically.</p>
                <button
                  onClick={() => void deleteWeek(weekKey, "Clear all entries for this week?")}
                  className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                >
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
                const logged = Object.values(week).filter(hasContent).length;
                const photos = Object.values(week).reduce(
                  (n, l) => n + l.before.length + l.after.length,
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
                          <button
                            onClick={() => void deleteWeek(key, `Delete the week of ${weekLabel(key)}?`)}
                            className="text-sm text-gray-400 hover:text-red-500"
                            aria-label="Delete week"
                          >
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

      {/* Zoom viewer */}
      {zoom &&
        (() => {
          const log = store[weekKey]?.[zoom.idx];
          const photos = log?.[zoom.side] ?? [];
          if (!photos.length) return null;
          const i = Math.min(zoom.i, photos.length - 1);
          return (
            <div
              className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
              onClick={() => setZoom(null)}
              role="presentation"
            >
              <div
                className="relative max-w-full max-h-full flex flex-col items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setZoom(null)}
                  className="absolute -top-2 right-0 md:-right-10 bg-white/10 hover:bg-white/25 text-white w-8 h-8 rounded-full flex items-center justify-center"
                  aria-label="Close viewer"
                >
                  ✕
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element -- zoomed storage URL */}
                <img
                  src={photoSrc(photos[i])}
                  alt={`${zoom.side} photo ${i + 1}`}
                  className="max-h-[75vh] max-w-full rounded-lg object-contain"
                />
                <div className="flex items-center gap-3 mt-3 text-white text-sm">
                  <span className="font-medium">{cleaningTasks[zoom.idx]}</span>
                  <span className="uppercase text-[10px] bg-white/20 px-2 py-0.5 rounded">{zoom.side}</span>
                  <span className="tabular-nums">
                    {i + 1} / {photos.length}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => void removePhoto(zoom.idx, zoom.side, i)}
                      className="text-red-300 hover:text-red-200 font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {photos.length > 1 && (
                  <div className="absolute inset-y-0 -left-3 md:-left-12 flex items-center">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => (z ? { ...z, i: (i - 1 + photos.length) % photos.length } : z))}
                      className="bg-white/10 hover:bg-white/25 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg"
                      aria-label="Previous photo"
                    >
                      ‹
                    </button>
                  </div>
                )}
                {photos.length > 1 && (
                  <div className="absolute inset-y-0 -right-3 md:-right-12 flex items-center">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => (z ? { ...z, i: (i + 1) % photos.length } : z))}
                      className="bg-white/10 hover:bg-white/25 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg"
                      aria-label="Next photo"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
