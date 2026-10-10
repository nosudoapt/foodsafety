"use client";

import { fryerItems } from "@/lib/btb-fryer";
import BtbWordmark from "@/components/BtbWordmark";
import PrintButton from "@/components/PrintButton";

// Fryer Timing & Portions — rebuilt from the printed BTB chart in brand
// colours (cream + rust). The whole surface is the print target: @media print
// hides the app chrome (see layout.tsx) and this renders cleanly to paper/PDF.
export default function FryerTimingPage() {
  return (
    <div id="print-section" className="min-h-screen bg-[#fdf8e8]">
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-4 text-center">
        <BtbWordmark className="text-3xl sm:text-4xl justify-center" />
        <h1 className="text-2xl font-extrabold text-gray-900 mt-3 uppercase tracking-wide">
          Fryer Timing &amp; Portions
        </h1>
        <div className="mt-3 flex justify-center print:hidden">
          <PrintButton />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-10">
        <div className="overflow-hidden rounded-xl border border-[#e6dcc0]">
          {/* Header row */}
          <div className="grid grid-cols-[1.1fr_1.3fr_0.9fr] bg-[#b65a2e] text-[#fdf8e8] font-bold uppercase tracking-wide text-sm">
            <div className="px-4 py-3">Item</div>
            <div className="px-4 py-3 border-l border-[#fdf8e8]/30">Portion</div>
            <div className="px-4 py-3 border-l border-[#fdf8e8]/30 text-center">Fryer Time</div>
          </div>

          {/* Rows */}
          {fryerItems.map((row, idx) => (
            <div
              key={row.item}
              className={`grid grid-cols-[1.1fr_1.3fr_0.9fr] items-center bg-[#fdf8e8] ${
                idx < fryerItems.length - 1 ? "border-b-2 border-[#b65a2e]/35" : ""
              }`}
            >
              <div className="px-4 py-3 font-bold text-gray-900">{row.item}</div>
              <div className="px-4 py-3 border-l border-[#e6dcc0] text-sm font-semibold text-gray-800">
                {row.portion.map((p) => (
                  <div key={p}>{p}</div>
                ))}
              </div>
              <div className="px-4 py-3 border-l border-[#e6dcc0] text-center font-bold text-gray-900">
                {row.time}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          © Between the Buns — Fryer Timing &amp; Portions
        </p>
        <p className="text-center text-xs text-gray-400 mt-1">
          Always cook to the full time — times are minimums for food safety.
        </p>
      </div>
    </div>
  );
}
