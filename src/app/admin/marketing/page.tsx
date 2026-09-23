"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  Megaphone,
  Plus,
  Trash2,
  CalendarDays,
  ImageIcon,
  AlertTriangle,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  EmptyState,
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

interface Promotion {
  id: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: string;
  fileUrl?: string;
  month: number;
  year: number;
  status: "planned" | "active" | "completed";
  uploadedAt: string;
  kind: "poster" | "social" | "calendar";
  size?: string;
  isStoreRequest?: boolean;
  requestedDate?: string;
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const posterSizes = ["24\"×36\"", "8\"×11\"", "8'×4'", "5'×10'", "Social media"];

const statusStyles: Record<string, string> = {
  planned: "bg-blue-50 text-blue-700 ring-blue-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-gray-100 text-gray-600 ring-gray-200",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function monthsUntil(targetYear: number, targetMonth: number): number {
  const now = new Date();
  const t = new Date(targetYear, targetMonth - 1, 1);
  const c = new Date(now.getFullYear(), now.getMonth(), 1);
  return (
    (t.getFullYear() - c.getFullYear()) * 12 + (t.getMonth() - c.getMonth())
  );
}

const STORAGE_KEY = "btb-marketing-promos";

const DEMO_PROMOS: Promotion[] = [
  {
    id: "1",
    title: "Summer Burger Bonanza",
    description: "Buy 2 burgers get 1 free. All signature burgers included.",
    fileName: "Summer_Bonanza_Poster.pdf",
    fileSize: "3.2 MB",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: "active",
    uploadedAt: "2026-09-01",
    kind: "poster",
    size: '24"×36"',
  },
  {
    id: "2",
    title: "Loyalty Card Launch",
    description: "New loyalty program - 10th burger free.",
    fileName: "Loyalty_Launch.png",
    fileSize: "2.1 MB",
    month: new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2,
    year: new Date().getMonth() + 2 > 12 ? new Date().getFullYear() + 1 : new Date().getFullYear(),
    status: "planned",
    uploadedAt: "2026-09-10",
    kind: "social",
    size: "Social media",
  },
];

function rowToPromo(row: Record<string, unknown>): Promotion {
  const kindRaw = String(row.material_type || row.kind || "poster");
  const kind: Promotion["kind"] =
    kindRaw === "social" || kindRaw === "calendar" ? kindRaw : "poster";
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    fileName: String(row.file_name || ""),
    fileSize: String(row.file_size || ""),
    fileUrl: row.file_data ? String(row.file_data) : row.file_url ? String(row.file_url) : undefined,
    month: Number(row.month || 1),
    year: Number(row.year || new Date().getFullYear()),
    status: (row.status as Promotion["status"]) || "planned",
    uploadedAt: String(row.created_at || "").slice(0, 10),
    kind,
    size: row.size ? String(row.size) : kind === "poster" ? undefined : "Social media",
    isStoreRequest: Boolean(row.is_store_request),
    requestedDate: row.requested_date ? String(row.requested_date) : undefined,
  };
}

export default function MarketingPage() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [promotions, setPromotions] = useState<Promotion[]>(DEMO_PROMOS);

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [kind, setKind] = useState<Promotion["kind"]>("poster");
  const [size, setSize] = useState(posterSizes[0]);
  const [isStoreRequest, setIsStoreRequest] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("marketing_promotions")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          if (!cancelled && !error && data && data.length > 0) {
            const mapped = data.map(rowToPromo);
            setPromotions(mapped);
            writeLocal(STORAGE_KEY, mapped);
            return;
          }
        }
        if (!cancelled) {
          const local = readLocal<Promotion[] | null>(STORAGE_KEY, null);
          if (local) setPromotions(local);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const persistPromoList = (next: Promotion[]) => {
    setPromotions(next);
    writeLocal(STORAGE_KEY, next);
  };

  const leadMonths = monthsUntil(year, month);
  const leadOk = !isStoreRequest || leadMonths >= 2;

  const handleUpload = async () => {
    if (!selectedFile || !title) return;
    setFormError("");
    if (!leadOk) {
      setFormError(
        `Store promotion requests must be submitted at least 2 months in advance. You are ${Math.max(leadMonths, 0)} month(s) ahead — pick a later month or uncheck “store request”.`
      );
      return;
    }

    const fileData = await fileToDataUrl(selectedFile);
    const id = crypto.randomUUID();
    const newPromo: Promotion = {
      id,
      title,
      description,
      fileName: selectedFile.name,
      fileSize: formatFileSize(selectedFile.size),
      fileUrl: fileData,
      month,
      year,
      status: "planned",
      uploadedAt: new Date().toISOString().split("T")[0],
      kind,
      size: kind === "poster" ? size : kind === "social" ? "Social media" : "Calendar",
      isStoreRequest,
      requestedDate: isStoreRequest ? new Date().toISOString().split("T")[0] : undefined,
    };

    persistPromoList([newPromo, ...promotions]);
    setShowUpload(false);
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    setIsStoreRequest(false);
    setFormError("");

    const user = await getSessionUser();
    if (user) {
      const ctx = await getProfileContext();
      const { error } = await supabase.from("marketing_promotions").insert({
        id,
        user_id: user.id,
        restaurant_name: ctx.restaurantName,
        title,
        description,
        file_name: selectedFile.name,
        file_url: fileData,
        file_data: fileData,
        file_size: newPromo.fileSize,
        month,
        year,
        status: "planned",
        material_type: kind,
        size: newPromo.size,
        is_store_request: isStoreRequest,
        requested_date: newPromo.requestedDate || null,
      });
      if (error) console.warn("marketing_promotions insert failed:", error.message);
    }
  };

  const deletePromotion = (id: string) => {
    if (!confirm("Delete this promotion?")) return;
    persistPromoList(promotions.filter((p) => p.id !== id));
    void (async () => {
      const user = await getSessionUser();
      if (user) {
        await supabase.from("marketing_promotions").delete().eq("id", id).eq("user_id", user.id);
      }
    })();
  };

  const toggleStatus = (id: string) => {
    const next: Promotion[] = promotions.map((p) => {
      if (p.id !== id) return p;
      const nextStatus: Promotion["status"] =
        p.status === "planned" ? "active" : p.status === "active" ? "completed" : "planned";
      return { ...p, status: nextStatus };
    });
    persistPromoList(next);
    void (async () => {
      const updated = next.find((p) => p.id === id);
      if (!updated) return;
      const user = await getSessionUser();
      if (user) {
        await supabase
          .from("marketing_promotions")
          .update({ status: updated.status, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id);
      }
    })();
  };

  const sortedPromotions = [...promotions].sort((a, b) => {
    const dateA = new Date(a.year, a.month - 1);
    const dateB = new Date(b.year, b.month - 1);
    return dateA.getTime() - dateB.getTime();
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    setFormError("");
    setSelectedFile(e.target.files?.[0] || null);
  };

  const kindMeta: Record<Promotion["kind"], { label: string; icon: typeof ImageIcon }> = {
    poster: { label: "Print poster", icon: ImageIcon },
    social: { label: "Social media", icon: Megaphone },
    calendar: { label: "Content calendar", icon: CalendarDays },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing materials"
        description="Upload print posters in any size, social posts, and the social media calendar. Locations can request store promotions at least 2 months ahead."
        actions={
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4" /> Add material
          </Button>
        }
      />

      {/* Month tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[0, 1, 2].map((offset) => {
          const m = currentMonth + offset > 12 ? currentMonth + offset - 12 : currentMonth + offset;
          const y = currentMonth + offset > 12 ? currentYear + 1 : currentYear;
          const count = promotions.filter((p) => p.month === m && p.year === y).length;
          return (
            <div
              key={offset}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap ${
                offset === 0 ? "bg-red-600 text-white" : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {monthNames[m - 1]} {y}
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  offset === 0 ? "bg-white/20" : "bg-gray-100"
                }`}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add marketing material</h3>

            <div className="space-y-4">
              <div>
                <span className="block text-[13px] font-medium text-gray-700 mb-1.5">Type</span>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(kindMeta) as Promotion["kind"][]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`rounded-lg border px-2 py-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                        kind === k
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex flex-col items-center gap-1">
                        {(() => {
                          const Icon = kindMeta[k].icon;
                          return <Icon className="h-4 w-4" />;
                        })()}
                        {kindMeta[k].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Title" htmlFor="mk-title">
                <input
                  id="mk-title"
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fall Combo"
                />
              </Field>

              {kind === "poster" && (
                <Field label="Poster size" htmlFor="mk-size">
                  <select
                    id="mk-size"
                    className={inputClass}
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  >
                    {posterSizes.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Description" htmlFor="mk-desc">
                <textarea
                  id="mk-desc"
                  className={`${inputClass} resize-none`}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this promotion?"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Month" htmlFor="mk-month">
                  <select
                    id="mk-month"
                    className={inputClass}
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {monthNames.map((name, idx) => (
                      <option key={name} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Year" htmlFor="mk-year">
                  <select
                    id="mk-year"
                    className={inputClass}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  >
                    <option value={currentYear}>{currentYear}</option>
                    <option value={currentYear + 1}>{currentYear + 1}</option>
                  </select>
                </Field>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isStoreRequest}
                  onChange={(e) => setIsStoreRequest(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-[13px] text-gray-700">
                  <strong className="font-semibold">Store promotion request</strong>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    In-house request by a location — must be submitted 2 months in advance.
                    {leadMonths >= 0 && (
                      <>
                        {" "}
                        Target is{" "}
                        <strong className="text-gray-800">
                          {leadMonths} month{leadMonths === 1 ? "" : "s"} out
                        </strong>
                        .
                      </>
                    )}
                  </span>
                </span>
              </label>

              {!leadOk && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Choose a month at least 2 months from now for store requests.</span>
                </div>
              )}

              <Field label={kind === "calendar" ? "Calendar file" : "File"} htmlFor="mk-file">
                <input
                  id="mk-file"
                  type="file"
                  accept={kind === "calendar" ? ".csv,.xlsx,.pdf,.ics" : ".pdf,.jpg,.jpeg,.png,.psd,.ai,.svg,.webp"}
                  onChange={onFile}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-red-700 hover:file:bg-red-100 cursor-pointer"
                />
                {selectedFile && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    {selectedFile.name} · {formatFileSize(selectedFile.size)}
                  </p>
                )}
              </Field>

              {formError && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowUpload(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!selectedFile || !title || !leadOk} className="flex-1">
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      {sortedPromotions.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="No materials yet"
            description="Upload your first poster, social graphic, or content calendar."
            action={
              <Button onClick={() => setShowUpload(true)}>
                <Plus className="h-4 w-4" /> Add material
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedPromotions.map((promo) => {
            const KindIcon = kindMeta[promo.kind].icon;
            return (
              <Card key={promo.id} padded={false} className="overflow-hidden flex flex-col">
                <div
                  className={`h-28 flex items-center justify-center ${
                    promo.kind === "poster"
                      ? "bg-gradient-to-br from-red-500 to-orange-500"
                      : promo.kind === "social"
                      ? "bg-gradient-to-br from-violet-500 to-indigo-500"
                      : "bg-gradient-to-br from-slate-600 to-slate-800"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1.5 text-white/90">
                    <KindIcon className="h-7 w-7" strokeWidth={1.5} />
                    {promo.size && (
                      <span className="text-[11px] font-semibold tracking-wide">{promo.size}</span>
                    )}
                  </div>
                </div>

                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold text-gray-900 truncate">
                        {promo.title}
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        {monthNames[promo.month - 1]} {promo.year}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleStatus(promo.id)}
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset cursor-pointer transition-opacity hover:opacity-80 ${statusStyles[promo.status]}`}
                    >
                      {promo.status.toUpperCase()}
                    </button>
                  </div>

                  {promo.isStoreRequest && (
                    <div className="mb-2">
                      <Badge tone="amber">Store request · 2-mo lead</Badge>
                    </div>
                  )}

                  {promo.description && (
                    <p className="text-[13px] text-gray-600 mb-3 line-clamp-2">{promo.description}</p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div className="min-w-0 text-[11px] text-gray-400 truncate">
                      {promo.fileName} · {promo.fileSize}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 cursor-pointer transition-colors"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${promo.title}`}
                        onClick={() => deletePromotion(promo.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
