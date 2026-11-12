"use client";

// The "one module, any industry" demo. Each tab is a product module; each
// module shows the same shape of record used by two different trades, so the
// visitor sees the width of the platform without reading a list.
import { useRef, useState } from "react";
import {
  ClipboardCheck,
  PackageSearch,
  CalendarDays,
  FileText,
  ShieldCheck,
} from "lucide-react";

type Row = { k: string; t: string; state: "ok" | "warn"; note: string };
type Tab = {
  id: string;
  label: string;
  icon: typeof ClipboardCheck;
  title: string;
  who: string;
  rows: Row[];
  also: { industry: string; example: string }[];
  stat: { num: string; label: string; pct: number };
};

const TABS: Tab[] = [
  {
    id: "checks",
    label: "Checks",
    icon: ClipboardCheck,
    title: "Opening checks · Route 12",
    who: "Gas station",
    rows: [
      { k: "Pump calibration", t: "06:02", state: "ok", note: "done" },
      { k: "Forecourt safety", t: "06:11", state: "ok", note: "done" },
      { k: "Cash drawer float", t: "06:20", state: "ok", note: "done" },
      { k: "Air compressor", t: "09:40", state: "warn", note: "late" },
    ],
    also: [
      { industry: "Restaurants", example: "Opening temperature checks" },
      { industry: "Daycares", example: "Room safety walk-through" },
      { industry: "Construction", example: "Site pre-start" },
    ],
    stat: { num: "18/19", label: "checks completed on time", pct: 95 },
  },
  {
    id: "counts",
    label: "Counts",
    icon: PackageSearch,
    title: "Inventory count · Week 46",
    who: "Convenience store",
    rows: [
      { k: "Beverage case", t: "08:05", state: "ok", note: "142" },
      { k: "Snack gantry", t: "08:22", state: "ok", note: "318" },
      { k: "Tobacco cabinet", t: "08:40", state: "ok", note: "sealed" },
      { k: "Lottery stock", t: "09:12", state: "warn", note: "variance" },
    ],
    also: [
      { industry: "Pharmacies", example: "Controlled drug count" },
      { industry: "Auto repair", example: "Parts and consumables" },
      { industry: "Warehouses", example: "Cycle count by bay" },
    ],
    stat: { num: "1,042", label: "units reconciled this week", pct: 92 },
  },
  {
    id: "schedule",
    label: "Schedule",
    icon: CalendarDays,
    title: "Cover · Thu 13 Nov",
    who: "Salon",
    rows: [
      { k: "Front desk", t: "09–17", state: "ok", note: "covered" },
      { k: "Senior stylist", t: "09–17", state: "ok", note: "covered" },
      { k: "Junior stylist", t: "12–20", state: "ok", note: "covered" },
      { k: "Weekend shift", t: "Sat", state: "warn", note: "1 open" },
    ],
    also: [
      { industry: "Logistics", example: "Driver rotation" },
      { industry: "Dental clinics", example: "Chair coverage" },
      { industry: "Bars & nightclubs", example: "Licensed door staff" },
    ],
    stat: { num: "46/47", label: "shifts covered next week", pct: 98 },
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileText,
    title: "Licence register · All sites",
    who: "Multi-site group",
    rows: [
      { k: "Business licence", t: "42 days", state: "warn", note: "review" },
      { k: "Public liability", t: "88 days", state: "ok", note: "current" },
      { k: "Fire suppression", t: "121 days", state: "ok", note: "current" },
      { k: "Staff certificates", t: "203 days", state: "ok", note: "current" },
    ],
    also: [
      { industry: "Law firms", example: "Practice certificates" },
      { industry: "Daycares", example: "Staff clearances" },
      { industry: "HVAC", example: "Trade licences" },
    ],
    stat: { num: "31/32", label: "documents valid today", pct: 97 },
  },
  {
    id: "inspections",
    label: "Inspections",
    icon: ShieldCheck,
    title: "Self-inspection · Q4",
    who: "Warehouse",
    rows: [
      { k: "Racking condition", t: "10:05", state: "ok", note: "pass" },
      { k: "Emergency egress", t: "10:22", state: "ok", note: "pass" },
      { k: "PPE compliance", t: "10:40", state: "ok", note: "pass" },
      { k: "Charging station", t: "11:02", state: "warn", note: "action" },
    ],
    also: [
      { industry: "Restaurants", example: "Hygiene self-audit" },
      { industry: "Gyms", example: "Equipment safety round" },
      { industry: "Schools", example: "Facilities walk-through" },
    ],
    stat: { num: "24/25", label: "inspection items passed", pct: 96 },
  },
];

export function ModuleDemo() {
  const [active, setActive] = useState(TABS[0].id);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  // Roving tabindex: only the selected tab is in the tab order, and the
  // arrow keys move between them — the pattern a keyboard user expects.
  const select = (id: string) => {
    setActive(id);
    buttons.current.get(id)?.focus();
  };
  const move = (delta: number) => {
    const at = TABS.findIndex((t) => t.id === active);
    select(TABS[(at + delta + TABS.length) % TABS.length].id);
  };

  return (
    <div className="demo">
      <div className="demo__tabsRow">
        <div className="tabs" role="tablist" aria-label="Log type">
          {TABS.map((t) => {
            const Icon = t.icon;
            const selected = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                ref={(element) => {
                  if (element) buttons.current.set(t.id, element);
                  else buttons.current.delete(t.id);
                }}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                aria-controls="log-panel"
                tabIndex={selected ? 0 : -1}
                className="tab"
                onClick={() => setActive(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
                  else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
                  else if (e.key === "Home") { e.preventDefault(); select(TABS[0].id); }
                  else if (e.key === "End") { e.preventDefault(); select(TABS[TABS.length - 1].id); }
                }}
              >
                <Icon size={15} strokeWidth={1.9} aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
        <span className="demo__hint small">Same module · different trade</span>
      </div>

      <div
        className="demo__panel"
        id="log-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`tab-${tab.id}`}
        key={tab.id}
      >
        <div className="log">
          <div className="log__head">
            <span className="log__title">
              <span className="log__who">{tab.who}</span>
              {tab.title}
            </span>
            <span className="pill pill--good">
              <span className="live" style={{ width: 6, height: 6 }} aria-hidden />
              sample data
            </span>
          </div>
          <div className="log__rows">
            {tab.rows.map((r, i) => (
              <div
                className="log__row"
                key={r.k}
                style={{ animationDelay: `${40 + i * 55}ms` }}
              >
                <span className="k">{r.k}</span>
                <span className="t">{r.t}</span>
                <span className={r.state === "ok" ? "ok" : "warn"}>{r.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="demo__side">
          <div className="stat">
            <div className="stat__num tabular">{tab.stat.num}</div>
            <div className="stat__label">{tab.stat.label}</div>
            <div className="meter" aria-hidden>
              <div className="meter__fill" style={{ width: `${tab.stat.pct}%` }} />
            </div>
          </div>
          <div className="stat stat--also">
            <span className="stat__eyebrow">The same module, in</span>
            <ul className="also">
              {tab.also.map((a) => (
                <li key={a.industry}>
                  <span className="also__name">{a.industry}</span>
                  <span className="also__ex">{a.example}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
