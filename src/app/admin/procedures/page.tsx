"use client";

import { useMemo, useState } from "react";
import {
  ScrollText,
  Search,
  Thermometer,
  Hand,
  Package,
  Flame,
  SprayCan,
  Siren,
} from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, Card, Badge, EmptyState, inputClass } from "@/components/ui";

interface Procedure {
  id: string;
  category: string;
  title: string;
  summary: string;
  steps: string[];
  critical?: boolean;
}

const procedures: Procedure[] = [
  {
    id: "t-prep",
    category: "Temperature",
    title: "Receiving deliveries",
    summary: "Reject anything out of the danger zone before it hits the walk-in.",
    critical: true,
    steps: [
      "Check truck temperature logger or probe the delivery.",
      "Cold items ≤4°C, frozen solid, hot items ≥60°C.",
      "Inspect packaging for damage, pests, or off smells.",
      "Reject and note on delivery sheet if any check fails.",
      "Date-label and rotate FIFO within 30 minutes.",
    ],
  },
  {
    id: "t-cool",
    category: "Temperature",
    title: "Cooling cooked food safely",
    summary: "60→21°C in 2 hrs, 21→4°C in 4 hrs — no exceptions.",
    critical: true,
    steps: [
      "Portion into shallow pans (≤5 cm depth).",
      "Ice-bath or blast chill if available; never seal hot in a sealed container.",
      "Record temps at 2 hours and 6 hours on the temp sheet.",
      "Discard if either target is missed.",
    ],
  },
  {
    id: "t-calibrate",
    category: "Temperature",
    title: "Calibrate the probe thermometer",
    summary: "Ice-point method — daily before first temp run.",
    steps: [
      "Fill a cup with crushed ice and a little water; wait 1 minute.",
      "Insert probe, stir gently, wait 30 seconds.",
      "Should read 0°C (±1). Adjust the nut/screw until it does.",
      "Log calibration on the temp sheet.",
    ],
  },
  {
    id: "h-hands",
    category: "Hygiene",
    title: "Handwashing (20 seconds)",
    summary: "Wet, soap, scrub 20 s, rinse, single-use dry.",
    critical: true,
    steps: [
      "Wet hands with warm water.",
      "Apply soap and scrub palms, backs, between fingers, nails — 20 seconds.",
      "Rinse thoroughly.",
      "Dry with paper towel or air dryer.",
      "Use the paper to turn off the faucet.",
    ],
  },
  {
    id: "h-illness",
    category: "Hygiene",
    title: "Employee illness check",
    summary: "Vomiting, diarrhea, fever, jaundice → out of the kitchen.",
    critical: true,
    steps: [
      "Self-check before every shift.",
      "Report symptoms to the manager immediately.",
      "Do not return for 24 hours after symptoms stop (48 h for vomiting/diarrhea).",
      "Manager documents the exclusion on the incident form.",
    ],
  },
  {
    id: "r-fifo",
    category: "Storage",
    title: "FIFO rotation",
    summary: "First in, first out — oldest product to the front.",
    steps: [
      "New stock goes behind existing stock.",
      "Check dates every restock.",
      "Date-label all opened or prepared items.",
      "Discard anything past use-by; log the waste.",
    ],
  },
  {
    id: "r-raw",
    category: "Storage",
    title: "Raw storage order",
    summary: "Cooked above raw, ready-to-eat at the top.",
    critical: true,
    steps: [
      "Top shelf: ready-to-eat / cooked.",
      "Middle: whole cuts, fish.",
      "Bottom: ground meat & poultry — never above anything else.",
      "Store in pans with lips to catch drips.",
    ],
  },
  {
    id: "c-sanitizer",
    category: "Cleaning",
    title: "Sanitizer concentration check",
    summary: "Test every 4 hours with the correct test strip.",
    steps: [
      "Quat: 200–400 ppm · Chlorine: 50–100 ppm.",
      "Dip strip, match colour, record on cleaning sheet.",
      "Remake the solution if out of range.",
      "Never mix chlorine and quat chemicals.",
    ],
  },
  {
    id: "c-grease",
    category: "Cleaning",
    title: "Flat top / grill close-down",
    summary: "Scrape, scrub, squeegee, oil — every night.",
    steps: [
      "Scrape residue while the surface is still warm.",
      "Apply grill cleaner, scrub with pad.",
      "Squeegee into the grease trough.",
      "Wipe with a damp cloth, then lightly oil.",
      "Empty and clean the grease trap bucket.",
    ],
  },
  {
    id: "e-gas",
    category: "Equipment",
    title: "Gas smell / leak response",
    summary: "No flames, no switches — evacuate first.",
    critical: true,
    steps: [
      "Do not operate any switches or lighters.",
      "Shut off the gas at the manifold if it is safe to reach.",
      "Evacuate staff and guests.",
      "Call the gas company & fire department from outside.",
      "Do not re-enter until cleared.",
    ],
  },
  {
    id: "e-fire",
    category: "Emergency",
    title: "Fire extinguisher (PASS)",
    summary: "Pull, Aim, Squeeze, Sweep.",
    critical: true,
    steps: [
      "Pull the pin.",
      "Aim at the base of the fire, not the flames.",
      "Squeeze the handle.",
      "Sweep side to side until out.",
      "If it grows past a trash-can size, evacuate and call 911.",
    ],
  },
  {
    id: "e-cut",
    category: "Emergency",
    title: "Cut / injury on the line",
    summary: "Pressure, cover, report — then fill out an incident report.",
    steps: [
      "Apply direct pressure with a clean glove/bandage.",
      "Do not remove a soaked dressing — add on top.",
      "Wash the wound thoroughly once bleeding slows.",
      "Cover with a blue detectable bandage; glove the hand if on the cutting hand.",
      "Manager files an incident report same shift.",
    ],
  },
];

const categoryMeta: Record<string, { icon: ReactNode; tone: "red" | "blue" | "green" | "amber" | "purple" | "gray" }> = {
  Temperature: { icon: <Thermometer className="h-4 w-4" />, tone: "red" },
  Hygiene: { icon: <Hand className="h-4 w-4" />, tone: "blue" },
  Storage: { icon: <Package className="h-4 w-4" />, tone: "green" },
  Cleaning: { icon: <SprayCan className="h-4 w-4" />, tone: "purple" },
  Equipment: { icon: <Flame className="h-4 w-4" />, tone: "amber" },
  Emergency: { icon: <Siren className="h-4 w-4" />, tone: "red" },
};

export default function ProceduresPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(
    () => ["All", ...Object.keys(categoryMeta).filter((c) => procedures.some((p) => p.category === c))],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return procedures.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.steps.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [query, category]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procedure cheat sheet"
        description="Clear, short procedures for the moments that matter — temps, hygiene, storage, equipment, and emergencies."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search procedures…"
            className={`${inputClass} pl-9`}
            aria-label="Search procedures"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer ${
                category === c
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<ScrollText className="h-5 w-5" />}
            title="No procedures found"
            description="Try another search or clear the category filter."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((proc) => {
            const meta = categoryMeta[proc.category];
            const open = expanded === proc.id;
            return (
              <Card key={proc.id} padded={false} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : proc.id)}
                  className="w-full text-left px-5 py-4 transition-colors hover:bg-gray-50/70 cursor-pointer"
                  aria-expanded={open}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                      {meta?.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-[14px] font-semibold text-gray-900">{proc.title}</h2>
                        {proc.critical && <Badge tone="red">Critical</Badge>}
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-gray-500 leading-snug">
                        {proc.summary}
                      </p>
                      <div className="mt-2">
                        <Badge tone={meta?.tone || "gray"}>{proc.category}</Badge>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400 shrink-0 mt-1">
                      {open ? "Hide" : `${proc.steps.length} steps`}
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
                    <ol className="space-y-2">
                      {proc.steps.map((step, i) => (
                        <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-gray-700">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-500">
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
