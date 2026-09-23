"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  readLocal,
  writeLocal,
} from "@/lib/admin-store";

interface DocEntry {
  id: string;
  categoryId: string;
  title: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  dataUrl: string;
  uploadedAt: string;
  expiryDate: string;
  notes: string;
  month?: number;
  year?: number;
}

interface DocumentCategory {
  id: string;
  label: string;
  icon: string;
  type: "expiry" | "monthly";
  warningMonths?: number;
}

const categories: DocumentCategory[] = [
  { id: "health_license", label: "Health Safety License", icon: "🏥", type: "expiry", warningMonths: 2 },
  { id: "business_license", label: "Business License", icon: "📋", type: "expiry", warningMonths: 2 },
  { id: "business_insurance", label: "Business Insurance", icon: "🛡️", type: "expiry", warningMonths: 2 },
  { id: "pest_control", label: "Pest Control Reports", icon: "🐛", type: "monthly" },
  { id: "hoods_sticker", label: "Hoods Inspection Sticker Certificate", icon: "🔧", type: "expiry", warningMonths: 2 },
  { id: "fire_suppression", label: "Fire Suppression System", icon: "🔥", type: "expiry", warningMonths: 2 },
  { id: "staff_certs", label: "Staff Food Safety Certificates", icon: "📜", type: "expiry" },
  { id: "franchise", label: "Franchise Agreements", icon: "📑", type: "expiry", warningMonths: 3 },
  { id: "lease", label: "Lease Agreements", icon: "🏠", type: "expiry", warningMonths: 6 },
];

const STORAGE_KEY = "btb-documents";

const categoryIdToDocCategory: Record<string, string> = {
  health_license: "health_license",
  business_license: "business_license",
  business_insurance: "business_insurance",
  pest_control: "pest_control",
  hoods_sticker: "hoods_sticker",
  fire_suppression: "fire_suppression",
  staff_certs: "staff_certs",
  franchise: "franchise",
  lease: "lease",
};

function rowToDoc(row: Record<string, unknown>): DocEntry {
  return {
    id: String(row.id),
    categoryId: (row.category_id as string) || (row.doc_category as string) || "other",
    title: String(row.title || ""),
    fileName: String(row.file_name || ""),
    fileSize: Number(row.file_size || 0),
    fileType: String(row.file_type || "application/octet-stream"),
    dataUrl: String(row.file_data || ""),
    uploadedAt: String(row.uploaded_at || String(row.created_at || "").slice(0, 10)),
    expiryDate: String(row.expiry_date || ""),
    notes: String(row.notes || row.description || ""),
    month: row.doc_month != null ? Number(row.doc_month) : undefined,
    year: row.doc_year != null ? Number(row.doc_year) : undefined,
  };
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function getExpiryStatus(expiryDate: string, warningMonths?: number): "valid" | "warning" | "expired" {
  if (!expiryDate) return "valid";
  const expiry = new Date(expiryDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (expiry < now) return "expired";
  if (warningMonths) {
    const warningDate = new Date(now);
    warningDate.setMonth(warningDate.getMonth() + warningMonths);
    if (expiry <= warningDate) return "warning";
  }
  return "valid";
}

function getDaysUntilExpiry(expiryDate: string): number {
  if (!expiryDate) return Infinity;
  const expiry = new Date(expiryDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadMonth, setUploadMonth] = useState<number>(new Date().getMonth());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewDoc, setViewDoc] = useState<DocEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      setMounted(true);
      void (async () => {
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("documents")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          if (!cancelled && !error && data) {
            const mapped = data.map(rowToDoc);
            setDocuments(mapped);
            writeLocal(STORAGE_KEY, mapped);
            return;
          }
        }
        if (!cancelled) {
          const local = readLocal<DocEntry[]>(STORAGE_KEY, []);
          setDocuments(local);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const expiringDocs = useMemo(() => {
    if (!mounted) return [];
    return documents.filter((doc) => {
      const cat = categories.find((c) => c.id === doc.categoryId);
      if (!cat || cat.type === "monthly") return false;
      if (!cat.warningMonths) return getExpiryStatus(doc.expiryDate) === "expired";
      const status = getExpiryStatus(doc.expiryDate, cat.warningMonths);
      return status === "warning" || status === "expired";
    });
  }, [documents, mounted]);

  const getDocsForCategory = (categoryId: string): DocEntry[] => {
    return documents.filter((d) => d.categoryId === categoryId);
  };

  const getUploadedMonthsForCategory = (categoryId: string): number[] => {
    const currentYear = new Date().getFullYear();
    return documents
      .filter((d) => d.categoryId === categoryId && d.year === currentYear)
      .map((d) => d.month!)
      .filter((m) => m !== undefined);
  };

  const toggleCategory = (id: string) => {
    setOpenCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openUploadModal = (categoryId: string) => {
    setUploadCategory(categoryId);
    setUploadTitle("");
    setUploadExpiry("");
    setUploadNotes("");
    setSelectedFile(null);
    setUploadMonth(new Date().getMonth());
    setShowUpload(true);
  };

  const handleUpload = () => {
    if (!selectedFile || !uploadCategory) return;

    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const cat = categories.find((c) => c.id === uploadCategory);
        const newDoc: DocEntry = {
          id: crypto.randomUUID(),
          categoryId: uploadCategory,
          title: uploadTitle || selectedFile.name,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          dataUrl: reader.result as string,
          uploadedAt: new Date().toISOString().split("T")[0],
          expiryDate: cat?.type === "expiry" ? uploadExpiry : "",
          notes: uploadNotes,
          month: cat?.type === "monthly" ? uploadMonth : undefined,
          year: cat?.type === "monthly" ? new Date().getFullYear() : undefined,
        };
        const next = [newDoc, ...documents];
        setDocuments(next);
        writeLocal(STORAGE_KEY, next);
        setShowUpload(false);

        const user = await getSessionUser();
        if (user) {
          const ctx = await getProfileContext();
          await supabase.from("documents").insert({
            user_id: user.id,
            uploaded_by: user.id,
            restaurant_name: ctx.restaurantName,
            doc_category: categoryIdToDocCategory[uploadCategory] || "other",
            category_id: uploadCategory,
            title: newDoc.title,
            description: newDoc.notes,
            file_name: newDoc.fileName,
            file_data: newDoc.dataUrl,
            file_size: newDoc.fileSize,
            file_type: newDoc.fileType,
            expiry_date: newDoc.expiryDate || null,
            notification_months:
              cat?.warningMonths ?? (cat?.type === "expiry" ? 2 : 0),
            doc_month: newDoc.month ?? null,
            doc_year: newDoc.year ?? null,
            uploaded_at: newDoc.uploadedAt,
            notes: newDoc.notes,
          });
        }
      })();
    };
    reader.readAsDataURL(selectedFile);
  };

  const deleteDocument = (id: string) => {
    if (!confirm("Delete this document?")) return;
    const next = documents.filter((d) => d.id !== id);
    setDocuments(next);
    writeLocal(STORAGE_KEY, next);
    void (async () => {
      const user = await getSessionUser();
      if (user) {
        await supabase.from("documents").delete().eq("id", id).eq("user_id", user.id);
      }
    })();
  };

  const getStatusBadge = (status: "valid" | "warning" | "expired") => {
    if (status === "expired") return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">Expired</span>;
    if (status === "warning") return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">Expiring Soon</span>;
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">Valid</span>;
  };

  const getCategoryStatusSummary = (categoryId: string): "valid" | "warning" | "expired" | "none" => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return "none";
    const docs = getDocsForCategory(categoryId);
    if (docs.length === 0) return "none";
    if (cat.type === "monthly") {
      const currentMonth = new Date().getMonth();
      const uploaded = getUploadedMonthsForCategory(categoryId);
      const missingMonths = [];
      for (let m = 0; m <= currentMonth; m++) {
        if (!uploaded.includes(m)) missingMonths.push(m);
      }
      if (missingMonths.length > 0) return "warning";
      return "valid";
    }
    let worst: "valid" | "warning" | "expired" = "valid";
    for (const doc of docs) {
      const status = getExpiryStatus(doc.expiryDate, cat.warningMonths);
      if (status === "expired") return "expired";
      if (status === "warning") worst = "warning";
    }
    return worst;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Management</h1>
        <p className="text-sm text-gray-500">Manage all business documents, licenses, and certificates</p>
      </div>

      {/* Expiring Soon Banner */}
      {expiringDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <h3 className="font-bold text-amber-800">Documents Expiring Soon</h3>
          </div>
          <div className="space-y-1">
            {expiringDocs.map((doc) => {
              const cat = categories.find((c) => c.id === doc.categoryId);
              const days = getDaysUntilExpiry(doc.expiryDate);
              const status = getExpiryStatus(doc.expiryDate, cat?.warningMonths);
              return (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-700">
                    {cat?.icon} {doc.title} - {cat?.label}
                  </span>
                  <span className={`font-bold text-xs ${status === "expired" ? "text-red-600" : "text-amber-600"}`}>
                    {status === "expired" ? `Expired ${Math.abs(days)} days ago` : `Expires in ${days} days`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Sections */}
      <div className="space-y-3">
        {categories.map((cat) => {
          const isOpen = openCategories[cat.id] ?? false;
          const docs = getDocsForCategory(cat.id);
          const summaryStatus = getCategoryStatusSummary(cat.id);
          const currentMonth = new Date().getMonth();
          const uploadedMonths = getUploadedMonthsForCategory(cat.id);
          const missingMonths = cat.type === "monthly"
            ? Array.from({ length: currentMonth + 1 }, (_, i) => i).filter((m) => !uploadedMonths.includes(m))
            : [];

          return (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{cat.icon}</span>
                  <div className="text-left">
                    <h3 className="font-bold text-gray-900 text-sm">{cat.label}</h3>
                    <p className="text-[10px] text-gray-500">
                      {docs.length} document{docs.length !== 1 ? "s" : ""} uploaded
                      {cat.type === "monthly" && missingMonths.length > 0 && (
                        <span className="text-amber-600"> · {missingMonths.length} month{missingMonths.length !== 1 ? "s" : ""} missing</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {summaryStatus !== "none" && getStatusBadge(summaryStatus)}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                  {/* Upload button */}
                  <button
                    onClick={() => openUploadModal(cat.id)}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors flex items-center gap-1"
                  >
                    <span>+</span> Upload {cat.type === "monthly" ? "Monthly Report" : "Document"}
                  </button>

                  {/* Monthly: show month grid */}
                  {cat.type === "monthly" && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {monthNames.slice(0, currentMonth + 1).map((name, idx) => {
                        const uploaded = uploadedMonths.includes(idx);
                        return (
                          <div
                            key={idx}
                            className={`px-3 py-2 rounded-lg text-xs font-medium text-center ${
                              uploaded
                                ? "bg-green-100 text-green-700 border border-green-200"
                                : "bg-red-50 text-red-600 border border-red-200 border-dashed"
                            }`}
                          >
                            {uploaded ? "✓ " : ""}{name.slice(0, 3)}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Document list */}
                  {docs.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">No documents uploaded yet</p>
                  ) : (
                    <div className="space-y-2">
                      {docs.map((doc) => {
                        const status = cat.type === "expiry" && doc.expiryDate
                          ? getExpiryStatus(doc.expiryDate, cat.warningMonths)
                          : "valid";
                        return (
                          <div
                            key={doc.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              status === "expired"
                                ? "border-red-200 bg-red-50"
                                : status === "warning"
                                ? "border-amber-200 bg-amber-50"
                                : "border-gray-100 bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                <span className="text-sm">📄</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                                <p className="text-[10px] text-gray-500">
                                  {doc.fileName} · {formatFileSize(doc.fileSize)}
                                  {cat.type === "monthly" && doc.month !== undefined && ` · ${monthNames[doc.month]}`}
                                </p>
                                <p className="text-[10px] text-gray-400">Uploaded {doc.uploadedAt}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {cat.type === "expiry" && doc.expiryDate && (
                                <div className="text-right">
                                  <p className="text-[10px] text-gray-500">Expires {doc.expiryDate}</p>
                                  {getStatusBadge(status)}
                                </div>
                              )}
                              <button
                                onClick={() => setViewDoc(doc)}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1"
                              >
                                View
                              </button>
                              <button
                                onClick={() => deleteDocument(doc.id)}
                                className="text-xs text-gray-400 hover:text-red-500 px-2 py-1"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 text-lg mb-4">
              Upload {categories.find((c) => c.id === uploadCategory)?.label}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Health License 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
                />
              </div>

              {categories.find((c) => c.id === uploadCategory)?.type === "expiry" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={uploadExpiry}
                    onChange={(e) => setUploadExpiry(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
                  />
                </div>
              )}

              {categories.find((c) => c.id === uploadCategory)?.type === "monthly" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <select
                    value={uploadMonth}
                    onChange={(e) => setUploadMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
                  >
                    {monthNames.slice(0, new Date().getMonth() + 1).map((name, idx) => (
                      <option key={idx} value={idx}>{name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-900"
                />
                {selectedFile && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    {selectedFile.name} · {formatFileSize(selectedFile.size)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowUpload(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Document Modal */}
      {viewDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">{viewDoc.title}</h3>
              <button onClick={() => setViewDoc(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">File:</span>
                <span className="text-gray-900">{viewDoc.fileName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Size:</span>
                <span className="text-gray-900">{formatFileSize(viewDoc.fileSize)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Uploaded:</span>
                <span className="text-gray-900">{viewDoc.uploadedAt}</span>
              </div>
              {viewDoc.expiryDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Expiry:</span>
                  <span className="text-gray-900 font-bold">{viewDoc.expiryDate}</span>
                </div>
              )}
              {viewDoc.month !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Month:</span>
                  <span className="text-gray-900">{monthNames[viewDoc.month]} {viewDoc.year}</span>
                </div>
              )}
              {viewDoc.notes && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Notes:</span>
                  <span className="text-gray-900">{viewDoc.notes}</span>
                </div>
              )}
            </div>
            {viewDoc.dataUrl && (
              <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                {viewDoc.fileType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL preview
                  <img src={viewDoc.dataUrl} alt={viewDoc.title} className="w-full max-h-64 object-contain" />
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <span className="text-4xl block mb-2">📄</span>
                    <p className="text-sm">PDF Document</p>
                    <a
                      href={viewDoc.dataUrl}
                      download={viewDoc.fileName}
                      className="inline-block mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                    >
                      Download
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <a
                href={viewDoc.dataUrl}
                download={viewDoc.fileName}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 text-sm text-center"
              >
                Download
              </a>
              <button
                onClick={() => setViewDoc(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
