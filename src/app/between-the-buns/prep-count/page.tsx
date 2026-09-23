"use client";

import { useState } from "react";

interface PrepCountItem {
  par: string;
  oh: string;
  make: string;
  initial: string;
}

type PrepCountData = Record<string, PrepCountItem>;

interface SavedPrepCount {
  id: string;
  date: string;
  data: PrepCountData;
  savedAt: string;
}

const itemGroups: { label: string; items: string[] }[] = [
  {
    label: "Produce & Starches",
    items: [
      "Lettuce", "Tomato", "Red Onions", "Cucumber", "Pickles", "Fries",
      "Coleslaw", "Potato Buns", "Sesame Buns", "Pretzel Buns", "Brioche Buns", "Gluten Free Buns",
    ],
  },
  {
    label: "Sauces & Meats",
    items: [
      "Smoky Mayo", "Honey Mustard", "Chipotle", "Ketchup", "Mustard", "BBQ Sauce",
      "Sriracha", "Buffalo Sauce", "Beef Patties", "Chicken Breast", "Turkey Patty",
      "Lamb Patty", "Elk Patty", "Bison Patty", "Boar Patty", "Veggie Patty",
    ],
  },
  {
    label: "Freezer & Dairy",
    items: [
      "Mozza Sticks", "Onion Rings", "Fried Pickles", "Cheddar Cheese", "Swiss Cheese",
      "Mozza Cheese", "Feta Cheese", "Ice Cream", "Frozen Yogurt",
    ],
  },
];

function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

const RETENTION_DAYS = 7;

function loadSaved(): SavedPrepCount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("btb-prep-counts");
    if (!raw) return [];
    const parsed: SavedPrepCount[] = JSON.parse(raw);
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const kept = parsed.filter((s) => new Date(s.savedAt).getTime() >= cutoff);
    if (kept.length !== parsed.length) {
      localStorage.setItem("btb-prep-counts", JSON.stringify(kept));
    }
    return kept;
  } catch {
    return [];
  }
}

function persistSaved(lists: SavedPrepCount[]) {
  localStorage.setItem("btb-prep-counts", JSON.stringify(lists));
}

export default function PrepCountPage() {
  const [date, setDate] = useState(() => getTodayKey());
  const [data, setData] = useState<PrepCountData>({});
  const [saved, setSaved] = useState<SavedPrepCount[]>(() => loadSaved());
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");

  const totalItems = itemGroups.reduce((sum, g) => sum + g.items.length, 0);

  const getFilledCount = () => {
    let filled = 0;
    itemGroups.forEach((group) =>
      group.items.forEach((item) => {
        if (data[item]?.make) filled++;
      })
    );
    return filled;
  };

  const updateEntry = (itemName: string, field: "par" | "oh" | "initial", value: string) => {
    setData((prev) => {
      const current = prev[itemName] || { par: "", oh: "", make: "", initial: "" };
      const updated = { ...current, [field]: value };

      if (field === "par" || field === "oh") {
        const par = parseFloat(field === "par" ? value : current.par);
        const oh = parseFloat(field === "oh" ? value : current.oh);
        if (!isNaN(par) && !isNaN(oh)) {
          updated.make = String(Math.max(0, par - oh));
        } else {
          updated.make = "";
        }
      }

      return { ...prev, [itemName]: updated };
    });
  };

  const save = () => {
    const entry: SavedPrepCount = {
      id: Date.now().toString(),
      date,
      data: { ...data },
      savedAt: new Date().toISOString(),
    };
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const updated = [entry, ...saved.filter((s) => s.date !== date)]
      .filter((s) => new Date(s.savedAt).getTime() >= cutoff)
      .slice(0, RETENTION_DAYS);
    setSaved(updated);
    persistSaved(updated);
    setActiveTab("history");
  };

  const load = (entry: SavedPrepCount) => {
    setDate(entry.date);
    setData(entry.data);
    setActiveTab("today");
  };

  const deleteEntry = (id: string) => {
    if (!confirm("Delete this prep count?")) return;
    const updated = saved.filter((s) => s.id !== id);
    setSaved(updated);
    persistSaved(updated);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-red-600 text-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <span className="text-red-600 font-bold text-sm">BTB</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Daily Prep Count</h1>
              <p className="text-red-100 text-xs">Between the Buns — MAKE = PAR − OH · 1-week history</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("today")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "today"
                  ? "bg-white text-red-600"
                  : "bg-red-500 text-red-100 hover:bg-red-400"
              }`}
            >
              Today&apos;s Prep Count
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "history"
                  ? "bg-white text-red-600"
                  : "bg-red-500 text-red-100 hover:bg-red-400"
              }`}
            >
              History ({saved.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {activeTab === "today" ? (
          <>
            {/* Date Controls */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Date:</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-red-500"
                />
              </div>
              <button
                onClick={() => setDate(getTodayKey())}
                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 transition-colors"
              >
                Today
              </button>
              <div className="ml-auto text-sm text-gray-600">
                {getFilledCount()} of {totalItems} items filled
              </div>
            </div>

            {/* Three Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {itemGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <h2 className="font-bold text-gray-900 text-sm">{group.label}</h2>
                  </div>

                  {/* Column Headers */}
                  <div className="grid grid-cols-[1fr_40px_40px_50px_45px] gap-1 px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                    <span>Item</span>
                    <span className="text-center">PAR</span>
                    <span className="text-center">OH</span>
                    <span className="text-center">MAKE</span>
                    <span className="text-center">Init</span>
                  </div>

                  {group.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className={`grid grid-cols-[1fr_40px_40px_50px_45px] gap-1 px-3 py-1.5 items-center ${
                        itemIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } border-b border-gray-50`}
                    >
                      <span className="text-xs font-medium text-gray-900 truncate">{item}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={data[item]?.par || ""}
                        onChange={(e) => updateEntry(item, "par", e.target.value)}
                        className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-white focus:ring-1 focus:ring-red-500 text-center"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={data[item]?.oh || ""}
                        onChange={(e) => updateEntry(item, "oh", e.target.value)}
                        className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-white focus:ring-1 focus:ring-red-500 text-center"
                      />
                      <input
                        type="text"
                        value={data[item]?.make || ""}
                        readOnly
                        className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-gray-100 text-center font-bold cursor-not-allowed"
                        title="Auto-calculated: MAKE = PAR − OH"
                      />
                      <input
                        type="text"
                        value={data[item]?.initial || ""}
                        onChange={(e) => updateEntry(item, "initial", e.target.value.toUpperCase())}
                        maxLength={3}
                        className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-white focus:ring-1 focus:ring-red-500 text-center"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={save}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Save Prep Count
              </button>
              <button
                onClick={() => setData({})}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Clear All
              </button>
            </div>
          </>
        ) : (
          /* History Tab */
          <div className="space-y-4">
            {saved.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p className="text-gray-500">No saved prep counts yet</p>
                <p className="text-gray-400 text-sm mt-1">Fill out today&apos;s prep count and save it</p>
              </div>
            ) : (
              saved.map((entry) => {
                const filledCount = Object.values(entry.data).filter((d) => d.make).length;
                return (
                  <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{formatDate(entry.date)}</h3>
                        <p className="text-xs text-gray-500">
                          {filledCount} items filled · Saved {new Date(entry.savedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => load(entry)}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="text-sm text-gray-400 hover:text-red-500"
                        >
                          🗑️
                        </button>
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
