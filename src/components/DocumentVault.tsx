"use client";

// Business Documents — the plain-file vault: forms, SOPs, brand assets, menus.
// Everything here has expiry_date IS NULL (the query filters it), which is the
// counterpart to Compliance & Renewals, where every item has an expiry date.
//
// Storage: business_documents (file kept as a data URL, matching the existing
// upload pattern). No type or expiry pickers (client request — those semantics
// belong to the compliance module). RBAC: pass readOnly to hide upload /
// delete for view-only roles. BTB uses its cookie-authorized server API;
// FoodSafe uses its own profile and authenticated database policies.
import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileContext } from "@/lib/profile";
import { fetchJson } from "@/lib/fetch-json";
import { BTB_UPLOAD_MAX_BYTES, type BtbUploaderConnection } from "@/lib/btb-uploads";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import { DOC_ROUTING_HINT } from "@/lib/expiry";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import Modal from "@/components/Modal";
import { jsonRequest } from "@/components/btb/Feedback";
import { Plus, Trash2, Download, FolderOpen, FileText, Info, Search, Check, CircleAlert } from "lucide-react";

interface VaultRow {
  id: string;
  doc_type: string;
  name: string | null;
  file_name: string;
  file_size: number | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  btb_created_by_name?: string | null;
}

const SELECT = "id, doc_type, name, file_name, file_size, expiry_date, notes, created_at";

export interface DocumentVaultProps {
  title: string;
  subtitle?: string;
  /** View-only mode: no upload, no delete (still downloadable). */
  readOnly?: boolean;
  showHeader?: boolean;
  /**
   * Independent BTB scope. The server supplies the real uploader profile and
   * verifies role/page access; a FoodSafe session is never reused as its identity.
   */
  uploader?: { restaurantName: string };
}

export default function DocumentVault(props: DocumentVaultProps) {
  const { user, restaurantName } = useAuth();
  const restaurant = props.uploader?.restaurantName ?? restaurantName;
  return <DocumentWorkspace key={`${props.uploader ? "independent" : user?.id}:${restaurant}`} {...props} restaurant={restaurant} />;
}

function DocumentWorkspace({ title, subtitle, readOnly = false, showHeader = true, uploader, restaurant }: DocumentVaultProps & { restaurant: string }) {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const independentWorkspace = !!uploader;
  const [connection, setConnection] = useState<BtbUploaderConnection | null>(null);
  const uploadConnected = !independentWorkspace || connection?.connected === true;

  // Plain files only — anything with an expiry date belongs to Compliance.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    (async () => {
      try {
        if (!restaurant) throw new Error("Your restaurant could not be identified. Reconnect your workspace and try again.");
        if (independentWorkspace) {
          const result = await fetchJson<{ documents: VaultRow[]; uploader: BtbUploaderConnection | null }>("/api/btb/documents", { signal: controller.signal });
          if (!cancelled) { setRows(result.documents); setConnection(result.uploader); setLoadError(""); }
          return;
        }
        const { data, error } = await supabase.from("business_documents").select(SELECT)
          .eq("restaurant_name", restaurant).is("expiry_date", null)
          .order("created_at", { ascending: false }).abortSignal(controller.signal);
        if (error) throw new Error("The document register couldn’t be loaded. Please try again.");
        if (!cancelled) { setRows((data ?? []) as VaultRow[]); setLoadError(""); }
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "The document register couldn’t be loaded.");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [independentWorkspace, restaurant, revision]);

  async function upload() {
    if (readOnly || !uploadConnected || !file || !name.trim() || saving || !restaurant) return;
    setSaving(true);
    setUploadError(""); setNotice("");
    try {
      let document: VaultRow;
      if (independentWorkspace) {
        if (file.size > BTB_UPLOAD_MAX_BYTES) throw new Error("Choose a file no larger than 3 MB.");
        const result = await fetchJson<{ document: VaultRow }>("/api/btb/documents", jsonRequest({ name: name.trim(), notes: notes.trim(), file: { name: file.name, url: await fileToDataUrl(file) } }));
        document = result.document;
      } else {
        const ctx = await getProfileContext();
        if (!ctx || ctx.restaurantName !== restaurant) throw new Error("Your profile is unavailable. Sign in again, then retry this upload.");
        const userId = ctx.userId;
        const { data, error } = await supabase.from("business_documents").insert({
          user_id: userId, uploaded_by: userId, restaurant_name: restaurant,
          doc_type: "other", name: name.trim(), file_name: file.name,
          file_url: await fileToDataUrl(file), file_size: file.size, expiry_date: null, notes: notes.trim(),
        }).select(SELECT).abortSignal(AbortSignal.timeout(15_000)).single();
        if (error || !data) throw new Error("The document wasn’t uploaded. Your file and details are still here; please try again.");
        document = data as VaultRow;
      }
      setRows((prev) => [document, ...prev]);
      setNotice(`${name.trim()} uploaded.`);
      setShowUpload(false);
      setName(""); setNotes(""); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "The upload couldn’t be completed. Please try again.");
    } finally { setSaving(false); }
  }

  async function remove(row: VaultRow) {
    if (readOnly || busyId || !confirm(`Delete “${row.name || row.file_name}”?`)) return;
    setBusyId(row.id); setError(""); setNotice("");
    try {
      if (independentWorkspace) {
        await fetchJson("/api/btb/documents", jsonRequest({ id: row.id }, "DELETE"));
      } else {
        const { data, error } = await supabase.from("business_documents").delete()
          .eq("id", row.id).eq("restaurant_name", restaurant).select("id")
          .abortSignal(AbortSignal.timeout(15_000)).single();
        if (error || !data) throw new Error("The document wasn’t deleted. It’s still in your register; please try again.");
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setNotice(`${row.name || row.file_name} deleted.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document couldn’t be deleted.");
    } finally { setBusyId(null); }
  }

  async function download(row: VaultRow) {
    if (busyId) return;
    setBusyId(row.id); setError("");
    try {
      if (independentWorkspace) {
        const result = await fetchJson<{ url: string; name: string }>(`/api/btb/documents?download=${encodeURIComponent(row.id)}`);
        downloadDataUrl(result.url, result.name);
        return;
      }
      const { data, error } = await supabase.from("business_documents")
        .select("file_url").eq("id", row.id).eq("restaurant_name", restaurant)
        .abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data?.file_url) throw new Error("This file couldn’t be downloaded. Please try again.");
      downloadDataUrl(data.file_url, row.file_name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The download couldn’t be completed.");
    } finally { setBusyId(null); }
  }

  const matching = rows.filter((row) => `${row.name} ${row.file_name} ${row.notes ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const actions = <div className="ui-actions">
    <Badge>{loading ? "Loading files…" : loadError ? "Files unavailable" : `${rows.length} ${rows.length === 1 ? "file" : "files"}`}</Badge>
    {!readOnly && <Button disabled={!uploadConnected || !restaurant || loading || !!loadError} aria-describedby={!uploadConnected ? `${formId}-connection` : undefined} onClick={() => { setUploadError(""); setShowUpload(true); }}>
      <Plus size={17} aria-hidden="true" />Upload document
    </Button>}
  </div>;

  return (
    <div className="document-workspace">
      {showHeader ? <PageHeader title={title} subtitle={subtitle} action={actions} /> : <div className="dash-section__head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{actions}</div>}

      <p className="document-hint">
        <Info size={17} aria-hidden="true" />
        <span>{DOC_ROUTING_HINT}</span>
      </p>

      {!readOnly && !loading && !loadError && !uploadConnected && <div id={`${formId}-connection`} className="ui-notice"><Info size={18} aria-hidden="true" /><span>{connection?.message ?? "The BTB uploader connection could not be checked."}</span><Button variant="ghost" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Retry uploader connection</Button></div>}

      {notice && <div className="ui-notice ui-notice--success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}
      {error && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
      {!loading && !loadError && rows.length > 0 && <div className="document-toolbar">
        <label className="dash-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search documents</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a file or procedure…" /></label>
        <p>{restaurant} · {readOnly ? "View & download" : "Shared document register"}</p>
      </div>}

      {loading ? (
        <div className="document-grid" role="status" aria-label="Loading documents">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-44 animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <Card className="ui-empty"><CircleAlert size={30} aria-hidden="true" /><h2>Documents are unavailable</h2><p role="alert">{loadError}</p><Button onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Retry documents</Button></Card>
      ) : matching.length === 0 ? (
        <Card className="ui-empty">
          <FolderOpen size={32} aria-hidden="true" />
          <h2>{query ? "No matching documents" : "A home for your important files"}</h2>
          <p>{query ? "Try a different name or clear your search." : readOnly ? "Documents shared by your team will appear here." : "Upload a form, SOP, menu or brand asset to start your register."}</p>
          {query && <Button variant="ghost" onClick={() => setQuery("")}>Clear search</Button>}
        </Card>
      ) : (
        <div className="document-grid">
          {matching.map((r) => (
            <article key={r.id} className="ui-card document-card" aria-label={r.name || r.file_name}>
              <div className="document-card__head">
                <span className="ui-icon ui-tone--purple"><FileText size={20} aria-hidden="true" /></span>
                {!readOnly && (
                  <button onClick={() => remove(r)} disabled={!!busyId} className="ui-iconbutton ui-iconbutton--danger" aria-label={`Delete ${r.name || r.file_name}`}>
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                )}
              </div>
              <h2>{r.name || r.file_name}</h2>
              <p className="document-card__filename">{r.file_name}</p>
              <p className="document-card__meta">{formatFileSize(r.file_size)} · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
              {r.btb_created_by_name && <p className="document-card__meta">Added by {r.btb_created_by_name}</p>}
              {r.notes && <p className="document-card__notes">{r.notes}</p>}
              <Button variant="ghost" onClick={() => download(r)} disabled={!!busyId}><Download size={16} aria-hidden="true" />{busyId === r.id ? "Working…" : "Download file"}</Button>
            </article>
          ))}
        </div>
      )}

      {!readOnly && <Modal open={showUpload} title="Upload document" description="Give the file a clear name so your team can find it." busy={saving} onClose={() => setShowUpload(false)}>
        <form onSubmit={(event) => { event.preventDefault(); void upload(); }}>
          {uploadError && <div className="ui-notice ui-notice--error" role="alert">{uploadError}</div>}
          <fieldset disabled={saving} className="ui-form-stack">
            <label htmlFor={`${formId}-name`}>Document name<Input id={`${formId}-name`} data-modal-autofocus required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Kitchen opening procedure" /></label>
            <label htmlFor={`${formId}-notes`}>Notes <span>(optional)</span><Input id={`${formId}-notes`} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="When or how to use this file" /></label>
            <div><label htmlFor={`${formId}-file`}>File</label><input id={`${formId}-file`} className="mt-2" ref={fileInputRef} required type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0] || null)} aria-describedby={`${formId}-formats`} /><small id={`${formId}-formats`}>PDF, image or Word document.{independentWorkspace && " Maximum 3 MB."}</small></div>
          </fieldset>
          <div className="ui-modal__actions"><Button variant="ghost" disabled={saving} onClick={() => setShowUpload(false)}>Cancel</Button><Button type="submit" disabled={!file || !name.trim() || saving}>{saving ? "Uploading…" : "Upload document"}</Button></div>
        </form>
      </Modal>}
    </div>
  );
}
