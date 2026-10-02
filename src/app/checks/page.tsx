"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader, Card, Button } from "@/components/ui";
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
  const [history, setHistory] = useState<CheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkType, setCheckType] = useState<"opening" | "closing">("opening");
  const [checklistItems, setChecklistItems] = useState(defaultOpeningItems);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "opening" | "closing">("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("daily_checks")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      setHistory(data || []);
      setLoading(false);
    };
    fetchHistory();
  }, [refreshKey]);

  const handleCheckTypeChange = (type: "opening" | "closing") => {
    setCheckType(type);
    setChecklistItems(type === "opening" ? defaultOpeningItems : defaultClosingItems);
    setNotes("");
  };

  const toggleItem = (id: string) => {
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
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("daily_checks").insert({
      user_id: session.user.id,
      restaurant_name: "My Restaurant",
      check_type: checkType,
      checklist_items: checklistItems,
      completed: allCompleted,
      completed_at: allCompleted ? new Date().toISOString() : null,
      notes: notes,
    });

    if (!error) {
      setChecklistItems(checkType === "opening" ? defaultOpeningItems : defaultClosingItems);
      setNotes("");
      setRefreshKey((k) => k + 1);
    }
    setSaving(false);
  };

  const deleteCheck = async (id: string) => {
    if (!confirm("Delete this check record?")) return;
    await supabase.from("daily_checks").delete().eq("id", id);
    setRefreshKey((k) => k + 1);
  };

  const filteredHistory = historyFilter === "all"
    ? history
    : history.filter((h) => h.check_type === historyFilter);

  return (
    <div>
      <PageHeader title="Daily Kitchen Checks" subtitle="Complete opening and closing checklists every shift" />

      {/* Check Type Toggle */}
      <div className="flex gap-2 mb-6">
        <Button
          accent="green"
          variant={checkType === "opening" ? "solid" : "soft"}
          onClick={() => handleCheckTypeChange("opening")}
          className="flex-1 md:flex-none"
        >
          ☀️ Opening Check
        </Button>
        <Button
          accent="green"
          variant={checkType === "closing" ? "solid" : "soft"}
          onClick={() => handleCheckTypeChange("closing")}
          className="flex-1 md:flex-none"
        >
          🌙 Closing Check
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
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  allCompleted ? "bg-green-500" : "bg-green-400"
                }`}
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Front Section */}
          {checklistItems.some((item) => item.section === "Front") && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  {checkType === "opening" ? "🏪 Front Opening Duties" : "🏪 Front Area"}
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
                    <span className="text-green-500 text-xs font-medium">Done</span>
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
                  {checkType === "opening" ? "🍳 Back Kitchen Duties" : "🍳 Kitchen Area"}
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
                    <span className="text-green-500 text-xs font-medium">Done</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm text-gray-900 bg-white"
            placeholder="Any observations or issues..."
          />
        </div>

        <div className="p-4 border-t border-gray-200">
          <Button
            accent="green"
            onClick={saveCheck}
            disabled={saving || completedCount === 0}
            className="w-full"
          >
            {saving ? "Saving..." : allCompleted ? "✓ Complete & Save" : "Save Partial Check"}
          </Button>
          {!allCompleted && completedCount > 0 && (
            <p className="text-center text-sm text-amber-600 mt-2">
              ⚠ {totalCount - completedCount} items remaining
            </p>
          )}
        </div>
      </Card>

      {/* History */}
      <Card>
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Check History</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "opening", "closing"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setHistoryFilter(filter)}
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
          <div className="p-8 text-center text-gray-500">Loading...</div>
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
                  <div
                    onClick={() => setExpandedHistoryId(expanded ? null : check.id)}
                    className="w-full p-4 text-left cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              check.check_type === "opening"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-indigo-100 text-indigo-700"
                            }`}
                          >
                            {check.check_type === "opening" ? "☀️ Opening" : "🌙 Closing"}
                          </span>
                          {check.completed ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              ✓ Complete
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              Partial ({completedItems}/{items.length})
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
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
                        </p>
                        {check.notes && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                            📝 {check.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCheck(check.id);
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Delete"
                        >
                          🗑️
                        </button>
                        <span className="text-gray-400 text-sm">{expanded ? "▲" : "▼"}</span>
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4">
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        {items.map((item: ChecklistItem) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className={item.completed ? "text-green-500" : "text-red-500"}>
                              {item.completed ? "✓" : "✗"}
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
