"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const defaultOpeningItems = [
  // Front Opening Duties
  { id: "o1", text: "Open Sign: Turn on the open sign at opening time", completed: false, section: "Front" },
  { id: "o2", text: "POS Tablets: Turn on all three tablets (Master, Customer, Kitchen) - ensure fully charged", completed: false, section: "Front" },
  { id: "o3", text: "Debit Machine: Check if working properly and fully charged", completed: false, section: "Front" },
  { id: "o4", text: "Menu TV: Turn on the menu TV display", completed: false, section: "Front" },
  { id: "o5", text: "Buns & Display Area: Put out fresh buns, set up display buns board, stock dippings", completed: false, section: "Front" },
  { id: "o6", text: "Bun Expiry Rule: Throw away old buns after 4 days and replace with fresh buns", completed: false, section: "Front" },
  { id: "o7", text: "Dine-In Tables: Check all tables in the dine-in area are clean", completed: false, section: "Front" },
  { id: "o8", text: "Napkin Dispensers: Check and refill napkin dispensers in dine-in area", completed: false, section: "Front" },
  { id: "o9", text: "Table Caddies: Check and refill all caddies (Ketchup, Mustard, Relish, Salt, Pepper, Vinegar)", completed: false, section: "Front" },
  { id: "o10", text: "Washroom: Ensure clean; check tissue paper and towel rolls are filled", completed: false, section: "Front" },
  { id: "o11", text: "Dine-In Floor: Check and make sure the dine-in floor is completely clean", completed: false, section: "Front" },
  // Back Kitchen Duties
  { id: "o12", text: "Exhaust Hoods: Turn on hoods", completed: false, section: "Kitchen" },
  { id: "o13", text: "Hot Plate: Set temperatures - Left Two Burners: 350°F, Right One Burner: 250°F", completed: false, section: "Kitchen" },
  { id: "o14", text: "Fryer: Turn on fryer and set to 350°F", completed: false, section: "Kitchen" },
  { id: "o15", text: "Toaster: Turn on toaster and switch button to buns mode", completed: false, section: "Kitchen" },
  { id: "o16", text: "Station Setup: Place all tools and equipment on stations (Flipper, Tongs, Scraper, Steamer dome, Bowls, Spreader)", completed: false, section: "Kitchen" },
  { id: "o17", text: "Line & Chef Base: Check line and chef base drawers; refill if needed", completed: false, section: "Kitchen" },
  { id: "o18", text: "Gravy Station: Heat up gravy on induction stove, then transfer to hot well", completed: false, section: "Kitchen" },
  { id: "o19", text: "Temperature Log: Fill out the temperature sheet", completed: false, section: "Kitchen" },
  { id: "o20", text: "Prep List: Make the list for prep work to do for the day", completed: false, section: "Kitchen" },
];

const defaultClosingItems = [
  // Front Area
  { id: "c1", text: "Empty and throw away all garbage and recycling", completed: false, section: "Front" },
  { id: "c2", text: "Clean and wipe all tables; refill napkins, dispensers, and caddies if needed", completed: false, section: "Front" },
  { id: "c3", text: "Clean and sanitize washrooms; refill all supplies if needed", completed: false, section: "Front" },
  { id: "c4", text: "Turn off the TV menus", completed: false, section: "Front" },
  { id: "c5", text: "Turn off all three tablets (Master, Customer, Kitchen) and remove from charging overnight", completed: false, section: "Front" },
  { id: "c6", text: "Keep debit machine ON charging", completed: false, section: "Front" },
  { id: "c7", text: "Place all display buns and dipping sauces in cooler every night", completed: false, section: "Front" },
  { id: "c8", text: "Fully fill up the Pepsi cooler", completed: false, section: "Front" },
  { id: "c9", text: "Sweep and mop the front floor", completed: false, section: "Front" },
  { id: "c10", text: "Turn off OPEN sign and lock the door at exact closing time", completed: false, section: "Front" },
  // Kitchen Area
  { id: "c11", text: "Clean all dishes properly", completed: false, section: "Kitchen" },
  { id: "c12", text: "Clean hot plate with charcoal brick; throw away waste container contents and clean container", completed: false, section: "Kitchen" },
  { id: "c13", text: "Turn off hot plate, fryer, and bun toaster", completed: false, section: "Kitchen" },
  { id: "c14", text: "Remove gravy from hot well and keep in cooler", completed: false, section: "Kitchen" },
  { id: "c15", text: "Stock up line, chef base drawers, and dipping cooler", completed: false, section: "Kitchen" },
  { id: "c16", text: "Stock up milkshake and smoothie supplies (fruits, syrups, etc.)", completed: false, section: "Kitchen" },
  { id: "c17", text: "Cover the line properly at night", completed: false, section: "Kitchen" },
  { id: "c18", text: "Sweep and mop the kitchen floor", completed: false, section: "Kitchen" },
  { id: "c19", text: "Turn off kitchen hood and lights", completed: false, section: "Kitchen" },
  { id: "c20", text: "DOUBLE CHECK: All locks, appliances & lights before leaving", completed: false, section: "Kitchen" },
];

export default function ChecksPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkType, setCheckType] = useState<"opening" | "closing">("opening");
  const [checklistItems, setChecklistItems] = useState(defaultOpeningItems);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "opening" | "closing">("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

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

  const handleCheckTypeChange = (type: "opening" | "closing") => {
    setCheckType(type);
    setChecklistItems(type === "opening" ? defaultOpeningItems : defaultClosingItems);
    setActiveCheckId(null);
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
      setActiveCheckId(null);
      fetchHistory();
    }
    setSaving(false);
  };

  const deleteCheck = async (id: string) => {
    if (!confirm("Delete this check record?")) return;
    await supabase.from("daily_checks").delete().eq("id", id);
    fetchHistory();
  };

  const filteredHistory = historyFilter === "all"
    ? history
    : history.filter((h) => h.check_type === historyFilter);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Daily Kitchen Checks</h1>
        <p className="text-gray-600 mt-1">Complete opening and closing checklists every shift</p>
      </div>

      {/* Check Type Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => handleCheckTypeChange("opening")}
          className={`flex-1 md:flex-none px-6 py-3 rounded-lg font-semibold transition-colors ${
            checkType === "opening"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          ☀️ Opening Check
        </button>
        <button
          onClick={() => handleCheckTypeChange("closing")}
          className={`flex-1 md:flex-none px-6 py-3 rounded-lg font-semibold transition-colors ${
            checkType === "closing"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🌙 Closing Check
        </button>
      </div>

      {/* Active Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 mb-8">
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
          <button
            onClick={saveCheck}
            disabled={saving || completedCount === 0}
            className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
              saving || completedCount === 0
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : allCompleted
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-green-500 text-white hover:bg-green-600"
            }`}
          >
            {saving ? "Saving..." : allCompleted ? "✓ Complete & Save" : "Save Partial Check"}
          </button>
          {!allCompleted && completedCount > 0 && (
            <p className="text-center text-sm text-amber-600 mt-2">
              ⚠ {totalCount - completedCount} items remaining
            </p>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-gray-200">
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
              const completedItems = items.filter((i: any) => i.completed).length;
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
                        {items.map((item: any) => (
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
      </div>
    </div>
  );
}
