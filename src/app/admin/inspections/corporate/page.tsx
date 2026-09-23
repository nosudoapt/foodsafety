"use client";

import { useEffect, useState } from "react";
import { Upload, Save, RotateCcw, CalendarCheck2, FileText, Link2 } from "lucide-react";
import { PageHeader, Card, Button, Badge, inputClass, Field } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  readLocal,
  writeLocal,
  fileToDataUrl,
} from "@/lib/admin-store";

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
  quarter: string;
  reportFileName?: string;
  reportDataUrl?: string;
  rubricSource?: string;
  rubricLink?: string;
}

const STORAGE_KEY = "btb-corporate-inspections";

function quarterOf(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
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
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [officialRubricUrl, setOfficialRubricUrl] = useState("");
  const [itemNotesOpen, setItemNotesOpen] = useState<Record<string, boolean>>({});

  function rowToSaved(row: Record<string, unknown>): SavedInspection {
    return {
      id: String(row.id),
      date: String(row.inspection_date || ""),
      inspector: String(row.inspector_name || ""),
      inspectorRole: String(row.inspector_role || ""),
      sections: (row.sections as InspectionSection[]) || [],
      overallScore: Number(row.overall_score || 0),
      maxScore: Number(row.max_score || 0),
      rating: String(row.rating || "satisfactory"),
      strengths: String(row.strengths || ""),
      improvements: String(row.improvements || ""),
      actionItems: Array.isArray(row.action_items)
        ? (row.action_items as string[])
        : [],
      notes: String(row.notes || ""),
      savedAt: String(row.created_at || ""),
      quarter: String(row.quarter || quarterOf(String(row.inspection_date || ""))),
      reportFileName: row.report_file_name ? String(row.report_file_name) : undefined,
      reportDataUrl: row.report_data ? String(row.report_data) : undefined,
      rubricSource: String(row.rubric_source || "placeholder"),
      rubricLink: row.rubric_link ? String(row.rubric_link) : undefined,
    };
  }

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("corporate_inspections")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          if (!cancelled && !error && data) {
            const mapped = data.map(rowToSaved);
            setSavedInspections(mapped);
            writeLocal(STORAGE_KEY, mapped);
          } else if (!cancelled) {
            setSavedInspections(readLocal<SavedInspection[]>(STORAGE_KEY, []));
          }
        } else if (!cancelled) {
          setSavedInspections(readLocal<SavedInspection[]>(STORAGE_KEY, []));
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const currentQuarter = quarterOf(inspectionDate);
  const completedThisQuarter = savedInspections.filter((i) => i.quarter === currentQuarter).length;

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
        // N/A: score 0 but excluded from max denominator
        item.score = status === "pass" ? item.maxScore : 0;
      }

      items[itemIdx] = item;
      section.items = items;
      updated[sectionIdx] = section;
      return updated;
    });
  };

  const updateItemNotes = (sectionIdx: number, itemIdx: number, notes: string) => {
    setSections((prev) => {
      const updated = [...prev];
      const section = { ...updated[sectionIdx] };
      const items = [...section.items];
      items[itemIdx] = { ...items[itemIdx], notes };
      section.items = items;
      updated[sectionIdx] = section;
      return updated;
    });
  };

  const getSectionScore = (section: InspectionSection) => {
    return section.items.reduce((sum, item) => sum + item.score, 0);
  };

  const getSectionMaxScore = (section: InspectionSection) => {
    // N/A items excluded from max
    return section.items.reduce(
      (sum, item) => sum + (item.status === "na" ? 0 : item.maxScore),
      0
    );
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

  const saveInspection = async () => {
    if (!inspectorName) {
      alert("Please enter inspector name");
      return;
    }

    let reportUrl = "";
    let reportName: string | undefined;
    if (reportFile) {
      if (reportFile.size > 5_000_000) {
        alert("Report file too large (max 5 MB).");
        return;
      }
      reportUrl = await fileToDataUrl(reportFile);
      reportName = reportFile.name;
    }

    const percentage = getScorePercentage();
    const id = crypto.randomUUID();
    const newInspection: SavedInspection = {
      id,
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
      quarter: quarterOf(inspectionDate),
      reportFileName: reportName,
      reportDataUrl: reportUrl || undefined,
      rubricSource: officialRubricUrl ? "official_link" : "placeholder",
      rubricLink: officialRubricUrl || undefined,
    };

    const next = [newInspection, ...savedInspections];
    setSavedInspections(next);
    writeLocal(STORAGE_KEY, next);
    setReportFile(null);
    setActiveTab("history");

    const user = await getSessionUser();
    if (user) {
      const ctx = await getProfileContext();
      const { error } = await supabase.from("corporate_inspections").insert({
        id,
        user_id: user.id,
        restaurant_name: ctx.restaurantName,
        inspection_date: inspectionDate,
        inspector_name: inspectorName,
        inspector_role: inspectorRole,
        sections: newInspection.sections,
        overall_score: newInspection.overallScore,
        max_score: newInspection.maxScore,
        rating: newInspection.rating,
        strengths,
        improvements,
        action_items: newInspection.actionItems,
        notes,
        quarter: newInspection.quarter,
        report_file_name: reportName || null,
        report_data: reportUrl || null,
        rubric_source: newInspection.rubricSource,
        rubric_link: officialRubricUrl || null,
      });
      if (error) {
        console.warn("corporate_inspections insert failed (kept local):", error.message);
      }
    }
  };

  const deleteInspection = (id: string) => {
    if (!confirm("Delete this inspection?")) return;
    const next = savedInspections.filter((i) => i.id !== id);
    setSavedInspections(next);
    writeLocal(STORAGE_KEY, next);
    void (async () => {
      const user = await getSessionUser();
      if (user) {
        await supabase
          .from("corporate_inspections")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
      }
    })();
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
    setOfficialRubricUrl(inspection.rubricLink || "");
    setActiveTab("form");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Corporate inspection"
        description="Quarterly scored inspection with ratings and action items. Attach the official scoring report when you have it — placeholder rubric below until your link is shared."
        actions={
          <>
            <Button
              variant={activeTab === "form" ? "secondary" : "ghost"}
              onClick={() => setActiveTab("form")}
            >
              New inspection
            </Button>
            <Button variant={activeTab === "history" ? "primary" : "secondary"} onClick={() => setActiveTab("history")}>
              History ({savedInspections.length})
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={completedThisQuarter > 0 ? "green" : "amber"}>
          <CalendarCheck2 className="mr-1 h-3 w-3" />
          {currentQuarter}: {completedThisQuarter > 0 ? `${completedThisQuarter} filed` : "due"}
        </Badge>
        <Badge tone="gray">Quarterly cadence</Badge>
        {savedInspections.length > 0 && (
          <span className="text-[12px] text-gray-400">
            Last: {savedInspections[0].date} · {savedInspections[0].quarter}
          </span>
        )}
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
                      <button
                        type="button"
                        aria-label="Toggle item notes"
                        onClick={() =>
                          setItemNotesOpen((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                        className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                          item.notes
                            ? "border-blue-200 text-blue-700 bg-blue-50"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        Notes
                      </button>
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
                    {itemNotesOpen[item.id] && (
                      <textarea
                        value={item.notes}
                        onChange={(e) => updateItemNotes(sectionIdx, itemIdx, e.target.value)}
                        placeholder="Observation / evidence for this item…"
                        rows={2}
                        className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-gray-50/50 resize-none"
                      />
                    )}
                    {item.status === "na" && (
                      <p className="mt-1 text-[11px] text-gray-400">
                        N/A — excluded from section max score.
                      </p>
                    )}
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

          {/* Official report + rubric link */}
          <Card>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Official scoring report (optional)
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    Attach the corporate PDF/ratings file — stored with this inspection in Supabase when signed in.
                  </p>
                  {reportFile && (
                    <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                      Attached: {reportFile.name}
                    </p>
                  )}
                </div>
                <label className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                  <Upload className="h-4 w-4" />
                  Choose file
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    className="sr-only"
                    onChange={(e) => {
                      setReportFile(e.target.files?.[0] || null);
                    }}
                  />
                </label>
              </div>
              <Field label="Official ratings / scoring rubric link" hint="Paste the corporate rubric URL when you have it — placeholder rubric is used until then.">
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="url"
                    value={officialRubricUrl}
                    onChange={(e) => setOfficialRubricUrl(e.target.value)}
                    placeholder="https://…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </Field>
              {officialRubricUrl && (
                <a
                  href={officialRubricUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  Open official rubric ↗
                </a>
              )}
            </div>
          </Card>

          {/* Save */}
          <div className="flex gap-3">
            <Button onClick={saveInspection}>
              <Save className="h-4 w-4" /> Save & submit inspection
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSections(defaultSections);
                setInspectorName("");
                setStrengths("");
                setImprovements("");
                setActionItems([""]);
                setNotes("");
                setReportFile(null);
              }}
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
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
                        {inspection.overallScore}/{inspection.maxScore} ({percentage}%) ·{" "}
                        {inspection.inspectorRole} · {inspection.quarter}
                        {inspection.reportFileName && ` · ${inspection.reportFileName}`}
                        {inspection.rubricSource === "official_link" && " · official rubric"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {inspection.reportDataUrl && (
                        <a
                          href={inspection.reportDataUrl}
                          download={inspection.reportFileName}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1"
                        >
                          Report
                        </a>
                      )}
                      {inspection.rubricLink && (
                        <a
                          href={inspection.rubricLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1"
                        >
                          Rubric
                        </a>
                      )}
                      <button
                        onClick={() => loadInspection(inspection)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => deleteInspection(inspection.id)}
                        aria-label="Delete inspection"
                        className="text-sm text-gray-400 hover:text-red-500"
                      >
                        ✕
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
