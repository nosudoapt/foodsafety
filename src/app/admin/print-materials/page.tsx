"use client";

import { useState } from "react";

// Ready-to-print forms and letter templates. Everything renders to a clean
// print sheet via window.print() — no external design tools needed.

interface Material {
  id: string;
  title: string;
  category: "Log" | "Sign" | "Letter" | "Checklist";
  description: string;
  render: () => React.ReactNode;
}

const blankRows = (n: number) =>
  Array.from({ length: n }).map((_, i) => (
    <tr key={i}>
      <td className="border border-gray-400 h-8" />
      <td className="border border-gray-400 h-8" />
      <td className="border border-gray-400 h-8" />
      <td className="border border-gray-400 h-8" />
    </tr>
  ));

const materials: Material[] = [
  {
    id: "temp-log",
    title: "Temperature Log",
    category: "Log",
    description: "Blank daily fridge / freezer / cooking temperature sheet.",
    render: () => (
      <>
        <h1 className="text-2xl font-bold">Daily Temperature Log</h1>
        <p className="text-sm text-gray-600 mb-4">Date: __________   Recorded by: __________</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-gray-400 p-2 text-left">Time</th>
              <th className="border border-gray-400 p-2 text-left">Unit / Item</th>
              <th className="border border-gray-400 p-2 text-left">Temp (°C)</th>
              <th className="border border-gray-400 p-2 text-left">Initials</th>
            </tr>
          </thead>
          <tbody>{blankRows(16)}</tbody>
        </table>
      </>
    ),
  },
  {
    id: "cleaning-log",
    title: "Cleaning Log",
    category: "Log",
    description: "Weekly cleaning schedule sign-off sheet.",
    render: () => (
      <>
        <h1 className="text-2xl font-bold">Cleaning Schedule Sign-Off</h1>
        <p className="text-sm text-gray-600 mb-4">Week of: __________</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-gray-400 p-2 text-left">Task</th>
              <th className="border border-gray-400 p-2 text-left">Date</th>
              <th className="border border-gray-400 p-2 text-left">Done by</th>
              <th className="border border-gray-400 p-2 text-left">Checked</th>
            </tr>
          </thead>
          <tbody>{blankRows(16)}</tbody>
        </table>
      </>
    ),
  },
  {
    id: "delivery-log",
    title: "Delivery Log",
    category: "Log",
    description: "Goods-in record with temperature and condition check.",
    render: () => (
      <>
        <h1 className="text-2xl font-bold">Delivery / Goods-In Log</h1>
        <p className="text-sm text-gray-600 mb-4">Date: __________</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-gray-400 p-2 text-left">Supplier</th>
              <th className="border border-gray-400 p-2 text-left">Item</th>
              <th className="border border-gray-400 p-2 text-left">Temp / Condition</th>
              <th className="border border-gray-400 p-2 text-left">Accepted?</th>
            </tr>
          </thead>
          <tbody>{blankRows(14)}</tbody>
        </table>
      </>
    ),
  },
  {
    id: "handwash-sign",
    title: "Hand-Wash Sign",
    category: "Sign",
    description: "Wall poster: 'Now Wash Your Hands'.",
    render: () => (
      <div className="text-center py-16">
        <div className="text-7xl mb-6">🧼</div>
        <h1 className="text-5xl font-extrabold mb-4">NOW WASH<br />YOUR HANDS</h1>
        <p className="text-xl text-gray-600">Employees must wash hands before returning to work</p>
      </div>
    ),
  },
  {
    id: "allergen-sign",
    title: "Allergen Notice",
    category: "Sign",
    description: "Customer-facing allergen awareness notice.",
    render: () => (
      <div className="text-center py-12">
        <div className="text-6xl mb-6">⚠️</div>
        <h1 className="text-4xl font-extrabold mb-4">ALLERGEN INFORMATION</h1>
        <p className="text-lg text-gray-700 max-w-lg mx-auto">
          Some of our dishes contain allergens. Please speak to a member of staff
          before ordering if you have a food allergy or intolerance.
        </p>
      </div>
    ),
  },
  {
    id: "closure-letter",
    title: "Temporary Closure Notice",
    category: "Letter",
    description: "Door notice for planned or emergency closure.",
    render: () => (
      <div className="text-center py-16">
        <h1 className="text-4xl font-extrabold mb-6">We&apos;re Temporarily Closed</h1>
        <p className="text-lg text-gray-700 mb-2">We apologise for any inconvenience.</p>
        <p className="text-lg text-gray-700">We will reopen on: ____________________</p>
        <p className="mt-8 text-gray-500">For enquiries: ____________________</p>
      </div>
    ),
  },
  {
    id: "disciplinary-letter",
    title: "Disciplinary Letter",
    category: "Letter",
    description: "Editable template for a formal staff warning.",
    render: () => (
      <>
        <h1 className="text-2xl font-bold mb-6">Confidential — Disciplinary Notice</h1>
        <p className="mb-2">Date: ____________________</p>
        <p className="mb-2">To: ____________________</p>
        <p className="mb-6">From: ____________________</p>
        <p className="mb-4 leading-relaxed">
          This letter is to formally advise you of a concern regarding your conduct /
          performance, specifically:
        </p>
        <div className="border border-gray-300 h-24 mb-4" />
        <p className="mb-4 leading-relaxed">
          You are required to improve in the following areas with immediate effect:
        </p>
        <div className="border border-gray-300 h-24 mb-6" />
        <p className="mb-2">Employee signature: ____________________</p>
        <p>Manager signature: ____________________</p>
      </>
    ),
  },
  {
    id: "opening-checklist",
    title: "Opening Checklist",
    category: "Checklist",
    description: "Daily open-up checklist for staff to tick off.",
    render: () => (
      <>
        <h1 className="text-2xl font-bold mb-4">Daily Opening Checklist</h1>
        <p className="text-sm text-gray-600 mb-4">Date: __________   Opened by: __________</p>
        <ul className="space-y-3 text-lg">
          {[
            "Fridge & freezer temps recorded",
            "Hot-holding units switched on",
            "Hand-wash stations stocked",
            "Food prep areas sanitised",
            "First deliveries checked in",
            "Till float counted",
            "Front-of-house clean & tidy",
          ].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="inline-block w-6 h-6 border-2 border-gray-400 rounded" /> {t}
            </li>
          ))}
        </ul>
      </>
    ),
  },
];

const catColors: Record<Material["category"], string> = {
  Log: "bg-blue-100 text-blue-700",
  Sign: "bg-amber-100 text-amber-700",
  Letter: "bg-purple-100 text-purple-700",
  Checklist: "bg-green-100 text-green-700",
};

export default function PrintMaterialsPage() {
  const [active, setActive] = useState<Material | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Print Materials</h1>
        <p className="text-sm text-gray-500">
          Ready-to-print logs, signs, letters and checklists. Preview, then print.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {materials.map((m) => (
          <button
            key={m.id}
            onClick={() => setActive(m)}
            className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-red-300 hover:shadow-sm transition"
          >
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${catColors[m.category]}`}>
              {m.category.toUpperCase()}
            </span>
            <h3 className="font-bold text-gray-900 mt-2">{m.title}</h3>
            <p className="text-sm text-gray-500 mt-1">{m.description}</p>
            <span className="inline-block mt-3 text-sm font-semibold text-red-600">Preview & print →</span>
          </button>
        ))}
      </div>

      {/* Preview / print modal */}
      {active && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto print:max-h-none print:rounded-none print:shadow-none">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 print:hidden">
              <h3 className="font-bold text-gray-900">{active.title}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={() => setActive(null)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
            <div id="print-sheet" className="p-8 print:p-0 text-gray-900">
              {active.render()}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-sheet, #print-sheet * { visibility: visible; }
          #print-sheet { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
