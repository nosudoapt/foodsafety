"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import {
  DATE_CATEGORIES,
  RECURRENCES,
  categoryLabel,
  daysUntil,
  dueStatus,
  isCategory,
  isRecurrence,
  nextOccurrence,
  prettyDate,
  sortDates,
  type CorporateDate,
} from "@/lib/tax-dates";

const COLS = "id, title, category, due_date, recurrence, notes, created_by, location_id";

const STATUS: Record<"overdue" | "soon" | "upcoming", { label: string; chip: string; accent: "red" | "amber" | "slate" }> = {
  overdue: { label: "Overdue", chip: "bg-red-50 text-red-700 border-red-100", accent: "red" },
  soon: { label: "Due soon", chip: "bg-amber-50 text-amber-700 border-amber-100", accent: "amber" },
  upcoming: { label: "Ahead", chip: "bg-slate-50 text-slate-500 border-slate-200", accent: "slate" },
};

const today = () => new Date().toISOString().slice(0, 10);

// Filing deadlines + renewals. Shared by the standalone Tax & Renewal Dates
// page and the combined Compliance page (which hides the header).
export default function TaxDatesPanel({ readOnly, showHeader = true }: { readOnly: boolean; showHeader?: boolean }) {
  const [rows, setRows] = useState<CorporateDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState({
    title: "",
    category: "tax",
    due_date: "",
    recurrence: "none",
    notes: "",
  });
  const [gstFreq, setGstFreq] = useState("quarterly");

  const now = today();

  const load = async () => {
    const scope = locationScope();
    let q = supabase.from("corporate_dates").select(COLS).order("due_date");
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load dates — run supabase/schema-tax-dates.sql, then reload.");
      setLoading(false);
      return;
    }
    setRows((data ?? []) as CorporateDate[]);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.category === filter)),
    [rows, filter],
  );
  const sorted = useMemo(() => sortDates(visible, now), [visible, now]);

  const overdue = sorted.filter((r) => dueStatus(r.due_date, now) === "overdue").length;
  const soon = sorted.filter((r) => dueStatus(r.due_date, now) === "soon").length;

  const save = async () => {
    if (readOnly || saving) return;
    const title = form.title.trim();
    if (!title) {
      setError("Give the deadline a name first (e.g. \"GST/HST return\").");
      return;
    }
    if (!form.due_date) {
      setError("Pick the due date first.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("corporate_dates").insert({
      title,
      category: isCategory(form.category) ? form.category : "other",
      due_date: form.due_date,
      recurrence: isRecurrence(form.recurrence) ? form.recurrence : "none",
      notes: form.notes.trim() || null,
      created_by: null,
      location_id: activeLocationId(),
    });
    if (err) {
      setError("Couldn't save — run supabase/schema-tax-dates.sql, then retry.");
      setSaving(false);
      return;
    }
    setNotice(`Added: ${title}`);
    setForm({ title: "", category: "tax", due_date: "", recurrence: "none", notes: "" });
    setSaving(false);
    await load();
  };

  const remove = async (id: string) => {
    if (readOnly) return;
    setError(null);
    const { error: err } = await supabase.from("corporate_dates").delete().eq("id", id);
    if (err) {
      setError("Couldn't delete — run supabase/schema-tax-dates.sql, then retry.");
      return;
    }
    setNotice("Deadline removed");
    await load();
  };

  // One-tap presets: GST return on the chosen filing frequency, CRA annual filing.
  const quickAdd = async (title: string, recurrence: string, due_date: string, notes: string) => {
    if (readOnly || saving) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("corporate_dates").insert({
      title,
      category: "tax",
      due_date,
      recurrence,
      notes,
      created_by: null,
      location_id: activeLocationId(),
    });
    if (err) {
      setError("Couldn't save — run supabase/schema-tax-dates.sql, then retry.");
      setSaving(false);
      return;
    }
    setNotice(`Added: ${title}`);
    setSaving(false);
    await load();
  };

  return (
    <div>
      {showHeader && (
        <PageHeader
          title="Tax & Renewal Dates"
          subtitle="GST / PST returns, registry renewals, year-end filings and licences"
          action={notice ? <Badge accent="green">{notice}</Badge> : undefined}
        />
      )}
      {!showHeader && notice && (
        <div className="mb-4">
          <Badge accent="green">{notice}</Badge>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        {["all", ...DATE_CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 h-8 rounded-full text-xs font-semibold border transition-colors ${
              filter === c
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {c === "all" ? "All" : categoryLabel(c)}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 self-center">
          {overdue} overdue · {soon} due within 7 days
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <Card className="p-8 text-center text-sm text-slate-400">Loading…</Card>
          ) : sorted.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-400">
              Nothing here yet{filter !== "all" ? ` for ${categoryLabel(filter).toLowerCase()}` : ""}.
            </Card>
          ) : (
            sorted.map((r) => {
              const status = dueStatus(r.due_date, now);
              const shownDate =
                r.recurrence !== "none" ? nextOccurrence(r.due_date, r.recurrence, now) : r.due_date;
              const shownStatus = r.recurrence !== "none" ? dueStatus(shownDate, now) : status;
              const shownAway = daysUntil(shownDate, now);
              const st = STATUS[shownStatus];
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate">{r.title}</p>
                        <Badge accent={st.accent}>
                          {shownAway < 0
                            ? `${Math.abs(shownAway)}d overdue`
                            : shownAway === 0
                              ? "Due today"
                              : `In ${shownAway}d`}
                        </Badge>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${st.chip}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {categoryLabel(r.category)} · {prettyDate(shownDate)}
                        {r.recurrence !== "none" && (
                          <span className="text-slate-400"> · repeats {r.recurrence}</span>
                        )}
                        {status === "overdue" && r.recurrence !== "none" && (
                          <span className="text-slate-400"> (original {prettyDate(r.due_date)})</span>
                        )}
                      </p>
                      {r.notes && <p className="mt-1 text-xs text-slate-400">{r.notes}</p>}
                    </div>
                    {!readOnly && (
                      <button
                        aria-label={`Delete ${r.title}`}
                        className="text-slate-300 hover:text-red-600 shrink-0"
                        onClick={() => remove(r.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {!readOnly && (
          <Card className="p-4 h-fit">
            <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-red-600" /> Add a deadline
            </p>
            <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Quick add</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="GST filing frequency"
                  className="font-bold text-slate-900 text-xs bg-white border border-slate-300 rounded-lg px-2 h-8 outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  value={gstFreq}
                  onChange={(e) => setGstFreq(e.target.value)}
                >
                  <option value="monthly">GST · monthly</option>
                  <option value="quarterly">GST · quarterly</option>
                  <option value="annual">GST · annually</option>
                </select>
                <Button
                  accent="red"
                  variant="soft"
                  disabled={saving}
                  onClick={() =>
                    quickAdd(
                      "GST Return",
                      gstFreq,
                      today(),
                      `GST filing (${gstFreq}) — adjust the date to your period end`,
                    )
                  }
                >
                  + GST return
                </Button>
                <Button
                  accent="red"
                  variant="soft"
                  disabled={saving}
                  onClick={() =>
                    quickAdd(
                      "CRA Annual Tax Filing",
                      "annual",
                      today(),
                      "T2 corporate return — adjust to your year-end + 6 months",
                    )
                  }
                >
                  + CRA annual filing
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-500 mb-1">Name *</span>
                <Input
                  accent="red"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="GST/HST return"
                />
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-500 mb-1">Type</span>
                <select
                  className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent w-full"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {DATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-500 mb-1">Due date *</span>
                <Input
                  accent="red"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-500 mb-1">Repeats</span>
                <select
                  className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent w-full"
                  value={form.recurrence}
                  onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
                >
                  {RECURRENCES.map((r) => (
                    <option key={r} value={r}>
                      {r === "none" ? "Doesn't repeat" : r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-500 mb-1">Notes</span>
                <Input
                  accent="red"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Portal login, form #, contact…"
                />
              </label>
              <Button accent="red" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Add Deadline"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
