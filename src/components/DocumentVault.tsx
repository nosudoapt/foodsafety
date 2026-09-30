"use client";

// Reusable document vault with expiry tracking — the shared engine behind every
// "upload a doc, set an expiry, get warned before it lapses" screen (business
// documents, licenses, insurance, hood/fire certificates, franchise & lease
// agreements). Drop it in with a title and an optional set of allowed types.
//
// Storage: business_documents (file kept as a data URL, matching the existing
// upload pattern). Status/urgency come from the central engine in lib/expiry.ts
// so every surface renders identically. RBAC: pass readOnly to hide upload /
// delete for view-only roles (corporate, staff) — server RLS still enforces it.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getProfileContext } from "@/lib/profile";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import {
  COMPLIANCE_TYPES, complianceType, expiryLevel, expiryLabel,
  LEVEL_ACCENT, sortByUrgency, alertsFrom,
} from "@/lib/expiry";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, Download, AlertTriangle, FolderOpen } from "lucide-react";

interface VaultRow {
  id: string;
  doc_type: string;
  name: string | null;
  file_name: string;
  file_size: number | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
}

const SELECT = "id, doc_type, name, file_name, file_size, expiry_date, notes, created_at";

export interface DocumentVaultProps {
  title: string;
  subtitle?: string;
  /** Restrict the type picker to these COMPLIANCE_TYPES values. Defaults to all. */
  types?: string[];
  /** View-only mode: no upload, no delete (still downloadable). */
  readOnly?: boolean;
  /**
   * Fallback uploader identity for surfaces without a Supabase session (e.g. the
   * cookie-authed Between the Buns hub). When there's no Supabase profile, rows
   * are written with a null user_id and this restaurant name.
   */
  uploader?: { restaurantName: string };
}

export default function DocumentVault({ title, subtitle, types, readOnly = false, uploader }: DocumentVaultProps) {
  const allowed = types
    ? COMPLIANCE_TYPES.filter((t) => types.includes(t.value))
    : COMPLIANCE_TYPES;

  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState(allowed[0]?.value ?? "other");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let query = supabase.from("business_documents").select(SELECT)
        .order("created_at", { ascending: false });
      if (types) query = query.in("doc_type", types);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as VaultRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // types is a stable prop for a given mounted page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload() {
    if (!file || !name.trim() || saving) return;
    setSaving(true);
    setError("");
    const ctx = await getProfileContext();
    if (!ctx && !uploader) {
      setError("No profile found for this session — sign in again.");
      setSaving(false);
      return;
    }
    const userId = ctx?.userId ?? null;
    const restaurantName = ctx?.restaurantName ?? uploader!.restaurantName;
    const { data, error } = await supabase.from("business_documents").insert({
      user_id: userId,
      uploaded_by: userId,
      restaurant_name: restaurantName,
      doc_type: docType,
      name: name.trim(),
      file_name: file.name,
      file_url: await fileToDataUrl(file),
      file_size: file.size,
      expiry_date: expiry || null,
      notes: notes.trim(),
    }).select(SELECT).single();
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setRows((prev) => [data as VaultRow, ...prev]);
    setSaving(false);
    setShowUpload(false);
    setName(""); setExpiry(""); setNotes(""); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function remove(id: string) {
    if (!confirm("Delete this document?")) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("business_documents").delete().eq("id", id);
    if (error) setError(error.message);
  }

  async function download(row: VaultRow) {
    setError("");
    const { data, error } = await supabase.from("business_documents")
      .select("file_url").eq("id", row.id).single();
    if (error || !data?.file_url) {
      setError(error?.message ?? "File not found.");
      return;
    }
    downloadDataUrl(data.file_url, row.file_name);
  }

  const sorted = sortByUrgency(rows, (r) => r.doc_type, (r) => r.expiry_date);
  const alerts = alertsFrom(rows, (r) => r.doc_type, (r) => r.expiry_date);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-2">
            <Badge accent={alerts.length ? "red" : "green"}>
              {alerts.length ? `${alerts.length} need attention` : "All current"}
            </Badge>
            {!readOnly && (
              <Button accent="red" onClick={() => setShowUpload(true)}>
                <Plus className="w-4 h-4" /> Upload
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {alerts.length > 0 && (
        <Card className="p-4 bg-red-50 border-red-200 animate-fade-in">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4" /> Action needed
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((r) => {
              const t = complianceType(r.doc_type);
              return (
                <Badge key={r.id} accent={LEVEL_ACCENT[expiryLevel(r.expiry_date, t.notifyDays)]}>
                  {t.icon} {r.name || r.file_name} · {expiryLabel(r.expiry_date)}
                </Badge>
              );
            })}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-44 animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {readOnly ? "No documents on file yet." : "No documents yet — upload one to start the expiry clock."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {sorted.map((r) => {
            const t = complianceType(r.doc_type);
            const level = expiryLevel(r.expiry_date, t.notifyDays);
            return (
              <Card key={r.id} className="p-4" hover>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl">{t.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{r.name || r.file_name}</p>
                      <p className="text-[10px] text-slate-400">{t.label}</p>
                    </div>
                  </div>
                  {!readOnly && (
                    <button onClick={() => remove(r.id)} className="p-1 text-slate-300 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">File</span>
                    <span className="text-slate-900 truncate max-w-[150px]">{r.file_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Size</span>
                    <span className="text-slate-900">{formatFileSize(r.file_size)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Expiry</span>
                    <Badge accent={LEVEL_ACCENT[level]}>{expiryLabel(r.expiry_date)}</Badge>
                  </div>
                  {r.notes && <p className="text-slate-500 pt-1">{r.notes}</p>}
                </div>
                <button
                  onClick={() => download(r)}
                  className="w-full mt-3 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> View / Download
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {showUpload && !readOnly && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Upload Document</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                >
                  {allowed.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <Input accent="red" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Health Permit" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <Input accent="red" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <Input accent="red" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-900"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowUpload(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">
                Cancel
              </button>
              <button
                onClick={upload}
                disabled={!file || !name.trim() || saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
