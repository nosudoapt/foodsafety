"use client";

import { useState } from "react";
import { menuItems, procedures, stationColors } from "@/lib/btb-menu";

export default function MenuPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = ["All", ...new Set(menuItems.map((item) => item.category))];

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.ingredients.some((ing) =>
        ing.toLowerCase().includes(search.toLowerCase())
      );
    const matchesCategory =
      activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[#fdf8e8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">BTB</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Recipe Cheat Sheets</h1>
              <p className="text-xs text-gray-500">Between the Buns — Menu Specifications</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes or ingredients..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? "bg-red-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Station Legend */}
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            <span className="text-gray-500 font-medium">Stations:</span>
            {Object.entries(stationColors).map(([key, val]) => (
              <span key={key} className={`px-2 py-0.5 rounded-full font-bold ${val.bg} ${val.text}`}>
                {val.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No recipes found</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const key = `${item.section}-${item.name}`;
            const isExpanded = expandedId === key;
            return (
              <div
                key={key}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : key)}
                  className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                        {item.section}
                      </span>
                      {item.station && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            stationColors[item.station].bg
                          } ${stationColors[item.station].text}`}
                        >
                          {stationColors[item.station].label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-400 ml-2">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-3">
                      <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">
                        Ingredients
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <ul className="space-y-1">
                          {item.ingredients.map((ing, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                              <span className="text-gray-900">{ing}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Procedures Section - filter based on search */}
        {(() => {
          const relevantProcedures = Object.entries(procedures).filter(([key]) => {
            if (!search) return true;
            return (
              key.toLowerCase().includes(search.toLowerCase()) ||
              procedures[key as keyof typeof procedures].title.toLowerCase().includes(search.toLowerCase())
            );
          });
          if (relevantProcedures.length === 0) return null;
          return (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Procedures</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {relevantProcedures.map(([key, proc]) => (
                  <div
                    key={key}
                    className="bg-white rounded-xl border border-gray-200 p-4"
                  >
                    <h3 className="font-bold text-gray-900 mb-2">{proc.title}</h3>
                    <ol className="space-y-1">
                      {proc.steps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="font-bold text-red-600 flex-shrink-0">
                            {idx + 1}.
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="text-center py-6">
          <p className="text-xs text-gray-400">© Between the Buns — Recipe Cheat Sheets</p>
        </div>
      </div>
    </div>
  );
}
