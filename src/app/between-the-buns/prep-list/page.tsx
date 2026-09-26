"use client";

import { useState } from "react";
import { prepGroups } from "@/lib/btb-prep-list";

interface PrepEntry {
  par: string;
  oh: string;
  make: string;
  initial: string;
}

type PrepData = Record<string, PrepEntry>;

interface SavedPrepList {
  id: string;
  date: string;
  day: string;
  data: PrepData;
  savedAt: string;
}

export default function PrepListPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [day, setDay] = useState(() =>
    new Date().toLocaleDateString("en-US", { weekday: "long" })
  );
  const [prepData, setPrepData] = useState<PrepData>({});
  const [savedLists, setSavedLists] = useState<SavedPrepList[]>([]);
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [historyFilter, setHistoryFilter] = useState<string>("");

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    const d = new Date(newDate + "T12:00:00");
    setDay(d.toLocaleDateString("en-US", { weekday: "long" }));
  };

  const updateEntry = (itemName: string, field: keyof PrepEntry, value: string) => {
    setPrepData((prev) => {
      const current = prev[itemName] || { par: "", oh: "", make: "", initial: "" };
      const updated = { ...current, [field]: value };

      // Auto-calculate Make = Par - OH (only when both are numbers)
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

  const savePrepList = () => {
    const newList: SavedPrepList = {
      id: Date.now().toString(),
      date,
      day,
      data: { ...prepData },
      savedAt: new Date().toISOString(),
    };
    setSavedLists((prev) => [newList, ...prev].slice(0, 7));
    setActiveTab("history");
  };

  const loadPrepList = (list: SavedPrepList) => {
    setDate(list.date);
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
      })
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
      })
    );
    return filled;
  };

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
              <h1 className="text-xl font-bold text-gray-900">Daily Prep List</h1>
              <p className="text-xs text-gray-500">Between the Buns — Fill daily, keep records for 7 days</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("today")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "today"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Today&apos;s Prep
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "history"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              History ({savedLists.length}/7)
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
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
                {getFilledCount()} of {getTotalItems()} items filled
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
                      <div className="grid grid-cols-[1fr_50px_40px_40px_45px_40px] gap-1 px-4 py-1 bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                        <span>Item</span>
                        <span>Unit</span>
                        <span>Par</span>
                        <span>OH</span>
                        <span>Make</span>
                        <span>Init</span>
                      </div>

                      {/* Items */}
                      {section.items.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          className={`grid grid-cols-[1fr_50px_40px_40px_45px_40px] gap-1 px-4 py-1.5 items-center ${
                            itemIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                          } border-b border-gray-50`}
                        >
                          <span className="text-xs font-medium text-gray-900 truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-gray-500">{item.unit}</span>
                          <input
                            type="text"
                            value={prepData[item.name]?.par || ""}
                            onChange={(e) => updateEntry(item.name, "par", e.target.value)}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-white focus:ring-1 focus:ring-red-500 text-center"
                          />
                          <input
                            type="text"
                            value={prepData[item.name]?.oh || ""}
                            onChange={(e) => updateEntry(item.name, "oh", e.target.value)}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-white focus:ring-1 focus:ring-red-500 text-center"
                          />
                          <input
                            type="text"
                            value={prepData[item.name]?.make || ""}
                            readOnly
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-gray-50 text-center font-bold"
                            title="Auto-calculated: Par - OH"
                          />
                          <input
                            type="text"
                            value={prepData[item.name]?.initial || ""}
                            onChange={(e) => updateEntry(item.name, "initial", e.target.value)}
                            className="w-full px-1 py-0.5 text-[11px] border border-gray-200 rounded text-gray-900 bg-white focus:ring-1 focus:ring-red-500 text-center"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Save Button */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={savePrepList}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Save Prep List
              </button>
              <button
                onClick={() => setPrepData({})}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Clear All
              </button>
            </div>
          </>
        ) : (
          /* History Tab */
          <div className="space-y-4">
            {savedLists.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p className="text-gray-500">No saved prep lists yet</p>
                <p className="text-gray-400 text-sm mt-1">
                  Fill out today&apos;s prep list and save it
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
                      <button
                        onClick={() => deletePrepList(list.id)}
                        className="text-sm text-gray-400 hover:text-red-500"
                      >
                        🗑️
                      </button>
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
