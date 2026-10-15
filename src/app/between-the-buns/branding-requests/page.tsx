"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, Trash2 } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import type { BtbRole } from "@/lib/btb-roles";
import {
  BRANDING_CATEGORIES,
  BRANDING_PRIORITIES,
  boardColumns,
  categoryLabel,
  dueTone,
  isCategory,
  isPriority,
  isStatus,
  priorityAccent,
  priorityLabel,
  sizesFor,
  statusAccent,
  statusCounts,
  statusLabel,
  type BrandingRequest,
} from "@/lib/branding-requests";

const COLS =
  "id, title, category, description, priority, status, requested_by, contact_email, file_url, file_name, size, due_date, location_id, created_at, updated_at";

const today = () => new Date().toISOString().slice(0, 10);

const DUE_STYLE: Record<string, string> = {
  overdue: "text-red-600 font-semibold",
  soon: "text-amber-600 font-semibold",
  ok: "text-slate-500",
  none: "text-slate-300",
};

const DOT: Record<string, string> = {
  open: "bg-red-400",
  in_review: "bg-amber-400",
  in_progress: "bg-purple-400",
  done: "bg-green-400",
  declined: "bg-slate-400",
};

const DUE_TEXT: Record<string, string> = {
  overdue: "Overdue",
  soon: "Due soon",
  ok: "On track",
  none: "No date",
};

// Signage / menu / uniform requests. Everyone may file one (the gate hands us
// the role); only managers move cards through the board or delete them.
export default function BrandingRequestsPage() {
  return (
    <BtbFeatureGate feature="branding_requests">
      {(readOnly, role) => <BrandingRequests readOnly={readOnly} role={role} />}
    </BtbFeatureGate>
  );
}

function BrandingRequests({ readOnly, role }: { readOnly: boolean; role: BtbRole }) {
  const [rows, setRows] = useState<BrandingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requester, setRequester] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    category: "uniform",
    size: "",
    priority: "normal",
    due_date: "",
    description: "",
    contact_email: "",
  });
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);

  const pickFile = async (f: File | undefined) => {
    setFileErr(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setFileErr("File must be under 5 MB — compress the image or PDF first.");
      return;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(f);
    }).catch(() => "");
    if (!url) {
      setFileErr("Couldn't read that file — try a JPG, PNG or PDF.");
      return;
    }
    setFile({ name: f.name, url });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/btb/me");
        const d = r.ok ? await r.json() : null;
        if (!cancelled) setRequester(d?.name ?? null);
      } catch {
        if (!cancelled) setRequester(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = async () => {
    const scope = locationScope();
    let q = supabase.from("branding_requests").select(COLS).order("created_at", { ascending: false }).limit(200);
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load requests — run supabase/schema-branding-requests.sql, then reload.");
      setLoading(false);
      return;
    }
    setRows((data ?? []) as BrandingRequest[]);
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

  const board = useMemo(() => boardColumns(rows), [rows]);
  const counts = useMemo(() => statusCounts(rows), [rows]);
  const now = today();

  const submit = async () => {
    if (saving) return;
    const title = form.title.trim();
    if (!title) {
      setError("Give the request a title first.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("branding_requests").insert({
      title,
      category: isCategory(form.category) ? form.category : "other",
      size: sizesFor(form.category).includes(form.size) ? form.size : null,
      priority: isPriority(form.priority) ? form.priority : "normal",
      due_date: form.due_date || null,
      description: form.description.trim() || null,
      requested_by: requester ?? role,
      contact_email: form.contact_email.trim() || null,
      file_url: file?.url ?? null,
      file_name: file?.name ?? null,
      location_id: activeLocationId(),
    });
    if (err) {
      setError("Couldn't file the request — run supabase/schema-branding-requests.sql, schema-branding-attachments.sql and schema-branding-size.sql, then retry.");
      setSaving(false);
      return;
    }
    setForm({ title: "", category: "uniform", size: "", priority: "normal", due_date: "", description: "", contact_email: "" });
    setFile(null);
    setNotice(`Filed: ${title}`);
    setSaving(false);
    await load();
  };

  const move = async (r: BrandingRequest, status: string) => {
    if (readOnly || !isStatus(status)) return;
    setError(null);
    const { error: err } = await supabase
      .from("branding_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (err) {
      setError("Couldn't move the card — run supabase/schema-branding-requests.sql, then retry.");
      return;
    }
    setNotice(`${r.title} → ${statusLabel(status)}`);
    await load();
  };

  const remove = async (id: string) => {
    if (readOnly) return;
    setError(null);
    const { error: err } = await supabase.from("branding_requests").delete().eq("id", id);
    if (err) {
      setError("Couldn't delete the request — run supabase/schema-branding-requests.sql, then retry.");
      return;
    }
    setNotice("Request deleted");
    await load();
  };

  const columns: { key: string; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "in_review", label: "In review" },
    { key: "in_progress", label: "In progress" },
    { key: "done", label: "Done" },
    { key: "declined", label: "Declined" },
  ];

  return (
    <div>
      <PageHeader
        title="Branding Requests"
        subtitle="Signage, menus, uniforms and packaging — filed by sites, worked by marketing"
        action={notice ? <Badge accent="green">{notice}</Badge> : undefined}
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {columns.map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
          >
            <span className={`w-2 h-2 rounded-full ${DOT[c.key] ?? "bg-slate-400"}`} />
            {c.label}
            <span className="text-slate-400">{counts[c.key] ?? 0}</span>
          </span>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Card className="p-5 mb-6">
        <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-amber-600" /> File a request
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm grow min-w-[12rem]">
            <span className="block text-xs font-medium text-slate-500 mb-1">What do you need? *</span>
            <Input
              accent="amber"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Winter window cling for drive-thru"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-500 mb-1">Type</span>
            <select
              className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, size: "" }))}
            >
              {BRANDING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          {sizesFor(form.category).length > 0 && (
            <label className="text-sm">
              <span className="block text-xs font-medium text-slate-500 mb-1">
                {form.category === "uniform" ? "Uniform size" : "Tray size"}
              </span>
              <select
                className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                value={form.size}
                onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
              >
                <option value="">Choose…</option>
                {sizesFor(form.category).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-500 mb-1">Priority</span>
            <select
              className="font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {BRANDING_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-500 mb-1">Needed by</span>
            <Input
              accent="amber"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-40"
            />
          </label>
          <Button accent="amber" onClick={submit} disabled={saving}>
            {saving ? "Filing…" : "File Request"}
          </Button>
        </div>
        <label className="block text-sm mt-3">
          <span className="block text-xs font-medium text-slate-500 mb-1">Details</span>
          <textarea
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent min-h-[4rem]"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Sizes, colours, deadline, who it's for…"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm grow min-w-[12rem]">
            <span className="block text-xs font-medium text-slate-500 mb-1">Your email (designer replies here)</span>
            <Input
              accent="amber"
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              placeholder="manager@store.com"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-500 mb-1">Attachment (JPG/PNG/PDF, ≤5 MB)</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.svg,.psd,.ai"
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="block text-xs text-slate-600 file:mr-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold hover:file:bg-slate-50"
            />
          </label>
          {file && (
            <span className="text-xs text-slate-600">
              📎 {file.name}{" "}
              <button className="text-slate-400 hover:text-red-600" onClick={() => setFile(null)}>
                remove
              </button>
            </span>
          )}
        </div>
        {fileErr && <p className="mt-2 text-xs text-red-600">{fileErr}</p>}
      </Card>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-400">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">No requests yet — file the first one above.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {columns.map((c) => (
            <div key={c.key}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-2">
                {c.label}
                <span className="text-slate-300">{board[c.key]?.length ?? 0}</span>
              </p>
              <div className="space-y-2">
                {(board[c.key] ?? []).map((r) => {
                  const tone = dueTone(r.due_date, now);
                  return (
                    <Card key={r.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 leading-snug">{r.title}</p>
                        {!readOnly && (
                          <button
                            aria-label={`Delete ${r.title}`}
                            className="text-slate-300 hover:text-red-600 shrink-0"
                            onClick={() => remove(r.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge accent={priorityAccent(r.priority)}>{priorityLabel(r.priority)}</Badge>
                        <Badge accent={statusAccent(r.status)}>{categoryLabel(r.category)}</Badge>
                        {r.size && <Badge accent="slate">Size {r.size}</Badge>}
                      </div>
                      {r.description && (
                        <p className="mt-2 text-xs text-slate-500 line-clamp-3">{r.description}</p>
                      )}
                      {r.file_url && (
                        <a
                          href={r.file_url}
                          download={r.file_name ?? "attachment"}
                          className="mt-2 inline-block text-xs font-semibold text-amber-700 hover:text-amber-800"
                        >
                          📎 {r.file_name ?? "Attachment"} (tap to download)
                        </a>
                      )}
                      <p className="mt-2 text-[11px] text-slate-400">
                        {r.requested_by ? `by ${r.requested_by}` : "—"}
                        {r.contact_email ? ` · ${r.contact_email}` : ""}
                        {r.due_date && <span className={DUE_STYLE[tone]}> · {DUE_TEXT[tone]}</span>}
                      </p>
                      <button
                        className="mt-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                        onClick={() => {
                          const subject = encodeURIComponent(`Branding: ${r.title}`);
                          const body = encodeURIComponent(
                            `Hi,\n\nRe: ${r.title} [${r.category} / ${r.priority}]${r.due_date ? ` — needed by ${r.due_date}` : ""}\n\n${r.description ?? ""}\n\n${r.file_url ? "Attachment is pinned on the request card — open the board to download it (email can't carry attachments).\n\n" : ""}Thanks!`,
                          );
                          window.location.href = `mailto:${(r.contact_email ?? "").trim()}?subject=${subject}&body=${body}`;
                        }}
                      >
                        Email about this request
                      </button>
                      {!readOnly && (
                        <select
                          aria-label={`Status for ${r.title}`}
                          className="mt-2 w-full font-bold text-slate-900 text-xs bg-white border border-slate-300 rounded-lg px-2 h-7 outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          value={isStatus(r.status) ? r.status : "open"}
                          onChange={(e) => move(r, e.target.value)}
                        >
                          {columns.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
