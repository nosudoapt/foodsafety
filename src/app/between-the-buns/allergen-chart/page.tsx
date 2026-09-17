"use client";

import { bunAllergens, AllergenStatus } from "@/lib/btb-allergens";

function StatusBadge({ status }: { status: AllergenStatus }) {
  if (status === "contains") {
    return (
      <div className="flex items-center justify-center">
        <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">YES</span>
        </div>
      </div>
    );
  }
  if (status === "free") {
    return (
      <div className="flex items-center justify-center">
        <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">FREE</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center">
      <div className="px-2 py-1 bg-amber-100 border border-amber-300 rounded-lg">
        <span className="text-amber-700 text-[10px] font-bold uppercase">
          May Contain
        </span>
      </div>
    </div>
  );
}

export default function AllergenChartPage() {
  return (
    <div className="min-h-screen bg-[#fdf8e8]">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-green-600 text-white">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center">
              <span className="text-3xl">🍔</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-wide">
            <span className="text-orange-200">BETWEEN</span>{" "}
            <span className="text-white">THE</span>{" "}
            <span className="text-green-200">BUNS</span>
          </h1>
          <p className="text-sm text-white/80 mt-1">Bun Allergy Information</p>
        </div>
      </div>

      {/* Chart */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Column Headers */}
        <div className="grid grid-cols-4 bg-green-700 rounded-t-xl overflow-hidden">
          <div className="px-4 py-3 text-white font-bold text-sm text-center">
            BUNS
          </div>
          <div className="px-4 py-3 text-white font-bold text-sm text-center border-l border-green-600">
            DAIRY
          </div>
          <div className="px-4 py-3 text-white font-bold text-sm text-center border-l border-green-600">
            EGG
          </div>
          <div className="px-4 py-3 text-white font-bold text-sm text-center border-l border-green-600">
            GLUTEN
          </div>
        </div>

        {/* Bun Rows */}
        <div className="bg-white rounded-b-xl border border-gray-200 overflow-hidden">
          {bunAllergens.map((bun, idx) => (
            <div
              key={idx}
              className={`grid grid-cols-4 items-center ${
                idx < bunAllergens.length - 1 ? "border-b border-gray-200" : ""
              }`}
            >
              {/* Bun Name */}
              <div className="px-4 py-5 bg-gradient-to-r from-orange-500 to-amber-500">
                <span className="text-white font-bold text-sm uppercase tracking-wide">
                  {bun.name}
                </span>
              </div>

              {/* Dairy */}
              <div className="px-2 py-4 flex items-center justify-center border-l border-gray-200">
                <StatusBadge status={bun.dairy} />
              </div>

              {/* Egg */}
              <div className="px-2 py-4 flex items-center justify-center border-l border-gray-200">
                <StatusBadge status={bun.egg} />
              </div>

              {/* Gluten */}
              <div className="px-2 py-4 flex items-center justify-center border-l border-gray-200">
                <StatusBadge status={bun.gluten} />
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded" />
            <span className="text-gray-700 font-medium">Contains</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded" />
            <span className="text-gray-700 font-medium">Free From</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-100 border border-amber-300 rounded" />
            <span className="text-gray-700 font-medium">May Contain</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            © Between the Buns — Allergen Information
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Always confirm with staff before ordering if you have allergies
          </p>
        </div>
      </div>
    </div>
  );
}
