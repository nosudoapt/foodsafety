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
  sections: InspectionSection[];
  overallScore: number;
  maxScore: number;
  notes: string;
  savedAt: string;
}

const defaultSections: InspectionSection[] = [
  {
    title: "Food Storage & Temperature",
    items: [
      { id: "fs1", text: "Cold storage below 4°C", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs2", text: "Hot holding above 60°C", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs3", text: "FIFO rotation followed", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs4", text: "Proper date labeling on all items", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "fs5", text: "Raw and cooked stored separately", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Cleanliness & Sanitation",
    items: [
      { id: "cs1", text: "Surfaces clean and sanitized", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "cs2", text: "Floors clean and dry", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "cs3", text: "Handwash stations stocked", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "cs4", text: "Dishwashing temperature correct", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "cs5", text: "Waste bins emptied and lined", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Staff Hygiene & Training",
    items: [
      { id: "sh1", text: "Staff wearing clean uniforms", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "sh2", text: "Hair nets / hats worn", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "sh3", text: "Handwashing practiced", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "sh4", text: "No jewelry on hands/arms", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "sh5", text: "Staff illness policy followed", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Equipment & Maintenance",
    items: [
      { id: "em1", text: "Equipment in good repair", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "em2", text: "Thermometers calibrated", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "em3", text: "Fire extinguishers accessible", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "em4", text: "First aid kit stocked", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "em5", text: "Lighting adequate in all areas", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
  {
    title: "Pest Control",
    items: [
      { id: "pc1", text: "No signs of pests", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "pc2", text: "Doors/windows sealed properly", score: 0, maxScore: 10, status: null, notes: "" },
      { id: "pc3", text: "Traps clean and maintained", score: 0, maxScore: 10, status: null, notes: "" },
    ],
  },
];

export default function InHouseInspectionPage() {
  const [sections, setSections] = useState<InspectionSection[]>(defaultSections);
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [savedInspections, setSavedInspections] = useState<SavedInspection[]>([]);
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");

  const updateItemStatus = (sectionIdx: number, itemIdx: number, status: "pass" | "fail" | "na") => {
    setSections((prev) => {
      const updated = [...prev];
      const section = { ...updated[sectionIdx] };
      const items = [...section.items];
      const item = { ...items[itemIdx] };

      // Toggle off if same status clicked
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

  const updateItemNotes = (sectionIdx: number, itemIdx: number, note: string) => {
    setSections((prev) => {
      const updated = [...prev];
      const section = { ...updated[sectionIdx] };
      const items = [...section.items];
      items[itemIdx] = { ...items[itemIdx], notes: note };
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

  const saveInspection = () => {
    if (!inspectorName) {
      alert("Please enter inspector name");
      return;
    }

    const newInspection: SavedInspection = {
      id: Date.now().toString(),
      date: inspectionDate,
      inspector: inspectorName,
      sections: JSON.parse(JSON.stringify(sections)),
      overallScore: getOverallScore(),
      maxScore: getMaxScore(),
      notes,
      savedAt: new Date().toISOString(),
    };

    setSavedInspections((prev) => [newInspection, ...prev]);
    setActiveTab("history");
  };

  const loadInspection = (inspection: SavedInspection) => {
    setSections(inspection.sections);
    setInspectorName(inspection.inspector);
    setInspectionDate(inspection.date);
    setNotes(inspection.notes);
    setActiveTab("form");
  };

  const deleteInspection = (id: string) => {
    if (!confirm("Delete this inspection?")) return;
    setSavedInspections((prev) => prev.filter((i) => i.id !== id));
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">In-House Inspection</h1>
          <p className="text-sm text-gray-500">
            Internal food safety and operations checklist
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  Overall Score
                </label>
                <div className="flex items-center gap-2 h-[42px]">
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-red-600 h-3 rounded-full transition-all"
                      style={{ width: `${getScorePercentage()}%` }}
                    />
                  </div>
                  <span className={`text-lg font-bold ${getScoreColor(getScorePercentage())}`}>
                    {getScorePercentage()}%
                  </span>
                </div>
              </div>
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
                    {item.status === "fail" && (
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => updateItemNotes(sectionIdx, itemIdx, e.target.value)}
                        placeholder="Notes on failure..."
                        className="mt-2 w-full px-3 py-1.5 border border-red-200 rounded-lg text-sm text-gray-900 bg-red-50"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* General Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              General Notes
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
              Save Inspection
            </button>
            <button
              onClick={() => {
                setSections(defaultSections);
                setInspectorName("");
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
                      <h3 className="font-semibold text-gray-900">
                        {inspection.date} — {inspection.inspector}
                      </h3>
                      <p className="text-xs text-gray-500">
                        Score: {inspection.overallScore}/{inspection.maxScore} ({percentage}%)
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
