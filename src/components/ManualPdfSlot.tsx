"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getProfileContext } from "@/lib/profile";
import { downloadDataUrl, fileToDataUrl, formatFileSize, printDataUrl } from "@/lib/files";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";

interface StoredManual {
  id: string;
  title: string;
  file_name: string;
  file_size: number | null;
  file_url: string;
}

interface ManualPdfSlotProps {
  /** The exact print_manuals title this slot owns (newest row wins). */
  title: string;
  /** The print_manuals category the upload is filed under. */
  category: string;
  /** Card heading; defaults to the title. */
  heading?: string;
  /** If no row matches the title yet, show the newest row in the category
   *  (keeps manuals uploaded before this slot existed visible). */
  fallbackToCategory?: boolean;
  accent?: "red" | "rust";
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const HEAD_STYLES: Record<string, { card: string; head: string }> = {
  red: { card: "border-red-200", head: "bg-red-50 border-red-100" },
  rust: { card: "border-[#b65a2e]", head: "bg-[#fdf8e8] border-[#ead9b8]" },
};

/** One manager-owned PDF slot on a procedure page. Everyone can download and
 * print; only managers (identity role "manager", the same MGR_ONLY tier the
 * Manuals page uses for edits) see the "Add PDF" button. Re-uploading simply
 * files a newer copy — the newest row wins. */
export default function ManualPdfSlot({ title, category, heading, fallbackToCategory = false, accent = "red" }: ManualPdfSlotProps) {
  const { identity } = useBtbWorkspace();
  const canUpload = identity?.role === "manager" || identity?.role === "admin";
  const [manual, setManual] = useState<StoredManual | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let { data } = await supabase
          .from("print_manuals")
          .select("id, title, file_name, file_size, file_url")
          .eq("title", title)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!data?.length && fallbackToCategory) {
          ({ data } = await supabase
            .from("print_manuals")
            .select("id, title, file_name, file_size, file_url")
            .eq("category", category)
            .order("created_at", { ascending: false })
            .limit(1));
        }
        if (!cancelled) {
          setManual((data?.[0] as StoredManual | undefined) ?? null);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, fallbackToCategory, title]);

  const pick = (file: File | undefined) => {
    setError("");
    if (!file || busy) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("PDF must be under 10 MB — compress it first.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    void upload(file);
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const ctx = await getProfileContext();
      if (!ctx) throw new Error("No profile found for this session — sign in again.");
      const { error: insertError } = await supabase.from("print_manuals").insert({
        user_id: ctx.userId,
        restaurant_name: ctx.restaurantName,
        title,
        description: "",
        file_name: file.name,
        file_url: await fileToDataUrl(file),
        file_size: file.size,
        category,
      });
      if (insertError) throw insertError;
      const { data } = await supabase
        .from("print_manuals")
        .select("id, title, file_name, file_size, file_url")
        .eq("title", title)
        .order("created_at", { ascending: false })
        .limit(1);
      setManual((data?.[0] as StoredManual | undefined) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDF couldn't be uploaded. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-4 print:hidden">
      <div className={`bg-white rounded-xl border-2 ${HEAD_STYLES[accent].card} overflow-hidden`}>
        <div className={`px-4 py-3 border-b ${HEAD_STYLES[accent].head}`}>
          <h2 className="font-bold text-gray-900 text-sm">📕 {heading ?? title}</h2>
        </div>
        <div className="px-4 py-4">
          {!loaded ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : manual ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{manual.title}</p>
                <p className="text-xs text-gray-500">
                  {manual.file_name} · {formatFileSize(manual.file_size)}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => downloadDataUrl(manual.file_url, manual.file_name)}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
                >
                  Download
                </button>
                <button
                  onClick={() => (manual.file_name.toLowerCase().endsWith(".pdf") ? printDataUrl(manual.file_url) : downloadDataUrl(manual.file_url, manual.file_name))}
                  className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-900 transition"
                >
                  Print
                </button>
                {canUpload && (
                  <>
                    <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {busy ? "Uploading…" : "＋ Add PDF (manager)"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-gray-500 grow">
                No PDF uploaded yet — managers can add it here and it becomes available to the whole team for print.
              </p>
              {canUpload && (
                <>
                  <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {busy ? "Uploading…" : "＋ Add PDF (manager)"}
                  </button>
                </>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
