"use client";

import { useState } from "react";
import {
  menuItems,
  stationColors,
  ingredientName,
  ingredientStation,
} from "@/lib/btb-menu";
import PrintButton from "@/components/PrintButton";
import BtbWordmark from "@/components/BtbWordmark";

export default function MenuPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = ["All", ...new Set(menuItems.map((item) => item.category))];
  const categoryOrder = [...new Set(menuItems.map((item) => item.category))];

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.ingredients.some((ing) =>
        ingredientName(ing).toLowerCase().includes(search.toLowerCase())
      );
    const matchesCategory =
      activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[#fdf8e8]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="min-w-0">
              <BtbWordmark className="text-lg sm:text-xl justify-start" />
              <p className="text-xs text-[#b65a2e] font-semibold mt-1">Recipe Cheat Sheets — Menu Specifications</p>
            </div>
            <div className="ml-auto">
              <PrintButton />
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
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E07B2E] text-gray-900 bg-white"
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
                    ? "bg-[#E07B2E] text-white"
                    : "bg-[#f3ead3] text-[#7a5230] hover:bg-[#ead9b8]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Station colour legend — matches the printed cheat sheets */}
          <div className="flex items-center gap-3 mt-2 text-[11px] font-bold">
            {(Object.keys(stationColors) as (keyof typeof stationColors)[]).map((key) => (
              <span key={key} style={{ color: stationColors[key].color }}>
                {stationColors[key].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3 print:hidden">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No recipes found</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const key = `${item.category}-${item.name}`;
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
                        {item.category}
                      </span>
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
                          {item.ingredients.map((ing, idx) => {
                            const station = ingredientStation(ing);
                            const color = station ? stationColors[station].color : "#111827";
                            return (
                              <li key={idx} className="flex items-center gap-2 text-sm">
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="font-semibold" style={{ color }}>
                                  {ingredientName(ing)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="text-center py-6 print:hidden">
          <p className="text-xs text-gray-400">© Between the Buns — Recipe Cheat Sheets</p>
        </div>
      </div>

      {/* Print / PDF export — every recipe, grouped by category, no search or tab filter */}
      <div id="print-section" className="hidden print:block max-w-4xl mx-auto px-4 py-6 text-gray-900">
        <div className="mb-5 border-b border-gray-400 pb-3">
          <h1 className="text-2xl font-bold">Recipe Cheat Sheets</h1>
          <p className="text-xs mt-1">
            Between the Buns — Menu Specifications — {menuItems.length} recipes
          </p>
          <p className="text-[11px] mt-1 font-bold flex gap-3">
            {(Object.keys(stationColors) as (keyof typeof stationColors)[]).map((key) => (
              <span key={key} style={{ color: stationColors[key].color }}>
                {stationColors[key].label}
              </span>
            ))}
          </p>
        </div>

        {categoryOrder.map((cat) => (
          <section key={cat} className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide border-b border-gray-300 pb-1 mb-2">
              {cat}
            </h2>
            {menuItems
              .filter((item) => item.category === cat)
              .map((item) => (
                <div
                  key={`${item.category}-${item.name}`}
                  className="mb-3 break-inside-avoid"
                >
                  <h3 className="font-semibold">{item.name}</h3>
                  <ul className="text-sm mt-1 space-y-0.5">
                    {item.ingredients.map((ing, idx) => {
                      const station = ingredientStation(ing);
                      const color = station ? stationColors[station].color : "#111827";
                      return (
                        <li
                          key={idx}
                          className="font-semibold"
                          style={{ color, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
                        >
                          • {ingredientName(ing)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </section>
        ))}

        <p className="text-xs text-gray-500 text-center mt-6">
          © Between the Buns — Recipe Cheat Sheets
        </p>
      </div>
    </div>
  );
}
