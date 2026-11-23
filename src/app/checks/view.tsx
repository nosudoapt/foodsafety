"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import { Check, ChevronDown, CircleAlert, ClipboardCheck, Moon, Save, Sun, Trash2 } from "lucide-react";
import {
  defaultClosingItems,
  defaultOpeningItems,
  type ChecklistItem,
} from "@/lib/btb-checklists";

interface CheckRecord {
  id: string;
  check_type: "opening" | "closing";
  checklist_items: ChecklistItem[];
  completed: boolean;
  completed_at: string | null;
  notes: string;
  created_at: string;
}

export default function ChecksPage() {
  const { user, restaurantName } = useAuth();
  const userId = user?.id;
  const [history, setHistory] = useState<CheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkType, setCheckType] = useState<"opening" | "closing">("opening");
  const [checklistItems, setChecklistItems] = useState(defaultOpeningItems);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "opening" | "closing">("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [feedbackArea, setFeedbackArea] = useState<"check" | "history">("check");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const drafts = useRef<Partial<Record<"opening" | "closing", { items: ChecklistItem[]; notes: string }>>>({});

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    (async () => {
      try {
        if (!userId) throw new Error("Sign in to view your checks.");
        const { data, error } = await supabase.from("daily_checks")
          .select("id, check_type, checklist_items, completed, completed_at, notes, created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(50).abortSignal(controller.signal);
        if (error) throw new Error("Your check history couldn’t be loaded. Please try again.");
        if (!cancelled) { setHistory(data || []); setHistoryError(""); }
      } catch (cause) {
        if (!cancelled) setHistoryError(cause instanceof Error ? cause.message : "Your check history couldn’t be loaded.");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [refreshKey, userId]);

  const handleCheckTypeChange = (type: "opening" | "closing") => {
    if (saving || type === checkType) return;
    drafts.current[checkType] = { items: checklistItems, notes };
    setCheckType(type);
    setChecklistItems(drafts.current[type]?.items ?? (type === "opening" ? defaultOpeningItems : defaultClosingItems));
    setNotes(drafts.current[type]?.notes ?? "");
    setError(""); setNotice("");
  };

  const toggleItem = (id: string) => {
    setNotice("");
    setChecklistItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const completedCount = checklistItems.filter((item) => item.completed).length;
  const totalCount = checklistItems.length;
  const allCompleted = completedCount === totalCount;

  const saveCheck = async () => {
    if (saving || completedCount === 0) return;
    setSaving(true);
    setFeedbackArea("check");
    setError(""); setNotice("");
    try {
      if (!userId || !restaurantName) throw new Error("Your workspace is unavailable. Reconnect, then retry your saved entries.");
      const { data, error } = await supabase.from("daily_checks").insert({
        user_id: userId, restaurant_name: restaurantName,
        check_type: checkType, checklist_items: checklistItems, completed: allCompleted,
        completed_at: allCompleted ? new Date().toISOString() : null, notes: notes.trim(),
      }).select("id, check_type, checklist_items, completed, completed_at, notes, created_at")
        .abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("Your check wasn’t saved. Your entries are still here; please try again.");
      setHistory((current) => [data as CheckRecord, ...current].slice(0, 50));
      delete drafts.current[checkType];
      setChecklistItems(checkType === "opening" ? defaultOpeningItems : defaultClosingItems);
      setNotes("");
      setNotice(`${checkType === "opening" ? "Opening" : "Closing"} check saved${allCompleted ? " as complete" : " with partial progress"}. Find it in your history below.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your check couldn’t be saved. Please try again.");
    } finally { setSaving(false); }
  };

  const deleteCheck = async (id: string) => {
    if (deletingId || !userId || !confirm("Delete this check record?")) return;
    setDeletingId(id); setError(""); setNotice("");
    setFeedbackArea("history");
    try {
      const { data, error } = await supabase.from("daily_checks").delete().eq("id", id).eq("user_id", userId)
        .select("id").abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The check wasn’t deleted. Please try again.");
      setHistory((current) => current.filter((row) => row.id !== id));
      setNotice("Check record deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The check couldn’t be deleted.");
    } finally { setDeletingId(null); }
  };

  const filteredHistory = historyFilter === "all"
    ? history
    : history.filter((h) => h.check_type === historyFilter);

  return (
    <div className="checks-workspace">
      <PageHeader title="Daily Kitchen Checks" subtitle="A clear start. A confident close. Work through your shift, then save your record." />

      {/* Check Type Toggle */}
      <div className="flex gap-2 mb-6">
        <Button
          accent="green"
          variant={checkType === "opening" ? "solid" : "soft"}
          onClick={() => handleCheckTypeChange("opening")}
          aria-pressed={checkType === "opening"}
          disabled={saving}
          className="flex-1 md:flex-none"
        >
          <Sun size={17} aria-hidden="true" /> Opening Check
        </Button>
        <Button
          accent="green"
          variant={checkType === "closing" ? "solid" : "soft"}
          onClick={() => handleCheckTypeChange("closing")}
          aria-pressed={checkType === "closing"}
          disabled={saving}
          className="flex-1 md:flex-none"
        >
          <Moon size={17} aria-hidden="true" /> Closing Check
        </Button>
      </div>

      {/* Active Checklist */}
      <Card className="mb-8">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              {checkType === "opening" ? "Opening Checklist" : "Closing Checklist"}
            </h2>
            <p className="text-sm text-gray-600">
              {completedCount} of {totalCount} completed
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="checks-progress" role="progressbar" aria-label="Checklist completion" aria-valuemin={0} aria-valuemax={totalCount} aria-valuenow={completedCount}>
              <div
                className="checks-progress__fill"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="checks-columns">
          {/* Front Section */}
          {checklistItems.some((item) => item.section === "Front") && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  {checkType === "opening" ? "Front Opening Duties" : "Front Area"}
                </h3>
              </div>
              {checklistItems.filter((item) => item.section === "Front").map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    disabled={saving}
                    onChange={() => toggleItem(item.id)}
                    className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      item.completed ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.text}
                  </span>
                  {item.completed && (
                    <span className="checks-done">Done</span>
                  )}
                </label>
              ))}
            </div>
          )}

          {/* Kitchen Section */}
          {checklistItems.some((item) => item.section === "Kitchen") && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  {checkType === "opening" ? "Back Kitchen Duties" : "Kitchen Area"}
                </h3>
              </div>
              {checklistItems.filter((item) => item.section === "Kitchen").map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    disabled={saving}
                    onChange={() => toggleItem(item.id)}
                    className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      item.completed ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.text}
                  </span>
                  {item.completed && (
                    <span className="checks-done">Done</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <label htmlFor="check-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            id="check-notes"
            disabled={saving}
            value={notes}
            onChange={(e) => { setNotice(""); setNotes(e.target.value); }}
            rows={3}
            maxLength={2000}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm text-gray-900 bg-white"
            placeholder="Any observations or issues..."
          />
        </div>

        <div className="checks-save p-4 border-t border-gray-200">
          <Button
            accent="green"
            onClick={saveCheck}
            disabled={saving || completedCount === 0}
            className="w-full"
          >
            {allCompleted ? <ClipboardCheck size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
            {saving ? "Saving…" : allCompleted ? "Complete & Save" : "Save Partial Check"}
          </Button>
          {!allCompleted && completedCount > 0 && (
            <p className="text-center text-sm text-[var(--warn)] mt-2">
              {totalCount - completedCount} {totalCount - completedCount === 1 ? "item" : "items"} remaining. You can save partial progress.
            </p>
          )}
          {feedbackArea === "check" && notice && <div className="ui-notice ui-notice--success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}
          {feedbackArea === "check" && error && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
        </div>
      </Card>

      {/* History */}
      {feedbackArea === "history" && notice && <div className="ui-notice ui-notice--success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}
      {feedbackArea === "history" && error && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
      <Card>
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Check History</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "opening", "closing"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setHistoryFilter(filter)}
                aria-pressed={historyFilter === filter}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  historyFilter === filter
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {filter === "all" ? "All" : filter === "opening" ? "Opening" : "Closing"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="ui-empty" role="status">Loading your checks…</div>
        ) : historyError ? (
          <div className="ui-empty"><CircleAlert size={26} aria-hidden="true" /><p role="alert">{historyError}</p><Button variant="ghost" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1); }}>Retry check history</Button></div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No {historyFilter === "all" ? "" : historyFilter} checks recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredHistory.map((check) => {
              const items = check.checklist_items || [];
              const completedItems = items.filter((i: ChecklistItem) => i.completed).length;
              const expanded = expandedHistoryId === check.id;

              return (
                <div key={check.id} className="hover:bg-gray-50">
                  <div className="check-history__head">
                    <button className="check-history__toggle" onClick={() => setExpandedHistoryId(expanded ? null : check.id)} aria-expanded={expanded} aria-controls={`check-${check.id}`}>
                      <span className="check-history__body">
                        <span className="ui-actions">
                          <Badge accent={check.check_type === "opening" ? "amber" : "purple"}>{check.check_type === "opening" ? "Opening" : "Closing"}</Badge>
                          <Badge accent={check.completed ? "green" : "amber"}>{check.completed ? "Complete" : `Partial (${completedItems}/${items.length})`}</Badge>
                        </span>
                        <span className="check-history__date">
                          {new Date(check.created_at).toLocaleDateString("en-CA", {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                          {" · "}
                          {new Date(check.created_at).toLocaleTimeString("en-CA", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {check.notes && (
                          <span className="check-history__notes">{check.notes}</span>
                        )}
                      </span>
                      <ChevronDown size={18} aria-hidden="true" className={expanded ? "check-history__chevron--open" : ""} />
                    </button>
                    <button onClick={() => deleteCheck(check.id)} disabled={!!deletingId} className="ui-iconbutton ui-iconbutton--danger" aria-label={`Delete ${check.check_type} check from ${new Date(check.created_at).toLocaleDateString("en-GB")}`}><Trash2 size={17} aria-hidden="true" /></button>
                  </div>

                    <div id={`check-${check.id}`} hidden={!expanded} className="px-4 pb-4">
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        {items.map((item: ChecklistItem) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className={item.completed ? "checks-done" : "text-gray-500"}>
                              {item.completed ? <Check size={16} aria-label="Completed" /> : <CircleAlert size={16} aria-label="Not completed" />}
                            </span>
                            <span
                              className={
                                item.completed
                                  ? "text-gray-500 line-through"
                                  : "text-gray-900"
                              }
                            >
                              {item.text}
                            </span>
                          </div>
                        ))}
                      </div>
                      {check.completed_at && (
                        <p className="text-xs text-gray-500 mt-2">
                          Completed at:{" "}
                          {new Date(check.completed_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
