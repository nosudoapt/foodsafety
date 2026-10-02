"use client";

import { useEffect, useState } from "react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import {
  CASH_OUT_RETENTION_DAYS,
  isEmptyDraft,
  retentionCutoff,
  tillLeft,
  toDraft,
  totalCashIn,
  totalDropped,
  totalsFor,
  type CashOutRow,
} from "@/lib/cash-out";

const HISTORY_COLS =
  "id, count_date, till_amount, cash_sale, delivery_fees, driver_tips, cash_out, safe_drop, created_by, created_at";

const today = () => new Date().toISOString().slice(0, 10);

// End-of-day till reconciliation. Viewable by every BTB role (the matrix makes
// it view-only for staff/corporate); managers and owners fill it in.
export default function CashOutPage() {
  return (
    <BtbFeatureGate feature="cash_out">
      {(readOnly) => <CashOut readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function CashOut({ readOnly }: { readOnly: boolean }) {
  const [tab, setTab] = useState<"today" | "history">("today");
  const [date, setDate] = useState(today);
  const [form, setForm] = useState({
    till_amount: "",
    cash_sale: "",
    delivery_fees: "",
    driver_tips: "",
    cash_out: "",
    safe_drop: "",
  });
  const [history, setHistory] = useState<CashOutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);

  // Who is at the tablet — stored on the row as created_by.
  useEffect(() => {
    fetch("/api/btb/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name?: string } | null) => setCreatedBy(d?.name ?? null))
      .catch(() => undefined);
  }, []);

  const loadHistory = async () => {
    const cutoff = retentionCutoff(today());
    const scope = locationScope();
    let q = supabase
      .from("cash_outs")
      .select(HISTORY_COLS)
      .gte("count_date", cutoff)
      .order("count_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load history — run supabase/schema-cash-out.sql, then reload.");
      setLoading(false);
      return;
    }
    setHistory(
      ((data ?? []) as CashOutRow[]).map((r) => ({
        ...r,
        till_amount: Number(r.till_amount) || 0,
        cash_sale: Number(r.cash_sale) || 0,
        delivery_fees: Number(r.delivery_fees) || 0,
        driver_tips: Number(r.driver_tips) || 0,
        cash_out: Number(r.cash_out) || 0,
        safe_drop: Number(r.safe_drop) || 0,
      })),
    );
    setError(null);
    setLoading(false);
  };

  // Seed the form with the selected day so re-opening yesterday's count edits it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const scope = locationScope();
      let q = supabase
        .from("cash_outs")
        .select(HISTORY_COLS)
        .eq("count_date", date)
        .limit(1);
      if (scope) q = q.or(scope);
      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) {
        setError("Couldn't load this day — run supabase/schema-cash-out.sql, then reload.");
        setLoading(false);
        return;
      }
      const row = (data?.[0] as CashOutRow | undefined) ?? null;
      setForm(
        row
          ? {
              till_amount: String(Number(row.till_amount) || 0),
              cash_sale: String(Number(row.cash_sale) || 0),
              delivery_fees: String(Number(row.delivery_fees) || 0),
              driver_tips: String(Number(row.driver_tips) || 0),
              cash_out: String(Number(row.cash_out) || 0),
              safe_drop: String(Number(row.safe_drop) || 0),
            }
          : { till_amount: "", cash_sale: "", delivery_fees: "", driver_tips: "", cash_out: "", safe_drop: "" },
      );
      setError(null);
      setSavedAt(null);
      setLoading(false);
      // History rides along with the day that just loaded (same effect, async).
      void loadHistory();
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const draft = toDraft({ count_date: date, ...form });

  const save = async () => {
    if (readOnly || saving) return;
    if (isEmptyDraft(draft)) {
      setError("Nothing to save — fill in at least one amount first.");
      return;
    }
    setSaving(true);
    setError(null);

    const scope = locationScope();
    let del = supabase.from("cash_outs").delete().eq("count_date", date);
    if (scope) del = del.or(scope);
    const { error: delErr } = await del;
    if (delErr) {
      setError("Couldn't save — run supabase/schema-cash-out.sql, then retry.");
      setSaving(false);
      return;
    }
    const { error: insErr } = await supabase.from("cash_outs").insert({
      ...draft,
      location_id: activeLocationId(),
      created_by: createdBy,
    });
    if (insErr) {
      setError("Couldn't save — run supabase/schema-cash-out.sql, then retry.");
      setSaving(false);
      return;
    }
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setSaving(false);
    loadHistory();
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSavedAt(null);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const windowTotals = totalsFor(history);
  const cutoff = retentionCutoff(today());

  const FIELDS: { key: keyof typeof form; label: string; hint?: string }[] = [
    { key: "till_amount", label: "Till Amount", hint: "counted in the drawer" },
    { key: "cash_sale", label: "Cash Sale" },
    { key: "delivery_fees", label: "Delivery Fees" },
    { key: "driver_tips", label: "Driver Tips" },
    { key: "cash_out", label: "Cash Out", hint: "handed over" },
    { key: "safe_drop", label: "Safe", hint: "dropped" },
  ];

  return (
    <div>
      <PageHeader
        title="Cash Out"
        subtitle={`End-of-day till count · history kept ${CASH_OUT_RETENTION_DAYS} days`}
        action={savedAt ? <Badge accent="green">Saved {savedAt}</Badge> : undefined}
      />

      <div className="flex gap-2 mb-6">
        <Button accent="red" variant={tab === "today" ? "solid" : "soft"} onClick={() => setTab("today")}>
          Today&apos;s Count
        </Button>
        <Button
          accent="red"
          variant={tab === "history" ? "solid" : "soft"}
          onClick={() => {
            setTab("history");
            loadHistory();
          }}
        >
          History (30 days)
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === "today" ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-500 mb-1">Date</span>
              <Input type="date" accent="red" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </label>
            {FIELDS.map((f) => (
              <label key={f.key} className="text-sm grow min-w-[8rem]">
                <span className="block text-xs font-medium text-slate-500 mb-1">{f.label}</span>
                <Input
                  accent="red"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  title={f.hint}
                  value={form[f.key]}
                  onChange={set(f.key)}
                  readOnly={readOnly}
                  disabled={loading}
                />
              </label>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xl font-bold text-slate-900 tabular-nums">{totalCashIn(draft).toFixed(2)}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Cash in</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xl font-bold text-slate-900 tabular-nums">{totalDropped(draft).toFixed(2)}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Dropped</p>
            </div>
            <div
              className={`rounded-xl border px-4 py-3 ${
                tillLeft(draft) === 0
                  ? "bg-green-50 border-green-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <p className="text-xl font-bold text-slate-900 tabular-nums">{tillLeft(draft).toFixed(2)}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Left in till</p>
            </div>
          </div>

          {!readOnly && (
            <div className="mt-5">
              <Button accent="red" onClick={save} disabled={saving || loading}>
                {saving ? "Saving…" : "Save Cash Out"}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="text-left px-4 py-2 font-bold">Date</th>
                  <th className="text-right px-3 py-2 font-bold">Till</th>
                  <th className="text-right px-3 py-2 font-bold">Sale</th>
                  <th className="text-right px-3 py-2 font-bold">Fees</th>
                  <th className="text-right px-3 py-2 font-bold">Tips</th>
                  <th className="text-right px-3 py-2 font-bold">Cash Out</th>
                  <th className="text-right px-3 py-2 font-bold">Safe</th>
                  <th className="text-right px-3 py-2 font-bold">Left</th>
                  <th className="text-left px-4 py-2 font-bold">By</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No cash-outs since {cutoff}
                    </td>
                  </tr>
                ) : (
                  history.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{r.count_date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.till_amount.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.cash_sale.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.delivery_fees.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.driver_tips.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.cash_out.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.safe_drop.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{tillLeft(r).toFixed(2)}</td>
                      <td className="px-4 py-2 text-slate-500">{r.created_by ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {!loading && history.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td className="px-4 py-2">Totals ({history.length} days)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{windowTotals.till_amount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{windowTotals.cash_sale.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{windowTotals.delivery_fees.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{windowTotals.driver_tips.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{windowTotals.cash_out.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{windowTotals.safe_drop.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {tillLeft(windowTotals).toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
