"use client";

// Business Documents — the plain-file vault: forms, SOPs, brand assets, menus.
// Everything here has expiry_date IS NULL (the query filters it), which is the
// counterpart to Compliance & Renewals, where every item has an expiry date.
//
// Storage: business_documents (file kept as a data URL, matching the existing
// upload pattern). No type or expiry pickers (client request — those semantics
// belong to the compliance module). RBAC: pass readOnly to hide upload /
// delete for view-only roles (corporate, staff) — server RLS still enforces it.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getProfileContext } from "@/lib/profile";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import { DOC_ROUTING_HINT } from "@/lib/expiry";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { Plus, Trash2, Download, FolderOpen, Info } from "lucide-react";

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
  /** View-only mode: no upload, no delete (still downloadable). */
  readOnly?: boolean;
  /**
   * Fallback uploader identity for surfaces without a Supabase session (e.g. the
   * cookie-authed Between the Buns hub). When there's no Supabase profile, rows
   * are written with a null user_id and this restaurant name.
   */
  uploader?: { restaurantName: string };
}

export default function DocumentVault({ title, subtitle, readOnly = false, uploader }: DocumentVaultProps) {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Plain files only — anything with an expiry date belongs to Compliance.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("business_documents")
      .select(SELECT)
      .is("expiry_date", null)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setRows((data ?? []) as VaultRow[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
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
      doc_type: "other",
      name: name.trim(),
      file_name: file.name,
      file_url: await fileToDataUrl(file),
      file_size: file.size,
      expiry_date: null,
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
    setName(""); setNotes(""); setFile(null);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-2">
            <Badge accent="slate">{rows.length} files</Badge>
            {!readOnly && (
              <Button accent="red" onClick={() => setShowUpload(true)}>
                <Plus className="w-4 h-4" /> Upload
              </Button>
            )}
          </div>
        }
      />

      <p className="text-xs text-slate-500 -mt-3 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px text-slate-400" />
        <span>{DOC_ROUTING_HINT}</span>
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-44 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {readOnly ? "No documents on file yet." : "No documents yet — upload a form, SOP or brand asset."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {rows.map((r) => (
            <Card key={r.id} className="p-4" hover>
              <div className="flex items-start justify-between mb-3">
                <p className="font-semibold text-slate-900 text-sm min-w-0 break-words">{r.name || r.file_name}</p>
                {!readOnly && (
                  <button onClick={() => remove(r.id)} className="p-1 text-slate-300 hover:text-red-500 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">File</span>
                  <span className="text-slate-900 truncate max-w-[150px]">{r.file_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Size</span>
                  <span className="text-slate-900">{formatFileSize(r.file_size)}</span>
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
          ))}
        </div>
      )}

      {showUpload && !readOnly && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Upload Document</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <Input accent="red" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Opening Checklist" />
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
