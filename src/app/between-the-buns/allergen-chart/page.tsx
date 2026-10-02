"use client";

import Image from "next/image";
import { bunAllergens, AllergenStatus } from "@/lib/btb-allergens";
import BtbWordmark from "@/components/BtbWordmark";

// Brand palette, sampled from the printed Bun Allergy cheat sheet:
//   cream #fdf8e8 · rust #b65a2e · sage #7fa24e · deep green #1c4a2a · red #d8382c
function StatusCell({ status }: { status: AllergenStatus }) {
  if (status === "contains") {
    return (
      <div className="flex items-center justify-center px-2 py-4 min-h-[64px] border-l border-[#fdf8e8]">
        <div className="w-full max-w-[92px] h-12 rounded-md bg-[#d8382c] flex items-center justify-center">
          <span className="text-white text-[11px] font-bold uppercase tracking-wide">Contains</span>
        </div>
      </div>
    );
  }
  if (status === "free") {
    return (
      <div className="flex items-center justify-center px-2 py-4 min-h-[64px] border-l border-[#fdf8e8]">
        <div className="w-full max-w-[92px] h-12 rounded-md bg-[#1c4a2a] flex items-center justify-center">
          <span className="text-white text-[11px] font-bold uppercase tracking-wide">Free</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center px-2 py-4 min-h-[64px] border-l border-[#fdf8e8]">
      <span className="text-[#b65a2e] text-[11px] font-extrabold uppercase text-center leading-tight">
        May
        <br />
        Contain
      </span>
    </div>
  );
}

export default function AllergenChartPage() {
  return (
    <div className="min-h-screen bg-[#fdf8e8]">
      {/* Header — brand wordmark on cream, matching the printed sheet */}
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4 text-center">
        <BtbWordmark className="text-3xl sm:text-4xl justify-center" />
        <p className="text-sm text-[#b65a2e] font-semibold mt-2 uppercase tracking-wide">
          Bun Allergy Chart
        </p>
      </div>

      {/* Chart */}
      <div className="max-w-2xl mx-auto px-4 pb-6">
        {/* Column Headers */}
        <div className="grid grid-cols-4 bg-[#7fa24e] rounded-t-xl overflow-hidden">
          <div className="px-3 py-3 text-[#fdf8e8] font-bold text-sm text-center uppercase tracking-wide">
            Buns
          </div>
          <div className="px-3 py-3 text-[#fdf8e8] font-bold text-sm text-center uppercase tracking-wide border-l border-[#fdf8e8]/40">
            Dairy
          </div>
          <div className="px-3 py-3 text-[#fdf8e8] font-bold text-sm text-center uppercase tracking-wide border-l border-[#fdf8e8]/40">
            Egg
          </div>
          <div className="px-3 py-3 text-[#fdf8e8] font-bold text-sm text-center uppercase tracking-wide border-l border-[#fdf8e8]/40">
            Gluten
          </div>
        </div>

        {/* Bun Rows */}
        <div className="bg-white rounded-b-xl border border-[#e6dcc0] overflow-hidden">
          {bunAllergens.map((bun, idx) => (
            <div
              key={idx}
              className={`grid grid-cols-4 items-stretch ${
                idx < bunAllergens.length - 1 ? "border-b border-[#e6dcc0]" : ""
              }`}
            >
              {/* Bun Name */}
              <div className="px-4 py-5 bg-[#b65a2e] flex items-center">
                <span className="text-[#fdf8e8] font-bold text-sm uppercase tracking-wide leading-tight">
                  {bun.name}
                </span>
              </div>

              <StatusCell status={bun.dairy} />
              <StatusCell status={bun.egg} />
              <StatusCell status={bun.gluten} />
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#d8382c]" />
            <span className="text-gray-700 font-medium">Contains</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#1c4a2a]" />
            <span className="text-gray-700 font-medium">Free From</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#b65a2e] text-[11px] font-extrabold uppercase">May Contain</span>
            <span className="text-gray-700 font-medium">Possible traces</span>
          </div>
        </div>

        {/* Bun board photo */}
        <div className="mt-8">
          <div className="rounded-2xl overflow-hidden border-4 border-[#b65a2e] shadow-md bg-white">
            <Image
              src="/images/btb-buns-board.jpg"
              alt="The Between the Buns bun board — brioche, gluten free, potato, pretzel and sesame buns with Sriracha, Herbed and Chipotle mayo"
              width={2304}
              height={1300}
              className="w-full h-auto"
              priority
            />
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">
            Our five buns &amp; house mayos — Sriracha, Herbed &amp; Chipotle
          </p>
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
