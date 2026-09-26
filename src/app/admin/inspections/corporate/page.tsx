"use client";

import { useState } from "react";

interface InspectionItem {
  id: string;
  text: string;
  score: number;
  maxScore: number;
  status: "pass" | "fail" | "na" | null;
  notes: string;
}

interface InspectionSection {
  title: string;
  items: InspectionItem[];
}

interface SavedInspection {
  id: string;
  date: string;
  inspector: string;
  inspectorRole: string;
  sections: InspectionSection[];
  overallScore: number;
  maxScore: number;
  rating: string;
  strengths: string;
  improvements: string;
  actionItems: string[];
  notes: string;
  savedAt: string;
}

const defaultSections: InspectionSection[] = [
  {
    title: "Food Safety Compliance",
    items: [
      { id: "fs1", text: "Temperature logs maintained and accurate", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs2", text: "HACCP procedures followed", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs3", text: "Cross-contamination prevention", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs4", text: "Proper cooking temperatures", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs5", text: "Cooling procedures followed (60→21°C in 2hrs, 21→4°C in 4hrs)", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs6", text: "Allergen management in place", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Cleaning & Sanitation",
    items: [
      { id: "cs1", text: "Daily cleaning schedule followed", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "cs2", text: "Weekly deep cleaning completed", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "cs3", text: "Sanitizer solutions at correct concentration", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "cs4", text: "Before/after cleaning photos documented", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Staff Training & Certifications",
    items: [
      { id: "st1", text: "All staff have valid food handler certificates", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "st2", text: "Training records up to date", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "st3", text: "Staff hygiene standards met", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "st4", text: "WHMIS training completed", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Documentation & Licensing",
    items: [
      { id: "dl1", text: "Business license valid and displayed", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "dl2", text: "Health license current", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "dl3", text: "Insurance documentation available", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "dl4", text: "Food inspection reports on file", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Facility & Equipment",
    items: [
      { id: "fe1", text: "Equipment in good working order", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fe2", text: "Thermometers calibrated and visible", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fe3", text: "Pest control measures in place", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fe4", text: "Waste management compliant", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
];

function getRating(percentage: number): string {
  if (percentage >= 95) return "excellent";
  if (percentage >= 85) return "good";
  if (percentage >= 70) return "satisfactory";
  if (percentage >= 50) return "needs_improvement";
  return "critical";
}

const ratingLabels: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  satisfactory: "Satisfactory",
  needs_improvement: "Needs Improvement",
  critical: "Critical",
};

const ratingColors: Record<string, string> = {
  excellent: "bg-green-100 text-green-700",
  good: "bg-blue-100 text-blue-700",
  satisfactory: "bg-amber-100 text-amber-700",
  needs_improvement: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export default function CorporateInspectionPage() {
  const [sections, setSections] = useState<InspectionSection[]>(defaultSections);
  const [inspectorName, setInspectorName] = useState("");
  const [inspectorRole, setInspectorRole] = useState("Corporate Inspector");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [actionItems, setActionItems] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [savedInspections, setSavedInspections] = useState<SavedInspection[]>([]);
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");

  const updateItemStatus = (sectionIdx: number, itemIdx: number, status: "pass" | "fail" | "na") => {
    setSections((prev) => {
      const updated = [...prev];
      const section = { ...updated[sectionIdx] };
      const items = [...section.items];
      const item = { ...items[itemIdx] };

      if (item.status === status) {
        item.status = null;
        item.score = 0;
      } else {
        item.status = status;
        item.score = status === "pass" ? item.maxScore : status === "fail" ? 0 : item.maxScore;
      }

      items[itemIdx] = item;
      section.items = items;
      updated[sectionIdx] = section;
      return updated;
    });
  };

  const getSectionScore = (section: InspectionSection) => {
    return section.items.reduce((sum, item) => sum + item.score, 0);
  };

  const getSectionMaxScore = (section: InspectionSection) => {
    return section.items.reduce((sum, item) => sum + item.maxScore, 0);
  };

  const getOverallScore = () => {
    return sections.reduce((sum, section) => sum + getSectionScore(section), 0);
  };

  const getMaxScore = () => {
    return sections.reduce((sum, section) => sum + getSectionMaxScore(section), 0);
  };

  const getScorePercentage = () => {
    const max = getMaxScore();
    if (max === 0) return 0;
    return Math.round((getOverallScore() / max) * 100);
  };

  const addActionItem = () => setActionItems((prev) => [...prev, ""]);
  const updateActionItem = (idx: number, value: string) => {
    setActionItems((prev) => prev.map((item, i) => (i === idx ? value : item)));
  };
  const removeActionItem = (idx: number) => {
    setActionItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveInspection = () => {
    if (!inspectorName) {
      alert("Please enter inspector name");
      return;
    }

    const percentage = getScorePercentage();
    const newInspection: SavedInspection = {
      id: Date.now().toString(),
      date: inspectionDate,
      inspector: inspectorName,
      inspectorRole,
      sections: JSON.parse(JSON.stringify(sections)),
      overallScore: getOverallScore(),
      maxScore: getMaxScore(),
      rating: getRating(percentage),
      strengths,
      improvements,
      actionItems: actionItems.filter((a) => a.trim()),
      notes,
      savedAt: new Date().toISOString(),
    };

    setSavedInspections((prev) => [newInspection, ...prev]);
    setActiveTab("history");
  };

  const loadInspection = (inspection: SavedInspection) => {
    setSections(inspection.sections);
    setInspectorName(inspection.inspector);
    setInspectorRole(inspection.inspectorRole);
    setInspectionDate(inspection.date);
    setStrengths(inspection.strengths);
    setImprovements(inspection.improvements);
    setActionItems(inspection.actionItems.length > 0 ? inspection.actionItems : [""]);
    setNotes(inspection.notes);
    setActiveTab("form");
  };

  const deleteInspection = (id: string) => {
    if (!confirm("Delete this inspection?")) return;
    setSavedInspections((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Corporate Inspection</h1>
          <p className="text-sm text-gray-500">
            Official inspection with ratings and action items
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("form")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "form"
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            New Inspection
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "history"
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            History ({savedInspections.length})
          </button>
        </div>
      </div>

      {activeTab === "form" ? (
        <>
          {/* Inspector Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  Role
                </label>
                <select
                  value={inspectorRole}
                  onChange={(e) => setInspectorRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                >
                  <option>Corporate Inspector</option>
                  <option>Regional Manager</option>
                  <option>Operations Director</option>
                  <option>Quality Assurance</option>
                </select>
              </div>
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
                  Rating
                </label>
                <div className="flex items-center gap-2 h-[42px]">
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-red-600 h-3 rounded-full transition-all"
                      style={{ width: `${getScorePercentage()}%` }}
                    />
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${ratingColors[getRating(getScorePercentage())]}`}>
                    {ratingLabels[getRating(getScorePercentage())]}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Score Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {sections.map((section, idx) => {
                const score = getSectionScore(section);
                const max = getSectionMaxScore(section);
                const pct = max > 0 ? Math.round((score / max) * 100) : 0;
                return (
                  <div key={idx} className="text-center">
                    <p className="text-lg font-bold text-gray-900">{pct}%</p>
                    <p className="text-[10px] text-gray-500 truncate">{section.title}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sections */}
          {sections.map((section, sectionIdx) => (
            <div key={sectionIdx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{section.title}</h3>
                <span className="text-sm text-gray-600">
                  {getSectionScore(section)}/{getSectionMaxScore(section)}
                </span>
              </div>

              <div className="divide-y divide-gray-100">
                {section.items.map((item, itemIdx) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-900 flex-1">{item.text}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateItemStatus(sectionIdx, itemIdx, "pass")}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                            item.status === "pass"
                              ? "bg-green-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-green-100"
                          }`}
                        >
                          ✓ Pass
                        </button>
                        <button
                          onClick={() => updateItemStatus(sectionIdx, itemIdx, "fail")}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                            item.status === "fail"
                              ? "bg-red-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-red-100"
                          }`}
                        >
                          ✗ Fail
                        </button>
                        <button
                          onClick={() => updateItemStatus(sectionIdx, itemIdx, "na")}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                            item.status === "na"
                              ? "bg-gray-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          N/A
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-bold text-green-700 mb-2">
                Strengths
              </label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="What the store did well..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
              />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-bold text-red-700 mb-2">
                Areas for Improvement
              </label>
              <textarea
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                placeholder="What needs improvement..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
              />
            </div>
          </div>

          {/* Action Items */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-gray-900">Action Items</label>
              <button
                onClick={addActionItem}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {actionItems.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => updateActionItem(idx, e.target.value)}
                    placeholder={`Action item ${idx + 1}...`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                  />
                  {actionItems.length > 1 && (
                    <button
                      onClick={() => removeActionItem(idx)}
                      className="text-gray-400 hover:text-red-500 text-sm px-2"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional observations..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
            />
          </div>

          {/* Save */}
          <div className="flex gap-3">
            <button
              onClick={saveInspection}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              Save & Submit Inspection
            </button>
            <button
              onClick={() => {
                setSections(defaultSections);
                setInspectorName("");
                setStrengths("");
                setImprovements("");
                setActionItems([""]);
                setNotes("");
              }}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              Reset
            </button>
          </div>
        </>
      ) : (
        /* History */
        <div className="space-y-4">
          {savedInspections.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">No saved inspections yet</p>
            </div>
          ) : (
            savedInspections.map((inspection) => {
              const percentage = Math.round((inspection.overallScore / inspection.maxScore) * 100);
              return (
                <div
                  key={inspection.id}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {inspection.date} — {inspection.inspector}
                        </h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ratingColors[inspection.rating]}`}>
                          {ratingLabels[inspection.rating]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {inspection.overallScore}/{inspection.maxScore} ({percentage}%) · {inspection.inspectorRole}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadInspection(inspection)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => deleteInspection(inspection.id)}
                        className="text-sm text-gray-400 hover:text-red-500"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
