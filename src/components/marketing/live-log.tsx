"use client";

// The "one shift, four logs" module. Real product vocabulary, small numbers,
// and an interaction that shows what changes when you switch log type.
import { useRef, useState } from "react";
import {
  Thermometer,
  ClipboardList,
  SprayCan,
  ShieldCheck,
} from "lucide-react";

type Row = { k: string; t: string; state: "ok" | "warn"; note: string };
type Tab = {
  id: string;
  label: string;
  icon: typeof Thermometer;
  title: string;
  rows: Row[];
  stat: { num: string; label: string; pct: number };
};

const TABS: Tab[] = [
  {
    id: "temps",
    label: "Temperature",
    icon: Thermometer,
    title: "Cold chain · Walk-in & line",
    rows: [
      { k: "Walk-in cooler", t: "06:12", state: "ok", note: "2.4°C" },
      { k: "Line fridge", t: "06:14", state: "ok", note: "3.1°C" },
      { k: "Freezer", t: "06:15", state: "ok", note: "−19.2°C" },
      { k: "Hot hold", t: "11:48", state: "warn", note: "62.8°C" },
    ],
    stat: { num: "42/44", label: "checks logged this week", pct: 95 },
  },
  {
    id: "prep",
    label: "Prep",
    icon: ClipboardList,
    title: "Prep sheet · Thursday, lunch",
    rows: [
      { k: "Dice onions, 2kg", t: "07:05", state: "ok", note: "done" },
      { k: "Portion slaw", t: "07:22", state: "ok", note: "done" },
      { k: "Marinate chicken", t: "08:10", state: "ok", note: "done" },
      { k: "Pickle red onion", t: "09:40", state: "warn", note: "late" },
    ],
    stat: { num: "18/19", label: "prep tasks hit on time", pct: 94 },
  },
  {
    id: "clean",
    label: "Cleaning",
    icon: SprayCan,
    title: "Cleaning schedule · closing",
    rows: [
      { k: "Fryer oil filter", t: "22:10", state: "ok", note: "done" },
      { k: "Cold room shelves", t: "22:30", state: "ok", note: "done" },
      { k: "Front of house wipe", t: "22:45", state: "ok", note: "done" },
      { k: "Extractor hood", t: "23:00", state: "warn", note: "due" },
    ],
    stat: { num: "26/27", label: "closing tasks signed off", pct: 96 },
  },
  {
    id: "renewals",
    label: "Renewals",
    icon: ShieldCheck,
    title: "Compliance register · all sites",
    rows: [
      { k: "Health permit", t: "42 days", state: "warn", note: "review" },
      { k: "Fire suppression", t: "88 days", state: "ok", note: "current" },
      { k: "Public liability", t: "121 days", state: "ok", note: "current" },
      { k: "Grease trap service", t: "203 days", state: "ok", note: "current" },
    ],
    stat: { num: "31/32", label: "licences valid today", pct: 97 },
  },
];

export function LiveLog() {
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
      <div className="tabs" role="tablist" aria-label="Log type">
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              ref={(element) => { if (element) buttons.current.set(t.id, element); else buttons.current.delete(t.id); }}
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Icon size={15} strokeWidth={1.9} />
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="demo__panel"
        id="log-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`tab-${tab.id}`}
        key={tab.id}
        style={{ animation: "fs-panel-in 0.35s cubic-bezier(0.2,0.8,0.2,1)" }}
      >
        <div className="log">
          <div className="log__head">
            <span className="log__title">{tab.title}</span>
            <span className="pill pill--good">
              <span
                className="live"
                style={{ width: 6, height: 6, background: "#3f8f5f" }}
              />
              sample data
            </span>
          </div>
          <div className="log__rows">
            {tab.rows.map((r) => (
              <div className="log__row" key={r.k}>
                <span className="k">{r.k}</span>
                <span className="t">{r.t}</span>
                <span className={r.state === "ok" ? "ok" : "warn"}>
                  {r.note}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="demo__side">
          <div className="stat">
            <div className="stat__num">{tab.stat.num}</div>
            <div className="stat__label">{tab.stat.label}</div>
            <div className="meter" aria-hidden>
              <div
                className="meter__fill"
                style={{ width: `${tab.stat.pct}%` }}
              />
            </div>
          </div>
          <div className="stat" style={{ flex: 1, display: "grid", alignContent: "center" }}>
            <p className="small" style={{ margin: 0 }}>
              A preview of the records your team works with. Open the demo
              to explore the tools and dashboards for each role.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fs-panel-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
