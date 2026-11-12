"use client";

// The hero's proof. A live operations register that keeps swapping industry,
// log type, site and metric — because the same platform is doing all of them.
// No lists, no feature grid: the visitor infers the breadth from the motion.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";

type Vendor = {
  industry: string;
  module: string;
  site: string;
  rows: { k: string; v: string; s?: "ok" | "warn" | "info" }[];
  metric: { label: string; value: string; unit?: string; pct: number };
};

const VIGNETTES: Vendor[] = [
  {
    industry: "Restaurants",
    module: "Cold chain",
    site: "Location 01 · Toronto",
    rows: [
      { k: "Walk-in cooler", v: "2.4°C", s: "ok" },
      { k: "Line fridge", v: "3.1°C", s: "ok" },
      { k: "Hot hold", v: "62.8°C", s: "warn" },
    ],
    metric: { label: "Checks logged this week", value: "42", unit: "/44", pct: 95 },
  },
  {
    industry: "Pharmacies",
    module: "Licence register",
    site: "Location 03 · Vancouver",
    rows: [
      { k: "Operating licence", v: "42 days", s: "warn" },
      { k: "Controlled storage", v: "current", s: "ok" },
      { k: "Staff certification", v: "6 of 6", s: "ok" },
    ],
    metric: { label: "Renewals cleared this quarter", value: "31", unit: "/32", pct: 97 },
  },
  {
    industry: "Construction",
    module: "Site opening",
    site: "Job 118 · Mississauga",
    rows: [
      { k: "Cert 001 signed", v: "07:14", s: "ok" },
      { k: "Plant induction", v: "11 of 12", s: "ok" },
      { k: "Harness inspection", v: "overdue", s: "warn" },
    ],
    metric: { label: "Pre-starts closed on time", value: "18", unit: "/19", pct: 94 },
  },
  {
    industry: "Salons & Spas",
    module: "Opening checklist",
    site: "Location 02 · Calgary",
    rows: [
      { k: "Station reset", v: "09:02", s: "ok" },
      { k: "Tool sterilisation", v: "logged", s: "ok" },
      { k: "Product count", v: "recount", s: "warn" },
    ],
    metric: { label: "Opening tasks signed off", value: "26", unit: "/27", pct: 96 },
  },
  {
    industry: "Auto repair",
    module: "Asset inspections",
    site: "Bay 4 · Ottawa",
    rows: [
      { k: "Hoist 2", v: "passed", s: "ok" },
      { k: "Compressor", v: "service due", s: "warn" },
      { k: "Fire suppression", v: "88 days", s: "info" },
    ],
    metric: { label: "Assets in service today", value: "74", unit: "/76", pct: 97 },
  },
  {
    industry: "Hotels",
    module: "Housekeeping",
    site: "Property · Halifax",
    rows: [
      { k: "Floor 3 turn", v: "14 of 14", s: "ok" },
      { k: "Maintenance", v: "2 open", s: "warn" },
      { k: "Linen par", v: "on target", s: "ok" },
    ],
    metric: { label: "Rooms ready by 3pm", value: "118", unit: "/121", pct: 97 },
  },
  {
    industry: "Warehouses",
    module: "Shift handover",
    site: "DC · Mississauga",
    rows: [
      { k: "Forklift pre-use", v: "9 of 9", s: "ok" },
      { k: "Pallet count", v: "1,042", s: "ok" },
      { k: "Damage report", v: "3 flagged", s: "warn" },
    ],
    metric: { label: "Handovers completed", value: "21", unit: "/21", pct: 100 },
  },
  {
    industry: "Dental clinics",
    module: "Sterilisation log",
    site: "Clinic 07 · Victoria",
    rows: [
      { k: "Autoclave 1", v: "cycle 04", s: "ok" },
      { k: "Spore test", v: "passed", s: "ok" },
      { k: "Waterline flush", v: "due 09:00", s: "info" },
    ],
    metric: { label: "Compliance items current", value: "48", unit: "/48", pct: 100 },
  },
];

const TICK = 3400;

export function IndustryRegister() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (paused || reduced) return;
    timer.current = window.setTimeout(
      () => setIndex((i) => (i + 1) % VIGNETTES.length),
      TICK
    );
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, paused, reduced]);

  const v = VIGNETTES[index];

  return (
    <div
      className="reg"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* window chrome — it is software, and it is live */}
      <div className="reg__chrome">
        <span className="reg__lights" aria-hidden>
          <i /> <i /> <i />
        </span>
        <span className="reg__url">
          <span className="reg__lock" aria-hidden />
          app.pholo.ca/{v.module.toLowerCase().replace(/[^a-z]+/g, "-")}
        </span>
        <span className="reg__live">
          <span className="live" aria-hidden /> live
        </span>
      </div>

      <div className="reg__head" key={`h-${index}`}>
        <span className="reg__eyebrow">
          <span className="reg__swap">{v.industry}</span>
          <span className="reg__dots" aria-hidden>
            {VIGNETTES.map((_, i) => (
              <i key={i} data-on={i === index ? "true" : "false"} />
            ))}
          </span>
        </span>
        <h2 className="reg__module">{v.module}</h2>
        <span className="reg__site">{v.site}</span>
      </div>

      <div className="reg__rows" key={`r-${index}`}>
        {v.rows.map((r, i) => (
          <div className="reg__row" key={r.k} style={{ animationDelay: `${60 + i * 70}ms` }}>
            <span className="reg__k">{r.k}</span>
            <span className={`reg__v reg__v--${r.s ?? "ok"}`}>
              {r.s === "ok" && <span className="reg__tick" aria-hidden />}
              {r.s === "warn" && <span className="reg__flag" aria-hidden />}
              {r.v}
            </span>
          </div>
        ))}
      </div>

      <div className="reg__metric" key={`m-${index}`}>
        <div className="reg__metricTop">
          <span className="reg__metricLabel">{v.metric.label}</span>
          <span className="reg__metricValue tabular">
            {v.metric.value}
            <small>{v.metric.unit}</small>
          </span>
        </div>
        <div className="reg__meter" aria-hidden>
          <span
            className="reg__meterFill"
            style={{ width: `${v.metric.pct}%`, animationDelay: "160ms" }}
          />
        </div>
      </div>

      <div className="reg__foot">
        <span className="reg__footItem">One record</span>
        <span className="reg__footSep" aria-hidden>·</span>
        <span className="reg__footItem">Every role</span>
        <span className="reg__footSep" aria-hidden>·</span>
        <span className="reg__footItem">Every location</span>
        <span className="reg__footBadge">Sample data</span>
      </div>
    </div>
  );
}
