"use client";
// Field-level edit history for one sheet area. Owner, supervisor and corporate
// only — the server decides, so a manager or staff member never renders this and
// is refused with 403 if they call the endpoint anyway.
//
// The log is fetched only when the drawer is opened, so opening a sheet stays
// one request.

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

interface Entry {
  id: string;
  area: "prep" | "order";
  sheet_date: string;
  actor_name: string;
  actor_role: string;
  section: string;
  item_name: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const ROLE: Record<string, string> = {
  owner: "Owner", supervisor: "Supervisor", corporate: "Corporate",
  manager: "Manager", staff: "Staff",
};

function when(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/** "false → true" reads better than a raw pair for the DONE tick. */
const value = (text: string | null) => (text === null ? "empty" : text === "true" ? "true" : text === "false" ? "false" : text);

export default function EditLogPanel({ area, days = 45, canView }: { area: "prep" | "order"; days?: number; canView?: boolean }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(canView ?? null);

  // Only when the page has not already told us: ask for the capability, never
  // for the rows. A manager or staff member gets false and this renders nothing.
  useEffect(() => {
    if (canView !== undefined) return;
    let alive = true;
    fetchJson<{ canView?: boolean }>("/api/btb/edit-log?permission=1")
      .then((data) => { if (alive) setAllowed(data.canView === true); })
      .catch(() => { if (alive) setAllowed(false); });
    return () => { alive = false; };
  }, [canView]);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await fetchJson<{ entries: Entry[] }>(`/api/btb/edit-log?area=${area}`);
      setEntries(data.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The edit log could not be loaded.");
    } finally { setBusy(false); }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && entries === null) void load();
  };

  if (allowed !== true) return null;

  return (
    <div className="no-print relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        {open ? "Hide edit log" : "Edit log"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,30rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Last {days} days</p>
            <button type="button" onClick={() => void load()} disabled={busy} className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-60">
              {busy ? "Loading…" : "Refresh"}
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto px-3 py-2">
            {error && <p className="text-xs text-red-600">{error}</p>}
            {!error && entries === null && <p className="text-xs text-slate-500">Loading…</p>}
            {!error && entries?.length === 0 && <p className="text-xs text-slate-500">No changes recorded yet.</p>}
            <ul className="space-y-2">
              {(entries ?? []).map((entry) => (
                <li key={entry.id} className="text-xs leading-relaxed text-slate-700">
                  <span className="font-semibold">{entry.actor_name}</span>
                  <span className="text-slate-500"> ({ROLE[entry.actor_role] ?? entry.actor_role})</span>
                  {" changed "}
                  <span className="font-medium">
                    {entry.section ? `${entry.section} → ` : ""}{entry.item_name || "the sheet"} {entry.field}
                  </span>
                  {": "}
                  <span className="text-slate-500">{value(entry.old_value)}</span>
                  {" → "}
                  <span className="font-semibold">{value(entry.new_value)}</span>
                  <span className="text-slate-400"> · {entry.sheet_date} · {when(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
