"use client";

import { useState } from "react";

interface Promotion {
  id: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: string;
  month: number;
  year: number;
  status: "planned" | "active" | "completed";
  uploadedAt: string;
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const statusColors = {
  planned: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-700",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default function MarketingPage() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [promotions, setPromotions] = useState<Promotion[]>([
    {
      id: "1",
      title: "Summer Burger Bonanza",
      description: "Buy 2 burgers get 1 free. All signature burgers included.",
      fileName: "Summer_Bonanza_Poster.pdf",
      fileSize: "3.2 MB",
      month: currentMonth,
      year: currentYear,
      status: "active",
      uploadedAt: "2026-09-01",
    },
    {
      id: "2",
      title: "Loyalty Card Launch",
      description: "New loyalty program - 10th burger free.",
      fileName: "Loyalty_Launch.pdf",
      fileSize: "2.1 MB",
      month: currentMonth + 1 > 12 ? 1 : currentMonth + 1,
      year: currentMonth + 1 > 12 ? currentYear + 1 : currentYear,
      status: "planned",
      uploadedAt: "2026-09-10",
    },
  ]);

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleUpload = () => {
    if (!selectedFile || !title) return;

    const newPromo: Promotion = {
      id: Date.now().toString(),
      title,
      description,
      fileName: selectedFile.name,
      fileSize: formatFileSize(selectedFile.size),
      month,
      year,
      status: "planned",
      uploadedAt: new Date().toISOString().split("T")[0],
    };

    setPromotions((prev) => [newPromo, ...prev]);
    setShowUpload(false);
    setTitle("");
    setDescription("");
    setSelectedFile(null);
  };

  const deletePromotion = (id: string) => {
    if (!confirm("Delete this promotion?")) return;
    setPromotions((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleStatus = (id: string) => {
    setPromotions((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const nextStatus =
          p.status === "planned" ? "active" : p.status === "active" ? "completed" : "planned";
        return { ...p, status: nextStatus };
      })
    );
  };

  const sortedPromotions = [...promotions].sort((a, b) => {
    const dateA = new Date(a.year, a.month - 1);
    const dateB = new Date(b.year, b.month - 1);
    return dateA.getTime() - dateB.getTime();
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketing Promotions</h1>
          <p className="text-sm text-gray-500">
            Upload and manage promotions for the next 3 months
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add Promotion
        </button>
      </div>

      {/* Month Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[0, 1, 2].map((offset) => {
          const m = currentMonth + offset > 12 ? currentMonth + offset - 12 : currentMonth + offset;
          const y = currentMonth + offset > 12 ? currentYear + 1 : currentYear;
          const count = promotions.filter((p) => p.month === m && p.year === y).length;
          return (
            <div
              key={offset}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${
                offset === 0
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {monthNames[m - 1]} {y}
              {count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px]">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Add Promotion</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Holiday Special"
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
                  placeholder="Describe the promotion..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Month
                  </label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  >
                    {monthNames.map((name, idx) => (
                      <option key={idx} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  >
                    <option value={currentYear}>{currentYear}</option>
                    <option value={currentYear + 1}>{currentYear + 1}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Poster / Design File
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.psd,.ai,.svg"
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

      {/* Promotions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedPromotions.map((promo) => (
          <div
            key={promo.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            {/* Placeholder for poster */}
            <div className="h-40 bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
              <span className="text-white text-4xl">📣</span>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-gray-900">{promo.title}</h3>
                  <p className="text-xs text-gray-500">
                    {monthNames[promo.month - 1]} {promo.year}
                  </p>
                </div>
                <button
                  onClick={() => toggleStatus(promo.id)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColors[promo.status]} cursor-pointer hover:opacity-80`}
                >
                  {promo.status.toUpperCase()}
                </button>
              </div>

              {promo.description && (
                <p className="text-sm text-gray-600 mb-3">{promo.description}</p>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{promo.fileName}</span>
                <span>{promo.fileSize}</span>
              </div>

              <div className="flex gap-2 mt-3">
                <button className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">
                  View
                </button>
                <button
                  onClick={() => deletePromotion(promo.id)}
                  className="px-3 py-1.5 text-gray-400 hover:text-red-500 text-xs"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
