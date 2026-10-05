"use client";

// Opening & Closing — its own box on the hub (was the middle tab of the Daily
// Prep Sheet). Duties are shared with the Daily Kitchen Checks page via
// src/lib/btb-checklists.ts; ticks live on the tablet (localStorage, keyed by
// date) because the BTB surface has no Supabase session to write under.
import { useEffect, useState } from "react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { PageHeader } from "@/components/ui";
import {
  checklistProgress,
  defaultClosingItems,
  defaultOpeningItems,
  type ChecklistItem,
} from "@/lib/btb-checklists";

type CheckType = "opening" | "closing";

// Same key the prep sheet's old Checklist tab wrote — existing ticks carry over.
const checklistKey = (date: string, type: CheckType) => `foodsafety.prep_checklist.${date}.${type}`;

function readChecklist(date: string, type: CheckType): ChecklistItem[] {
  const fallback = type === "opening" ? defaultOpeningItems : defaultClosingItems;
  try {
    const raw = localStorage.getItem(checklistKey(date, type));
    const parsed = raw ? (JSON.parse(raw) as ChecklistItem[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeChecklist(date: string, type: CheckType, items: ChecklistItem[]): void {
  try {
    localStorage.setItem(checklistKey(date, type), JSON.stringify(items));
  } catch {
    // Private browsing / storage disabled — the ticks just won't survive a reload.
  }
}

export default function ChecklistsPage() {
  return (
    <BtbFeatureGate feature="checklists">
      {(readOnly) => <Checklists readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function Checklists({ readOnly }: { readOnly: boolean }) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [day, setDay] = useState(() =>
    new Date().toLocaleDateString("en-US", { weekday: "long" })
  );

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setDay(new Date(newDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }));
  };

  return (
    <div>
      <PageHeader
        title="Opening & Closing"
        subtitle="Daily open and close duties · Front and Kitchen · saved on this device"
      />

      {/* Date & Day — the checklists are per-day, like the printed sheet */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="checklist-date" className="text-sm font-medium text-gray-700">
            Date:
          </label>
          <input
            id="checklist-date"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Day:</label>
          <span className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-900 min-w-[7rem] text-center">
            {day}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChecklistCard title="Opening Checklist" icon="☀️" date={date} type="opening" readOnly={readOnly} />
        <ChecklistCard title="Closing Checklist" icon="🌙" date={date} type="closing" readOnly={readOnly} />
      </div>
    </div>
  );
}

function ChecklistCard({
  title,
  icon,
  date,
  type,
  readOnly,
}: {
  title: string;
  icon: string;
  date: string;
  type: CheckType;
  readOnly: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(() =>
    type === "opening" ? defaultOpeningItems : defaultClosingItems,
  );

  // localStorage is browser-only: read it just after mount (the dashboard's
  // active-location read does the same) so SSR and the first client render match.
  useEffect(() => {
    const t = setTimeout(() => setItems(readChecklist(date, type)), 0);
    return () => clearTimeout(t);
  }, [date, type]);

  const toggle = (id: string) => {
    const next = items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i));
    setItems(next);
    writeChecklist(date, type, next);
  };

  const reset = () => {
    const next = (type === "opening" ? defaultOpeningItems : defaultClosingItems).map((i) => ({
      ...i,
    }));
    setItems(next);
    writeChecklist(date, type, next);
  };

  const { done, total } = checklistProgress(items);
  const sections = ["Front", "Kitchen"];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span aria-hidden>{icon}</span>
        <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
        <span className="ml-auto text-xs font-semibold text-gray-500">
          {done}/{total} done
        </span>
        {!readOnly && (
          <button
            onClick={reset}
            className="text-xs text-gray-400 hover:text-red-600 font-medium"
          >
            Reset
          </button>
        )}
      </div>

      {sections.map((section) => {
        const list = items.filter((i) => i.section === section);
        if (list.length === 0) return null;
        return (
          <div key={section}>
            <div className="px-4 py-1.5 bg-red-50 border-b border-gray-100">
              <h3 className="text-xs font-bold text-red-700 uppercase tracking-wide">
                {section} Area
              </h3>
            </div>
            {list.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-3 px-4 py-2 border-b border-gray-50 ${
                  readOnly ? "" : "cursor-pointer hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={readOnly}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 w-4 h-4 accent-red-600 shrink-0 disabled:cursor-not-allowed"
                />
                <span
                  className={`text-xs leading-relaxed ${
                    item.completed ? "text-gray-400 line-through" : "text-gray-700"
                  }`}
                >
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
