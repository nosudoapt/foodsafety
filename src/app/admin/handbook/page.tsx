"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Upload,
  PenLine,
  CheckCircle2,
  FileText,
  Trash2,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  EmptyState,
  Progress,
  inputClass,
  Field,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  readLocal,
  writeLocal,
  fileToDataUrl,
} from "@/lib/admin-store";

interface HandbookDoc {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  dataUrl: string;
  uploadedAt: string;
  version: string;
}

interface Signature {
  id: string;
  staffName: string;
  role: string;
  acknowledgedVersion: string;
  signedAt: string;
  method: "typed";
}

const DOCS_KEY = "btb-handbook-docs";
const SIGS_KEY = "btb-handbook-signatures";

export default function HandbookPage() {
  const [docs, setDocs] = useState<HandbookDoc[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [showSign, setShowSign] = useState(false);
  const [signName, setSignName] = useState("");
  const [signRole, setSignRole] = useState("Staff");
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const [{ data: docsRows, error: docsErr }, { data: sigRows, error: sigErr }] =
            await Promise.all([
              supabase
                .from("employee_handbooks")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
              supabase
                .from("handbook_signatures")
                .select("*")
                .order("signed_at", { ascending: false }),
            ]);
          if (!cancelled && !docsErr && docsRows) {
            const mappedDocs: HandbookDoc[] = docsRows.map((row) => ({
              id: String(row.id),
              title: String(row.title || "Employee Handbook"),
              fileName: String(row.file_name || ""),
              fileType: String(row.file_type || "application/pdf"),
              dataUrl: String(row.file_data || ""),
              uploadedAt: String(row.uploaded_at || String(row.created_at || "").slice(0, 10)),
              version: String(row.version || "1.0"),
            }));
            setDocs(mappedDocs);
            writeLocal(DOCS_KEY, mappedDocs);
          }
          if (!cancelled && !sigErr && sigRows) {
            const mappedSigs: Signature[] = sigRows.map((row) => ({
              id: String(row.id),
              staffName: String(row.staff_name || ""),
              role: String(row.role || "Staff"),
              acknowledgedVersion: String(
                row.acknowledged_version || row.acknowledged_content || ""
              ),
              signedAt: String(row.signed_at || ""),
              method: "typed",
            }));
            setSignatures(mappedSigs);
            writeLocal(SIGS_KEY, mappedSigs);
          }
          return;
        }
        if (!cancelled) {
          try {
            const d = readLocal<HandbookDoc[]>(DOCS_KEY, []);
            if (d.length) setDocs(d);
            const s = readLocal<Signature[]>(SIGS_KEY, []);
            if (s.length) setSignatures(s);
          } catch {
            /* ignore */
          }
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const persistDocs = (next: HandbookDoc[]) => {
    setDocs(next);
    writeLocal(DOCS_KEY, next);
    void (async () => {
      const user = await getSessionUser();
      if (!user) return;
      const ctx = await getProfileContext();
      // replace all for this user (simple sync)
      const { data: existing } = await supabase
        .from("employee_handbooks")
        .select("id")
        .eq("user_id", user.id);
      const existingIds = (existing || []).map((r) => String(r.id));
      const nextIds = next.map((d) => d.id);
      const toDelete = existingIds.filter((id) => !nextIds.includes(id));
      if (toDelete.length) {
        await supabase.from("employee_handbooks").delete().in("id", toDelete).eq("user_id", user.id);
      }
      for (const d of next) {
        if (existingIds.includes(d.id)) {
          await supabase
            .from("employee_handbooks")
            .update({
              title: d.title,
              file_name: d.fileName,
              file_type: d.fileType,
              file_data: d.dataUrl,
              version: d.version,
              uploaded_at: d.uploadedAt,
            })
            .eq("id", d.id)
            .eq("user_id", user.id);
        } else {
          await supabase.from("employee_handbooks").insert({
            id: d.id,
            user_id: user.id,
            restaurant_name: ctx.restaurantName,
            title: d.title,
            file_name: d.fileName,
            file_type: d.fileType,
            file_data: d.dataUrl,
            version: d.version,
            uploaded_at: d.uploadedAt,
          });
        }
      }
    })();
  };

  const persistSigs = (next: Signature[]) => {
    setSignatures(next);
    writeLocal(SIGS_KEY, next);
    void (async () => {
      const newest = next[0];
      if (!newest) return;
      const user = await getSessionUser();
      if (!user) return;
      await supabase.from("handbook_signatures").upsert(
        {
          id: newest.id,
          handbook_id: activeDoc?.id || null,
          staff_name: newest.staffName,
          role: newest.role,
          acknowledged_version: newest.acknowledgedVersion,
          acknowledged_content: newest.acknowledgedVersion,
          method: "typed",
          signed_at: newest.signedAt,
          user_id: user.id,
        },
        { onConflict: "id" }
      );
    })();
  };

  const activeDoc = docs[0];

  const upload = async () => {
    if (!file || !title.trim()) return;
    setUploadError("");
    if (file.size > 1_500_000) {
      setUploadError("File is too large for on-device storage (max 1.5 MB). Link a hosted PDF instead.");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const doc: HandbookDoc = {
      id: crypto.randomUUID(),
      title: title.trim(),
      fileName: file.name,
      fileType: file.type || "application/pdf",
      dataUrl,
      uploadedAt: new Date().toISOString().slice(0, 10),
      version: version.trim() || "1.0",
    };
    persistDocs([doc, ...docs]);
    setShowUpload(false);
    setTitle("");
    setVersion("1.0");
    setFile(null);
  };

  const removeDoc = (id: string) => {
    if (!confirm("Delete this handbook version? Signatures for it will remain on record.")) return;
    persistDocs(docs.filter((d) => d.id !== id));
  };

  const sign = () => {
    if (!signName.trim() || !activeDoc) return;
    const entry: Signature = {
      id: crypto.randomUUID(),
      staffName: signName.trim(),
      role: signRole,
      acknowledgedVersion: activeDoc.version,
      signedAt: new Date().toISOString(),
      method: "typed",
    };
    persistSigs([entry, ...signatures]);
    setSigned(true);
    setShowSign(false);
    setSignName("");
    setTimeout(() => setSigned(false), 4000);
  };

  const latestVersion = activeDoc?.version;
  const signedLatest = useMemo(
    () => new Set(signatures.filter((s) => s.acknowledgedVersion === latestVersion).map((s) => s.staffName.toLowerCase())),
    [signatures, latestVersion]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee handbook"
        description="Upload the handbook, have every staff member read and digitally sign it — we keep the record."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowSign(true)} disabled={!activeDoc}>
              <PenLine className="h-4 w-4" /> Sign as staff
            </Button>
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4" /> Upload handbook
            </Button>
          </>
        }
      />

      {signed && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Signature recorded — thank you.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <BookOpenCheck className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                {activeDoc ? (
                  <>
                    <h2 className="text-[15px] font-semibold text-gray-900 truncate">
                      {activeDoc.title}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Version {activeDoc.version} · uploaded {activeDoc.uploadedAt} ·{" "}
                      {activeDoc.fileName}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-[15px] font-semibold text-gray-900">No handbook yet</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Upload a PDF so staff can read and sign it.
                    </p>
                  </>
                )}
              </div>
            </div>
            {activeDoc && (
              <div className="flex gap-1 shrink-0">
                <a
                  href={activeDoc.dataUrl}
                  download={activeDoc.fileName}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" /> Download
                </a>
                <button
                  type="button"
                  aria-label="Delete handbook"
                  onClick={() => removeDoc(activeDoc.id)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-5">
            {activeDoc ? (
              activeDoc.fileType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeDoc.dataUrl}
                  alt={activeDoc.title}
                  className="max-h-[420px] w-full rounded-lg border border-gray-100 object-contain bg-gray-50"
                />
              ) : activeDoc.fileType === "application/pdf" || activeDoc.fileName.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={activeDoc.dataUrl}
                  title={activeDoc.title}
                  className="h-[480px] w-full rounded-lg border border-gray-100 bg-gray-50"
                />
              ) : (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-6 text-center">
                  <FileText className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-600">{activeDoc.fileName}</p>
                  <a
                    href={activeDoc.dataUrl}
                    download={activeDoc.fileName}
                    className="mt-3 inline-block text-sm font-semibold text-red-600 hover:underline"
                  >
                    Download to view
                  </a>
                </div>
              )
            ) : (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="Handbook not uploaded"
                description="Supported: PDF or images up to 1.5 MB for on-device storage."
                action={
                  <Button onClick={() => setShowUpload(true)}>
                    <Upload className="h-4 w-4" /> Upload now
                  </Button>
                }
              />
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Signatures — v{latestVersion || "—"}
            </p>
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-semibold text-gray-900">{signedLatest.size}</span>
              <span className="text-[11px] text-gray-400">
                unique staff signed latest version
              </span>
            </div>
            <Progress
              value={signatures.length === 0 ? 0 : (signedLatest.size / Math.max(signatures.length, 1)) * 100}
              tone="green"
            />
          </Card>

          <Card padded={false}>
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Signature record</p>
            </div>
            {signatures.length === 0 ? (
              <EmptyState
                icon={<PenLine className="h-5 w-5" />}
                title="No signatures yet"
                description="Staff can sign once they've read the handbook."
              />
            ) : (
              <ul className="max-h-[360px] divide-y divide-gray-100 overflow-y-auto">
                {signatures.map((s) => (
                  <li key={s.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 truncate">
                          {s.staffName}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {s.role} · v{s.acknowledgedVersion}
                        </p>
                      </div>
                      <Badge tone="green">Signed</Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(s.signedAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload handbook</h3>
            <div className="space-y-4">
              <Field label="Title" htmlFor="hb-title">
                <input
                  id="hb-title"
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Employee Handbook 2026"
                />
              </Field>
              <Field label="Version" htmlFor="hb-version" hint="Staff sign against this version.">
                <input
                  id="hb-version"
                  className={inputClass}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0"
                />
              </Field>
              <Field label="File (PDF or image, ≤1.5 MB)" htmlFor="hb-file">
                <input
                  id="hb-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    setUploadError("");
                    setFile(e.target.files?.[0] || null);
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-red-700 hover:file:bg-red-100 cursor-pointer"
                />
              </Field>
              {uploadError && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {uploadError}
                </p>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowUpload(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={upload} disabled={!file || !title.trim()} className="flex-1">
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSign && activeDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Digital signature</h3>
            <p className="mt-1 text-[13px] text-gray-500">
              I confirm I have read and understood{" "}
              <strong className="text-gray-800">
                {activeDoc.title} v{activeDoc.version}
              </strong>
              .
            </p>
            <div className="mt-5 space-y-4">
              <Field label="Full name (sign here)" htmlFor="sig-name">
                <input
                  id="sig-name"
                  className={`${inputClass} font-serif italic text-[15px]`}
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                  placeholder="Type your full name"
                />
              </Field>
              <Field label="Role" htmlFor="sig-role">
                <select
                  id="sig-role"
                  className={inputClass}
                  value={signRole}
                  onChange={(e) => setSignRole(e.target.value)}
                >
                  {["Staff", "Supervisor", "Manager", "Owner"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowSign(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={sign} disabled={!signName.trim()} className="flex-1">
                <PenLine className="h-4 w-4" /> Sign
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
