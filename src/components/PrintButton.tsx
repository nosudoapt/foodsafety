"use client";

// Print / PDF export (Patch 7). Sends the page to the browser's print dialog —
// "Save as PDF" lives there. Pages pair this with a `hidden print:block`
// #print-section holding the full, unfiltered content; chrome is marked
// print:hidden (see src/app/between-the-buns/layout.tsx for the shared header).
export default function PrintButton({
  label = "Print / Save PDF",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`print:hidden inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors ${className}`}
    >
      🖨️ {label}
    </button>
  );
}
