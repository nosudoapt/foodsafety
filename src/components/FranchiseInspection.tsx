"use client";

import { useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Between the Buns – Franchise Inspection
// Weighted scoring, photo proofs, CSV export, editable locations.
// Rendered as a card on the BTB hub (corporate view) → /between-the-buns/
// franchise-inspection, gated by the "franchise_inspection" feature.
// ---------------------------------------------------------------------------

const APP_VERSION = "v1.2";

type Answer = "yes" | "no" | "na" | null;
type CategoryKey = "environment" | "product" | "service";

interface ChecklistItem {
  id: string;
  text: string;
  weight: number;
  answer: Answer;
  comment: string;
  photos: string[]; // object URLs for preview only (not persisted)
}

const categoryLabels: Record<CategoryKey, string> = {
  environment: "Environment",
  product: "Product",
  service: "Service",
};

// Environment checklist — weights (wN) come straight from the BTB rubric.
const environmentItems: Omit<ChecklistItem, "answer" | "comment" | "photos">[] = [
  { id: "env1", text: "Building exterior is clean, well-maintained; signage working.", weight: 1 },
  { id: "env2", text: "Music is playing at an appropriate level.", weight: 0.5 },
  { id: "env3", text: "Menu screens working; front counter is clean.", weight: 1 },
  { id: "env4", text: "Pepsi cooler stocked with Pepsi-branded items only.", weight: 0.5 },
  { id: "env5", text: "Floors are clean and free of debris.", weight: 1 },
  { id: "env6", text: "Table tops/bases clean and free of debris.", weight: 1 },
  { id: "env7", text: "Artwork clean, approved, well presented.", weight: 0.5 },
  { id: "env8", text: "Public washrooms clean and well maintained.", weight: 1.5 },
  { id: "env9", text: "Kitchen appears clean and organized upon entry.", weight: 1.5 },
  { id: "env10", text: "Kitchen floors clean and free of debris.", weight: 1 },
  { id: "env11", text: "Dry storage tidy, labeled, rotated, appropriately stocked.", weight: 1 },
  { id: "env12", text: "Cooking equipment clean, functional, and well maintained.", weight: 1.5 },
  { id: "env13", text: "Catch trays beneath broiler/flat top are clean and maintained.", weight: 1 },
  { id: "env14", text: "Sinks and drains working and in good condition.", weight: 1 },
  { id: "env15", text: "First aid kit is well stocked and accessible.", weight: 2 },
  { id: "env16", text: "Overall maintenance & cleanliness meet BTB expectations.", weight: 1 },
];

// Product / Service checklists per the BTB rubric.
const productItems: Omit<ChecklistItem, "answer" | "comment" | "photos">[] = [
  { id: "prod1", text: "Features/specials are run according to approved programs.", weight: 0.5 },
  { id: "prod2", text: "Food is made to specifications at ALL times.", weight: 1.5 },
  { id: "prod3", text: "Food looks appealing and well assembled.", weight: 1 },
  { id: "prod4", text: "Portion sizes accurate per BTB specifications.", weight: 1 },
  { id: "prod5", text: "Garbage & cardboard levels are maintained.", weight: 0.5 },
  { id: "prod6", text: "Knives sharp, clean, stored properly.", weight: 1 },
  { id: "prod7", text: "Products used in kitchen are BTB-approved items only.", weight: 1 },
  { id: "prod8", text: "All ingredients come from approved suppliers.", weight: 1 },
  { id: "prod9", text: "Line ingredients fresh and made correctly.", weight: 1.5 },
  { id: "prod10", text: "Proper sanitation fundamentals adhered to at ALL times.", weight: 2 },
  { id: "prod11", text: "Deep fryer oil filtered daily; clean condition.", weight: 1.5 },
  { id: "prod12", text: "Hand soap & paper towel dispensers clean, stocked, in repair.", weight: 1.5 },
  { id: "prod13", text: "Equipment maintains safe temperatures for storage.", weight: 2 },
  { id: "prod14", text: "Cooler clean, organized, proper temperature.", weight: 1.5 },
  { id: "prod15", text: "Walk-in cooler products labeled and rotated.", weight: 1 },
  { id: "prod16", text: "Walk-in items made to specification.", weight: 1 },
  { id: "prod17", text: "Walk-in stock levels properly managed.", weight: 1 },
  { id: "prod18", text: "Freezer clean, organized, proper temperature.", weight: 1.5 },
  { id: "prod19", text: "Overall food preparation meets BTB expectations.", weight: 1 },
  { id: "prod20", text: "Overall drink preparation meets BTB expectations.", weight: 0.5 },
];
const serviceItems: Omit<ChecklistItem, "answer" | "comment" | "photos">[] = [
  { id: "svc1", text: "When entering the room, are customers being greeted immediately at all times?", weight: 1.5 },
  { id: "svc2", text: "Are all staff wearing appropriate uniforms? Jewelry? Clean and well presented?", weight: 1 },
  { id: "svc3", text: "Is food arriving at the tables in an appropriate amount of time? 12–15 Lunch, 15–20 Dinner?", weight: 1.5 },
  { id: "svc4", text: "Is the quality of the food being delivered acceptable? (Required)", weight: 2 },
  { id: "svc5", text: "Are tables quickly being cleaned and reset after one is emptied? (Required)", weight: 1.5 },
  { id: "svc6", text: "Overall, is the service level meeting the expectations set forth by BTB? (Required)", weight: 2 },
];

function seed(
  base: Omit<ChecklistItem, "answer" | "comment" | "photos">[]
): ChecklistItem[] {
  return base.map((i) => ({ ...i, answer: null, comment: "", photos: [] }));
}

const DEFAULT_LOCATIONS = [
  "Brighton (Saskatoon)",
  "Idylwyld (Saskatoon)",
  "Prince Albert – 2nd Ave W",
  "Rosthern",
  "Hudson Bay",
  "Nipawin",
  "Warman",
  "Melfort",
  "Moose Jaw",
  "Yorkton",
];
const LOCATIONS_KEY = "btb.franchiseInspection.locations";

// Score a category: earned = sum of weights answered YES; possible = sum of
// weights answered YES or NO. N/A and unanswered are excluded from both.
function scoreCategory(items: ChecklistItem[]) {
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    if (item.answer === "yes") {
      earned += item.weight;
      possible += item.weight;
    } else if (item.answer === "no") {
      possible += item.weight;
    }
  }
  const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  return { earned, possible, pct };
}

export default function FranchiseInspection({
  readOnly = false,
}: {
  readOnly?: boolean;
}) {
  const [inspectionDate, setInspectionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [location, setLocation] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [email, setEmail] = useState("");
  const [photosEnabled, setPhotosEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<CategoryKey | "admin">("environment");
  const [serviceComments, setServiceComments] = useState("");

  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [locationsText, setLocationsText] = useState(DEFAULT_LOCATIONS.join("\n"));

  const [responses, setResponses] = useState<Record<CategoryKey, ChecklistItem[]>>({
    environment: seed(environmentItems),
    product: seed(productItems),
    service: seed(serviceItems),
  });

  // Load editable locations from localStorage.
  useEffect(() => {
    const load = async () => {
      try {
        const raw = localStorage.getItem(LOCATIONS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            setLocations(parsed);
            setLocationsText(parsed.join("\n"));
          }
        }
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const persistLocations = (next: string[]) => {
    setLocations(next);
    try {
      localStorage.setItem(LOCATIONS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const scores = useMemo(
    () => ({
      environment: scoreCategory(responses.environment),
      product: scoreCategory(responses.product),
      service: scoreCategory(responses.service),
    }),
    [responses]
  );

  const overall = useMemo(() => {
    const earned =
      scores.environment.earned + scores.product.earned + scores.service.earned;
    const possible =
      scores.environment.possible +
      scores.product.possible +
      scores.service.possible;
    return possible > 0 ? Math.round((earned / possible) * 100) : 0;
  }, [scores]);

  const setAnswer = (cat: CategoryKey, id: string, answer: Answer) => {
    if (readOnly) return;
    setResponses((prev) => ({
      ...prev,
      [cat]: prev[cat].map((item) =>
        item.id === id
          ? { ...item, answer: item.answer === answer ? null : answer }
          : item
      ),
    }));
  };

  const setComment = (cat: CategoryKey, id: string, comment: string) => {
    setResponses((prev) => ({
      ...prev,
      [cat]: prev[cat].map((item) =>
        item.id === id ? { ...item, comment } : item
      ),
    }));
  };

  const addPhotos = (cat: CategoryKey, id: string, files: FileList | null) => {
    if (!files || !files.length) return;
    const urls = Array.from(files).map((f) => URL.createObjectURL(f));
    setResponses((prev) => ({
      ...prev,
      [cat]: prev[cat].map((item) =>
        item.id === id ? { ...item, photos: [...item.photos, ...urls] } : item
      ),
    }));
  };

  const resetAll = () => {
    if (!confirm("Reset the whole inspection? This clears all answers.")) return;
    setResponses({
      environment: seed(environmentItems),
      product: seed(productItems),
      service: seed(serviceItems),
    });
    setInspectorName("");
    setEmail("");
    setLocation("");
    setServiceComments("");
  };

  const exportCsv = () => {
    const rows: string[][] = [["Category", "Item", "Weight", "Answer", "Comment"]];
    (Object.keys(categoryLabels) as CategoryKey[]).forEach((cat) => {
      responses[cat].forEach((item) => {
        rows.push([
          categoryLabels[cat],
          item.text,
          String(item.weight),
          item.answer ? item.answer.toUpperCase() : "",
          item.comment,
        ]);
      });
    });
    rows.push(["Service", "Overall Service Comments", "", "", serviceComments]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `btb-inspection-${location || "location"}-${inspectionDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submit = () => {
    if (!location) return alert("Please select a location.");
    if (!inspectorName.trim()) return alert("Please enter the inspector name.");
    if (!serviceComments.trim())
      return alert("Overall Service Comments are required (Service tab).");
    alert(
      `Inspection submitted for ${location}.\nOverall score: ${overall}%` +
        (email ? `\nA PDF copy will be sent to ${email}.` : "")
    );
  };

  const saveLocations = () => {
    const parsed = locationsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    persistLocations(parsed);
    if (location && !parsed.includes(location)) setLocation("");
    alert(`Saved ${parsed.length} location${parsed.length === 1 ? "" : "s"}.`);
  };

  const resetLocations = () => {
    persistLocations(DEFAULT_LOCATIONS);
    setLocationsText(DEFAULT_LOCATIONS.join("\n"));
  };

  const testEmail = () => {
    if (!email.trim()) return alert("Enter an email above first (for PDF copy).");
    alert(`Test email would be sent to ${email}.`);
  };

  const scoreCards = [
    { label: "Environment Score", value: scores.environment.pct },
    { label: "Product Score", value: scores.product.pct },
    { label: "Service Score", value: scores.service.pct },
    { label: "Overall Score", value: overall },
  ];

  const tabs: (CategoryKey | "admin")[] = ["environment", "product", "service", "admin"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Between the Buns – Franchise Inspection
        </h1>
        <p className="text-sm text-gray-500">
          Weighted scoring, photo proofs, CSV export, editable locations.{" "}
          <span className="text-gray-400">{APP_VERSION} replit</span>
        </p>
      </div>

      {/* Inspection Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-bold text-gray-900 mb-3">Inspection Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inspection Date
            </label>
            <input
              type="date"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            >
              <option value="">Select location…</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inspector Name
            </label>
            <input
              type="text"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email (for PDF copy)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@btbrestaurants.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={photosEnabled}
            onChange={(e) => setPhotosEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-red-600"
          />
          Enable photo uploads (optional)
        </label>
      </div>

      {/* Score Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {scoreCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-4 text-center"
          >
            <p className="text-2xl font-bold text-gray-900">{card.value}%</p>
            <p className="text-xs text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              activeTab === tab
                ? "border-red-600 text-red-700"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "admin" ? "Admin" : categoryLabels[tab]}
          </button>
        ))}
      </div>

      {/* Checklist tabs */}
      {activeTab !== "admin" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">
              {categoryLabels[activeTab]} Checklist
            </h3>
          </div>
          {responses[activeTab].length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              No checklist items yet. Add items from the Admin tab.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {responses[activeTab].map((item) => (
                <div key={item.id} className="px-4 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-900">
                      {item.text}{" "}
                      <span className="text-gray-400">(w{item.weight})</span>
                    </p>
                    <div className="flex gap-1 shrink-0">
                      {(["yes", "no", "na"] as const).map((opt) => {
                        const active = item.answer === opt;
                        const activeCls =
                          opt === "yes"
                            ? "bg-green-500 text-white"
                            : opt === "no"
                            ? "bg-red-500 text-white"
                            : "bg-gray-500 text-white";
                        return (
                          <button
                            key={opt}
                            onClick={() => setAnswer(activeTab, item.id, opt)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                              active
                                ? activeCls
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {opt === "na" ? "NA" : opt.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={item.comment}
                    onChange={(e) => setComment(activeTab, item.id, e.target.value)}
                    placeholder="Optional comment"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                  />
                  {photosEnabled && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => addPhotos(activeTab, item.id, e.target.files)}
                        className="block text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700"
                      />
                      {item.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.photos.map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={src}
                              alt="proof"
                              className="h-16 w-16 rounded-lg object-cover border border-gray-200"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overall Service Comments (Service tab only, required) */}
      {activeTab === "service" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Overall Service Comments <span className="text-red-600">(Required)</span>
          </label>
          <textarea
            value={serviceComments}
            onChange={(e) => setServiceComments(e.target.value)}
            placeholder="Enter your comments here..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
          />
        </div>
      )}

      {/* Admin tab — manage locations */}
      {activeTab === "admin" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-1">Admin – Manage Locations</h3>
          <p className="text-sm text-gray-500 mb-3">
            Add/remove locations (one per line). Saved to this browser.
          </p>
          <textarea
            value={locationsText}
            onChange={(e) => setLocationsText(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white font-mono"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={saveLocations}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Save Locations
            </button>
            <button
              onClick={resetLocations}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Reset to Default
            </button>
            <button
              onClick={testEmail}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Test Email
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => window.print()}
          className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
        >
          Print / Save PDF
        </button>
        <button
          onClick={exportCsv}
          className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
        >
          Export CSV
        </button>
        <button
          onClick={resetAll}
          className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={submit}
          disabled={readOnly}
          className="bg-red-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit Inspection
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 pt-2">
        © 2026 Between the Buns – Internal Use Only
      </p>
    </div>
  );
}
