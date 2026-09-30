"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getProfileContext } from "@/lib/profile";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";

interface Manual {
  id: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: string;
  category: string;
  uploadedAt: string;
}

const categories = [
  { value: "general", label: "General", icon: "📋" },
  { value: "safety", label: "Food Safety", icon: "🛡️" },
  { value: "operations", label: "Operations", icon: "⚙️" },
  { value: "training", label: "Training", icon: "📚" },
  { value: "other", label: "Other", icon: "📎" },
];

type ManualRow = {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_size: number | null;
  category: string | null;
  created_at: string;
};

function toManual(row: ManualRow): Manual {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    fileName: row.file_name,
    fileSize: formatFileSize(row.file_size),
    category: row.category || "general",
    uploadedAt: (row.created_at || "").split("T")[0],
  };
}

const MANUAL_COLUMNS = "id, title, description, file_name, file_size, category, created_at";

export default function PrintManuals({ readOnly = false }: { readOnly?: boolean }) {
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("print_manuals")
        .select(MANUAL_COLUMNS)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setManuals((data ?? []).map(toManual));
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !title || saving) return;
    setSaving(true);
    setError("");

    const ctx = await getProfileContext();
    if (!ctx) {
      setError("No profile found for this session — sign in again.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("print_manuals")
      .insert({
        user_id: ctx.userId,
        restaurant_name: ctx.restaurantName,
        title,
        description,
        file_name: selectedFile.name,
        file_url: await fileToDataUrl(selectedFile),
        file_size: selectedFile.size,
        category,
      })
      .select(MANUAL_COLUMNS)
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setManuals((prev) => [toManual(data), ...prev]);
    setSaving(false);
    setShowUpload(false);
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deleteManual = async (id: string) => {
    if (!confirm("Delete this manual?")) return;
    const { error } = await supabase.from("print_manuals").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setManuals((prev) => prev.filter((m) => m.id !== id));
  };

  const downloadManual = async (manual: Manual) => {
    setError("");
    const { data, error } = await supabase
      .from("print_manuals")
      .select("file_url")
      .eq("id", manual.id)
      .single();
    if (error || !data?.file_url) {
      setError(error?.message ?? "File not found.");
      return;
    }
    downloadDataUrl(data.file_url, manual.fileName);
  };

  const getCategoryInfo = (cat: string) => {
    return categories.find((c) => c.value === cat) || categories[4];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Print Manuals</h1>
          <p className="text-sm text-gray-500">
            Management manuals available for download and printing
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <span>+</span> Upload Manual
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Upload Modal */}
      {!readOnly && showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Upload Manual</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Food Safety Manual"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the manual..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File (PDF preferred)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-900"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowUpload(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || !title || saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto">
        <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white whitespace-nowrap">
          All ({manuals.length})
        </button>
        {categories.map((cat) => {
          const count = manuals.filter((m) => m.category === cat.value).length;
          return (
            <button
              key={cat.value}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap"
            >
              {cat.icon} {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Manuals Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-64 animate-pulse" />
          ))}
        </div>
      ) : manuals.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-3xl mb-2">📑</p>
          <p className="font-semibold text-gray-900">No manuals yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Upload a food safety, operations or training manual for the team to print.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {manuals.map((manual) => {
          const catInfo = getCategoryInfo(manual.category);
          return (
            <div
              key={manual.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="h-32 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                <span className="text-5xl">📑</span>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                      {catInfo.icon} {catInfo.label}
                    </span>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => deleteManual(manual.id)}
                      className="text-gray-400 hover:text-red-500 text-sm"
                    >
                      🗑️
                    </button>
                  )}
                </div>

                <h3 className="font-bold text-gray-900 mb-1">{manual.title}</h3>
                {manual.description && (
                  <p className="text-sm text-gray-600 mb-3">{manual.description}</p>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span className="truncate max-w-[180px]">{manual.fileName}</span>
                  <span>{manual.fileSize}</span>
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
                    🖨️ Print
                  </button>
                  <button
                    onClick={() => downloadManual(manual)}
                    className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors"
                  >
                    📥 Download
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
