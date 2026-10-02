"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getProfileContext } from "@/lib/profile";
import { compressImage, uploadToSupabase, photoSrc, removePhotos } from "@/lib/photos";

// ---------------------------------------------------------------------------
// Shared inspection flow — the one component behind corporate, in-house and
// franchisee inspections (the client wants all three to work exactly like the
// corporate one). The type prop picks the checklist, the inspector-role list
// and the inspection_type discriminator; everything else (scoring, rating,
// history, per-point comments + photo proofs) is identical across types.
//
// All types persist to corporate_inspections (see
// supabase/schema-inspection-consolidation.sql). Photo proofs are compressed
// on-device into the ops-photos bucket; only object paths are stored, inside
// the sections JSONB (item.photos).
// ---------------------------------------------------------------------------

export type InspectionType = "corporate" | "in-house" | "franchisee";

interface InspectionItem {
  id: string;
  text: string;
  score: number;
  maxScore: number;
  status: "pass" | "fail" | "na" | null;
  notes: string;
  photos: string[];
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

interface InspectionRow {
  id: string;
  inspection_date: string;
  inspector_name: string;
  inspector_role: string | null;
  sections: InspectionSection[] | null;
  overall_score: number | null;
  max_score: number | null;
  rating: string | null;
  strengths: string | null;
  improvements: string | null;
  action_items: string[] | null;
  notes: string | null;
  created_at: string;
}

const COLUMNS =
  "id, inspection_date, inspector_name, inspector_role, sections, overall_score, max_score, rating, strengths, improvements, action_items, notes, created_at";

// Legacy rows (and hand-edited JSON) may lack newer fields — normalise so the
// form never renders an item without photos/notes.
function normalizeSections(raw: InspectionSection[] | null | undefined): InspectionSection[] {
  return (raw ?? []).map((s) => ({
    title: s.title,
    items: (s.items ?? []).map((i) => ({
      id: i.id,
      text: i.text,
      score: Number(i.score) || 0,
      maxScore: Number(i.maxScore) || 10,
      status: i.status ?? null,
      notes: i.notes ?? "",
      photos: Array.isArray(i.photos) ? i.photos : [],
    })),
  }));
}

function toSaved(row: InspectionRow): SavedInspection {
  const max = row.max_score ?? 0;
  const score = row.overall_score ?? 0;
  return {
    id: row.id,
    date: row.inspection_date,
    inspector: row.inspector_name,
    inspectorRole: row.inspector_role || "",
    sections: normalizeSections(row.sections),
    overallScore: score,
    maxScore: max,
    rating: row.rating || (max > 0 ? getRating(Math.round((score / max) * 100)) : ""),
    strengths: row.strengths || "",
    improvements: row.improvements || "",
    actionItems: row.action_items ?? [],
    notes: row.notes || "",
    savedAt: row.created_at,
  };
}

type SeedItem = Omit<InspectionItem, "score" | "status" | "notes" | "photos">;
interface SeedSection {
  title: string;
  items: SeedItem[];
}
function seed(sections: SeedSection[]): InspectionSection[] {
  return sections.map((s) => ({
    title: s.title,
    items: s.items.map((i) => ({ ...i, score: 0, status: null, notes: "", photos: [] })),
  }));
}

// ---------------------------------------------------------------------------
// Checklists. Corporate is the reference flow; in-house and franchisee carry
// their own rubric content but run through the identical form. Franchisee
// weights (0.5–2) become the per-item max score so the BTB rubric weighting
// survives the consolidation.
// ---------------------------------------------------------------------------

// Link to the official grading rubric shown at the top of the corporate form.
const RUBRIC_URL = "https://www.fda.gov/media/117509/download";

const CORPORATE_SECTIONS: SeedSection[] = [
  {
    title: "Food Safety Compliance",
    items: [
      { id: "fs1", text: "Temperature logs maintained and accurate", maxScore: 10 },
      { id: "fs2", text: "HACCP procedures followed", maxScore: 10 },
      { id: "fs3", text: "Cross-contamination prevention", maxScore: 10 },
      { id: "fs4", text: "Proper cooking temperatures", maxScore: 10 },
      { id: "fs5", text: "Cooling procedures followed (60→21°C in 2hrs, 21→4°C in 4hrs)", maxScore: 10 },
      { id: "fs6", text: "Allergen management in place", maxScore: 10 },
    ],
  },
  {
    title: "Cleaning & Sanitation",
    items: [
      { id: "cs1", text: "Daily cleaning schedule followed", maxScore: 10 },
      { id: "cs2", text: "Weekly deep cleaning completed", maxScore: 10 },
      { id: "cs3", text: "Sanitizer solutions at correct concentration", maxScore: 10 },
      { id: "cs4", text: "Before/after cleaning photos documented", maxScore: 10 },
    ],
  },
  {
    title: "Staff Training & Certifications",
    items: [
      { id: "st1", text: "All staff have valid food handler certificates", maxScore: 10 },
      { id: "st2", text: "Training records up to date", maxScore: 10 },
      { id: "st3", text: "Staff hygiene standards met", maxScore: 10 },
      { id: "st4", text: "WHMIS training completed", maxScore: 10 },
    ],
  },
  {
    title: "Documentation & Licensing",
    items: [
      { id: "dl1", text: "Business license valid and displayed", maxScore: 10 },
      { id: "dl2", text: "Health license current", maxScore: 10 },
      { id: "dl3", text: "Insurance documentation available", maxScore: 10 },
      { id: "dl4", text: "Food inspection reports on file", maxScore: 10 },
    ],
  },
  {
    title: "Facility & Equipment",
    items: [
      { id: "fe1", text: "Equipment in good working order", maxScore: 10 },
      { id: "fe2", text: "Thermometers calibrated and visible", maxScore: 10 },
      { id: "fe3", text: "Pest control measures in place", maxScore: 10 },
      { id: "fe4", text: "Waste management compliant", maxScore: 10 },
    ],
  },
];

const INHOUSE_SECTIONS: SeedSection[] = [
  {
    title: "Food Storage & Temperature",
    items: [
      { id: "fs1", text: "Cold storage below 4°C", maxScore: 10 },
      { id: "fs2", text: "Hot holding above 60°C", maxScore: 10 },
      { id: "fs3", text: "FIFO rotation followed", maxScore: 10 },
      { id: "fs4", text: "Proper date labeling on all items", maxScore: 10 },
      { id: "fs5", text: "Raw and cooked stored separately", maxScore: 10 },
    ],
  },
  {
    title: "Cleanliness & Sanitation",
    items: [
      { id: "cs1", text: "Surfaces clean and sanitized", maxScore: 10 },
      { id: "cs2", text: "Floors clean and dry", maxScore: 10 },
      { id: "cs3", text: "Handwash stations stocked", maxScore: 10 },
      { id: "cs4", text: "Dishwashing temperature correct", maxScore: 10 },
      { id: "cs5", text: "Waste bins emptied and lined", maxScore: 10 },
    ],
  },
  {
    title: "Staff Hygiene & Training",
    items: [
      { id: "sh1", text: "Staff wearing clean uniforms", maxScore: 10 },
      { id: "sh2", text: "Hair nets / hats worn", maxScore: 10 },
      { id: "sh3", text: "Handwashing practiced", maxScore: 10 },
      { id: "sh4", text: "No jewelry on hands/arms", maxScore: 10 },
      { id: "sh5", text: "Staff illness policy followed", maxScore: 10 },
    ],
  },
  {
    title: "Equipment & Maintenance",
    items: [
      { id: "em1", text: "Equipment in good repair", maxScore: 10 },
      { id: "em2", text: "Thermometers calibrated", maxScore: 10 },
      { id: "em3", text: "Fire extinguishers accessible", maxScore: 10 },
      { id: "em4", text: "First aid kit stocked", maxScore: 10 },
      { id: "em5", text: "Lighting adequate in all areas", maxScore: 10 },
    ],
  },
  {
    title: "Pest Control",
    items: [
      { id: "pc1", text: "No signs of pests", maxScore: 10 },
      { id: "pc2", text: "Doors/windows sealed properly", maxScore: 10 },
      { id: "pc3", text: "Traps clean and maintained", maxScore: 10 },
    ],
  },
];

// Franchise rubric — weights (maxScore) come straight from the BTB document.
const FRANCHISE_SECTIONS: SeedSection[] = [
  {
    title: "Environment",
    items: [
      { id: "env1", text: "Building exterior is clean, well-maintained; signage working.", maxScore: 1 },
      { id: "env2", text: "Music is playing at an appropriate level.", maxScore: 0.5 },
      { id: "env3", text: "Menu screens working; front counter is clean.", maxScore: 1 },
      { id: "env4", text: "Pepsi cooler stocked with Pepsi-branded items only.", maxScore: 0.5 },
      { id: "env5", text: "Floors are clean and free of debris.", maxScore: 1 },
      { id: "env6", text: "Table tops/bases clean and free of debris.", maxScore: 1 },
      { id: "env7", text: "Artwork clean, approved, well presented.", maxScore: 0.5 },
      { id: "env8", text: "Public washrooms clean and well maintained.", maxScore: 1.5 },
      { id: "env9", text: "Kitchen appears clean and organized upon entry.", maxScore: 1.5 },
      { id: "env10", text: "Kitchen floors clean and free of debris.", maxScore: 1 },
      { id: "env11", text: "Dry storage tidy, labeled, rotated, appropriately stocked.", maxScore: 1 },
      { id: "env12", text: "Cooking equipment clean, functional, and well maintained.", maxScore: 1.5 },
      { id: "env13", text: "Catch trays beneath broiler/flat top are clean and maintained.", maxScore: 1 },
      { id: "env14", text: "Sinks and drains working and in good condition.", maxScore: 1 },
      { id: "env15", text: "First aid kit is well stocked and accessible.", maxScore: 2 },
      { id: "env16", text: "Overall maintenance & cleanliness meet BTB expectations.", maxScore: 1 },
    ],
  },
  {
    title: "Product",
    items: [
      { id: "prod1", text: "Features/specials are run according to approved programs.", maxScore: 0.5 },
      { id: "prod2", text: "Food is made to specifications at ALL times.", maxScore: 1.5 },
      { id: "prod3", text: "Food looks appealing and well assembled.", maxScore: 1 },
      { id: "prod4", text: "Portion sizes accurate per BTB specifications.", maxScore: 1 },
      { id: "prod5", text: "Garbage & cardboard levels are maintained.", maxScore: 0.5 },
      { id: "prod6", text: "Knives sharp, clean, stored properly.", maxScore: 1 },
      { id: "prod7", text: "Products used in kitchen are BTB-approved items only.", maxScore: 1 },
      { id: "prod8", text: "All ingredients come from approved suppliers.", maxScore: 1 },
      { id: "prod9", text: "Line ingredients fresh and made correctly.", maxScore: 1.5 },
      { id: "prod10", text: "Proper sanitation fundamentals adhered to at ALL times.", maxScore: 2 },
      { id: "prod11", text: "Deep fryer oil filtered daily; clean condition.", maxScore: 1.5 },
      { id: "prod12", text: "Hand soap & paper towel dispensers clean, stocked, in repair.", maxScore: 1.5 },
      { id: "prod13", text: "Equipment maintains safe temperatures for storage.", maxScore: 2 },
      { id: "prod14", text: "Cooler clean, organized, proper temperature.", maxScore: 1.5 },
      { id: "prod15", text: "Walk-in cooler products labeled and rotated.", maxScore: 1 },
      { id: "prod16", text: "Walk-in items made to specification.", maxScore: 1 },
      { id: "prod17", text: "Walk-in stock levels properly managed.", maxScore: 1 },
      { id: "prod18", text: "Freezer clean, organized, proper temperature.", maxScore: 1.5 },
      { id: "prod19", text: "Overall food preparation meets BTB expectations.", maxScore: 1 },
      { id: "prod20", text: "Overall drink preparation meets BTB expectations.", maxScore: 0.5 },
    ],
  },
  {
    title: "Service",
    items: [
      { id: "svc1", text: "When entering the room, are customers being greeted immediately at all times?", maxScore: 1.5 },
      { id: "svc2", text: "Are all staff wearing appropriate uniforms? Jewelry? Clean and well presented?", maxScore: 1 },
      { id: "svc3", text: "Is food arriving at the tables in an appropriate amount of time? 12–15 Lunch, 15–20 Dinner?", maxScore: 1.5 },
      { id: "svc4", text: "Is the quality of the food being delivered acceptable? (Required)", maxScore: 2 },
      { id: "svc5", text: "Are tables quickly being cleaned and reset after one is emptied? (Required)", maxScore: 1.5 },
      { id: "svc6", text: "Overall, is the service level meeting the expectations set forth by BTB? (Required)", maxScore: 2 },
    ],
  },
];

interface TypeConfig {
  title: string;
  subtitle: string;
  roles: readonly string[];
  rubricUrl?: string;
  sections: SeedSection[];
}

const CONFIG: Record<InspectionType, TypeConfig> = {
  corporate: {
    title: "Corporate Inspection",
    subtitle: "Official inspection with ratings and action items",
    roles: ["Corporate Inspector", "Regional Manager", "Operations Director", "Quality Assurance"],
    rubricUrl: RUBRIC_URL,
    sections: CORPORATE_SECTIONS,
  },
  "in-house": {
    title: "In-House Inspection",
    subtitle: "Internal food safety and operations checklist",
    roles: ["Store Manager", "Assistant Manager", "Owner"],
    sections: INHOUSE_SECTIONS,
  },
  franchisee: {
    title: "Between the Buns – Franchise Inspection",
    subtitle: "Weighted rubric scoring with photo proofs",
    roles: ["Corporate Inspector", "Franchisee", "Regional Manager"],
    sections: FRANCHISE_SECTIONS,
  },
};

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

export default function InspectionForm({
  type,
  readOnly = false,
}: {
  type: InspectionType;
  readOnly?: boolean;
}) {
  const cfg = CONFIG[type];
  const [sections, setSections] = useState<InspectionSection[]>(() => seed(cfg.sections));
  const [inspectorName, setInspectorName] = useState("");
  const [inspectorRole, setInspectorRole] = useState(cfg.roles[0]);
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [actionItems, setActionItems] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [savedInspections, setSavedInspections] = useState<SavedInspection[]>([]);
  const [activeTab, setActiveTab] = useState<"form" | "history">(readOnly ? "history" : "form");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // History for this type only. The inspection_type column comes from
  // supabase/schema-inspection-consolidation.sql — say so if it's missing.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error: err } = await supabase
        .from("corporate_inspections")
        .select(COLUMNS)
        .eq("inspection_type", type)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) {
        setError(
          err.message.includes("inspection_type")
            ? "Run supabase/schema-inspection-consolidation.sql in Supabase, then reload."
            : err.message
        );
      } else {
        setSavedInspections((data ?? []).map(toSaved));
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [type]);

  const patchItem = (
    sectionIdx: number,
    itemIdx: number,
    fn: (item: InspectionItem) => InspectionItem
  ) => {
    setSections((prev) =>
      prev.map((s, si) =>
        si !== sectionIdx
          ? s
          : { ...s, items: s.items.map((it, ii) => (ii !== itemIdx ? it : fn(it))) }
      )
    );
  };

  const updateItemStatus = (sectionIdx: number, itemIdx: number, status: "pass" | "fail" | "na") => {
    patchItem(sectionIdx, itemIdx, (item) => {
      if (item.status === status) return { ...item, status: null, score: 0 };
      return {
        ...item,
        status,
        score: status === "fail" ? 0 : item.maxScore,
      };
    });
  };

  const updateItemNotes = (sectionIdx: number, itemIdx: number, note: string) =>
    patchItem(sectionIdx, itemIdx, (item) => ({ ...item, notes: note }));

  // Compress → ops-photos → keep the object path on the item (saved with the
  // form). Partial uploads are cleaned up if a later file fails.
  const uploadPhotos = async (sectionIdx: number, itemIdx: number, files: FileList | null) => {
    if (readOnly || !files || !files.length) return;
    const key = `${sectionIdx}:${itemIdx}`;
    setUploading((prev) => ({ ...prev, [key]: true }));
    setError("");
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const blob = await compressImage(file);
        const path = `inspections/${type}/${crypto.randomUUID()}.jpg`;
        await uploadToSupabase(path, blob);
        added.push(path);
      }
      patchItem(sectionIdx, itemIdx, (item) => ({ ...item, photos: [...item.photos, ...added] }));
    } catch (e) {
      if (added.length) removePhotos(added).catch(() => {});
      setError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const removePhoto = (sectionIdx: number, itemIdx: number, path: string) => {
    patchItem(sectionIdx, itemIdx, (item) => ({
      ...item,
      photos: item.photos.filter((p) => p !== path),
    }));
    if (!path.startsWith("data:") && !path.startsWith("blob:")) {
      removePhotos([path]).catch(() => {});
    }
  };

  const getSectionScore = (section: InspectionSection) =>
    section.items.reduce((sum, item) => sum + item.score, 0);
  const getSectionMaxScore = (section: InspectionSection) =>
    section.items.reduce((sum, item) => sum + item.maxScore, 0);
  const getOverallScore = () =>
    sections.reduce((sum, section) => sum + getSectionScore(section), 0);
  const getMaxScore = () =>
    sections.reduce((sum, section) => sum + getSectionMaxScore(section), 0);
  const getScorePercentage = () => {
    const max = getMaxScore();
    if (max === 0) return 0;
    return Math.round((getOverallScore() / max) * 100);
  };

  const addActionItem = () => setActionItems((prev) => [...prev, ""]);
  const updateActionItem = (idx: number, value: string) =>
    setActionItems((prev) => prev.map((item, i) => (i === idx ? value : item)));
  const removeActionItem = (idx: number) =>
    setActionItems((prev) => prev.filter((_, i) => i !== idx));

  const saveInspection = async () => {
    if (!inspectorName) {
      alert("Please enter inspector name");
      return;
    }
    if (saving) return;
    setSaving(true);
    setError("");

    const ctx = await getProfileContext();
    if (!ctx) {
      setError("No profile found for this session — sign in again.");
      setSaving(false);
      return;
    }

    const { data, error: err } = await supabase
      .from("corporate_inspections")
      .insert({
        user_id: ctx.userId,
        restaurant_name: ctx.restaurantName,
        inspection_type: type,
        inspection_date: inspectionDate,
        inspector_name: inspectorName,
        inspector_role: inspectorRole,
        sections: JSON.parse(JSON.stringify(sections)),
        overall_score: Math.round(getOverallScore()),
        max_score: Math.round(getMaxScore()),
        rating: getRating(getScorePercentage()),
        strengths,
        improvements,
        action_items: actionItems.filter((a) => a.trim()),
        notes,
      })
      .select(COLUMNS)
      .single();

    if (err) {
      setError(
        err.message.includes("inspection_type")
          ? "Run supabase/schema-inspection-consolidation.sql in Supabase, then retry."
          : err.message
      );
      setSaving(false);
      return;
    }

    setSavedInspections((prev) => [toSaved(data), ...prev]);
    setSaving(false);
    setActiveTab("history");
  };

  const loadInspection = (inspection: SavedInspection) => {
    setSections(inspection.sections);
    setInspectorName(inspection.inspector);
    setInspectorRole(inspection.inspectorRole || cfg.roles[0]);
    setInspectionDate(inspection.date);
    setStrengths(inspection.strengths);
    setImprovements(inspection.improvements);
    setActionItems(inspection.actionItems.length > 0 ? inspection.actionItems : [""]);
    setNotes(inspection.notes);
    setActiveTab("form");
  };

  const deleteInspection = async (id: string) => {
    if (!confirm("Delete this inspection?")) return;
    const { error: err } = await supabase.from("corporate_inspections").delete().eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setSavedInspections((prev) => prev.filter((i) => i.id !== id));
  };

  const resetForm = () => {
    setSections(seed(cfg.sections));
    setInspectorName("");
    setInspectorRole(cfg.roles[0]);
    setStrengths("");
    setImprovements("");
    setActionItems([""]);
    setNotes("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{cfg.title}</h1>
          <p className="text-sm text-gray-500">{cfg.subtitle}</p>
          {cfg.rubricUrl && (
            <a
              href={cfg.rubricUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-red-600 hover:text-red-700 hover:underline"
            >
              View grading rubric ↗
            </a>
          )}
        </div>
        <div className="flex gap-2">
          {!readOnly && (
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
          )}
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!readOnly && activeTab === "form" ? (
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inspectorRole}
                  onChange={(e) => setInspectorRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                >
                  {cfg.roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                <div className="flex items-center gap-2 h-[42px]">
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-red-600 h-3 rounded-full transition-all"
                      style={{ width: `${getScorePercentage()}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      ratingColors[getRating(getScorePercentage())]
                    }`}
                  >
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
            <div
              key={sectionIdx}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{section.title}</h3>
                <span className="text-sm text-gray-600">
                  {getSectionScore(section)}/{getSectionMaxScore(section)}
                </span>
              </div>

              <div className="divide-y divide-gray-100">
                {section.items.map((item, itemIdx) => {
                  const ukey = `${sectionIdx}:${itemIdx}`;
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-900 flex-1">
                          {item.text}{" "}
                          {item.maxScore !== 10 && (
                            <span className="text-gray-400">(w{item.maxScore})</span>
                          )}
                        </span>
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

                      {/* Comments — every point, not just failures */}
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => updateItemNotes(sectionIdx, itemIdx, e.target.value)}
                        placeholder="Comments…"
                        className={`mt-2 w-full px-3 py-1.5 border rounded-lg text-sm text-gray-900 bg-white ${
                          item.status === "fail" ? "border-red-200 bg-red-50" : "border-gray-200"
                        }`}
                      />

                      {/* Photo proof — under the comments, every point */}
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          type="button"
                          onClick={() => fileInputs.current[ukey]?.click()}
                          disabled={!!uploading[ukey]}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Upload Photo
                        </button>
                        {uploading[ukey] && (
                          <span className="text-xs text-gray-500">Uploading…</span>
                        )}
                        <input
                          ref={(el) => {
                            fileInputs.current[ukey] = el;
                          }}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void uploadPhotos(sectionIdx, itemIdx, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </div>

                      {item.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {item.photos.map((path, pi) => (
                            <div key={`${path}-${pi}`} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photoSrc(path)}
                                alt="inspection proof"
                                className="h-16 w-16 rounded-lg object-cover border border-gray-200"
                              />
                              {!readOnly && (
                                <button
                                  type="button"
                                  aria-label="Remove photo"
                                  onClick={() => removePhoto(sectionIdx, itemIdx, path)}
                                  className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-0.5 text-gray-400 hover:text-red-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-bold text-green-700 mb-2">Strengths</label>
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
              onClick={() => void saveInspection()}
              disabled={saving}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save & Submit Inspection"}
            </button>
            <button
              onClick={resetForm}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              Reset
            </button>
          </div>
        </>
      ) : (
        /* History */
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">Loading saved inspections…</p>
            </div>
          ) : savedInspections.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">No saved inspections yet</p>
            </div>
          ) : (
            savedInspections.map((inspection) => {
              const percentage =
                inspection.maxScore > 0
                  ? Math.round((inspection.overallScore / inspection.maxScore) * 100)
                  : 0;
              const photoCount = inspection.sections.reduce(
                (sum, s) => sum + s.items.reduce((n, i) => n + i.photos.length, 0),
                0
              );
              return (
                <div key={inspection.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">
                          {inspection.date} — {inspection.inspector}
                        </h3>
                        {ratingLabels[inspection.rating] && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ratingColors[inspection.rating]}`}
                          >
                            {ratingLabels[inspection.rating]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {inspection.overallScore}/{inspection.maxScore} ({percentage}%)
                        {inspection.inspectorRole && ` · ${inspection.inspectorRole}`}
                        {photoCount > 0 && ` · ${photoCount} photo${photoCount === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => loadInspection(inspection)}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => void deleteInspection(inspection.id)}
                          aria-label="Delete inspection"
                          className="text-gray-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
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
