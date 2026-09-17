"use client";

import { useState } from "react";
import { recipes } from "@/lib/btb-recipes";

export default function PrepManualPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredRecipes = recipes.filter(
    (recipe) =>
      recipe.name.toLowerCase().includes(search.toLowerCase()) ||
      recipe.ingredients.some((ing) =>
        ing.item.toLowerCase().includes(search.toLowerCase())
      )
  );

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
              <h1 className="text-xl font-bold text-gray-900">Prep Manual</h1>
              <p className="text-xs text-gray-500">Between the Buns © 2020 Version 2.0</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
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
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900 bg-white"
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

          <p className="text-xs text-gray-500 mt-2">
            {filteredRecipes.length} of {recipes.length} recipes
          </p>
        </div>
      </div>

      {/* Recipe List */}
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {filteredRecipes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No recipes found</p>
            <p className="text-gray-400 text-sm mt-1">
              Try searching for a different recipe or ingredient
            </p>
          </div>
        ) : (
          filteredRecipes.map((recipe) => {
            const isExpanded = expandedId === recipe.id;
            return (
              <div
                key={recipe.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                {/* Recipe Header - Clickable */}
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : recipe.id)
                  }
                  className="w-full px-4 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        #{recipe.id}
                      </span>
                      <h2 className="font-semibold text-gray-900">
                        {recipe.name}
                      </h2>
                    </div>
                    {recipe.yield && (
                      <p className="text-xs text-gray-500 mt-1">
                        Yield: {recipe.yield}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-400 ml-2">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {/* Ingredients */}
                    <div className="mt-4">
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                        Ingredients
                      </h3>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <ul className="space-y-1">
                          {recipe.ingredients.map((ing, idx) => (
                            <li
                              key={idx}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                              <span className="text-gray-900 font-medium">
                                {ing.item}:
                              </span>
                              <span className="text-gray-600">
                                {ing.amount}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Method */}
                    <div className="mt-4">
                      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
                        Method
                      </h3>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <ol className="space-y-2">
                          {recipe.method.map((step, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2 text-sm"
                            >
                              <span className="font-bold text-red-600 flex-shrink-0">
                                {idx + 1}.
                              </span>
                              <span className="text-gray-700">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>

                    {/* Yield */}
                    {recipe.yield && (
                      <div className="mt-3 text-sm text-gray-600">
                        <span className="font-semibold">Yield:</span>{" "}
                        {recipe.yield}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-xs text-gray-400">
          © Between the Buns 2020 Version 2.0 — Content is read-only
        </p>
      </div>
    </div>
  );
}
