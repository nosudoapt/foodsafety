"use client";

import { useState, useRef } from "react";

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default function ManualsPage() {
  const [manuals, setManuals] = useState<Manual[]>([
    {
      id: "1",
      title: "Food Safety Manual",
      description: "Complete food safety procedures and guidelines for all staff.",
      fileName: "Food_Safety_Manual_2026.pdf",
      fileSize: "4.2 MB",
      category: "safety",
      uploadedAt: "2026-01-15",
    },
    {
      id: "2",
      title: "Opening & Closing Procedures",
      description: "Step-by-step guide for daily opening and closing tasks.",
      fileName: "Opening_Closing_Guide.pdf",
      fileSize: "1.8 MB",
      category: "operations",
      uploadedAt: "2026-02-10",
    },
    {
      id: "3",
      title: "New Staff Orientation",
      description: "Onboarding manual for new team members.",
      fileName: "Staff_Orientation.pdf",
      fileSize: "3.1 MB",
      category: "training",
      uploadedAt: "2026-03-05",
    },
  ]);

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    if (!selectedFile || !title) return;

    const newManual: Manual = {
      id: Date.now().toString(),
      title,
      description,
      fileName: selectedFile.name,
      fileSize: formatFileSize(selectedFile.size),
      category,
      uploadedAt: new Date().toISOString().split("T")[0],
    };

    setManuals((prev) => [newManual, ...prev]);
    setShowUpload(false);
    setTitle("");
    setDescription("");
    setSelectedFile(null);
  };

  const deleteManual = (id: string) => {
    if (!confirm("Delete this manual?")) return;
    setManuals((prev) => prev.filter((m) => m.id !== id));
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
        <button
          onClick={() => setShowUpload(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Upload Manual
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
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
                disabled={!selectedFile || !title}
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
                  <button
                    onClick={() => deleteManual(manual.id)}
                    className="text-gray-400 hover:text-red-500 text-sm"
                  >
                    🗑️
                  </button>
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
                  <button className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors">
                    📥 Download
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
