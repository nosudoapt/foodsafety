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

// Print + digital poster presets so staff export at the right dimensions.
const posterSizes = [
  { name: "A4 Poster", dims: "210 × 297 mm", px: "2480 × 3508 px", use: "In-store print", ratio: "aspect-[210/297]" },
  { name: "A3 Poster", dims: "297 × 420 mm", px: "3508 × 4961 px", use: "Window / wall", ratio: "aspect-[297/420]" },
  { name: "US Letter", dims: '8.5 × 11 in', px: "2550 × 3300 px", use: "Counter flyer", ratio: "aspect-[85/110]" },
  { name: "Table Tent", dims: "4 × 6 in", px: "1200 × 1800 px", use: "Table card", ratio: "aspect-[4/6]" },
  { name: "Instagram Post", dims: "1080 × 1080", px: "1:1 square", use: "Feed post", ratio: "aspect-square" },
  { name: "Instagram Story", dims: "1080 × 1920", px: "9:16 vertical", use: "Story / Reel", ratio: "aspect-[9/16]" },
  { name: "Facebook Post", dims: "1200 × 630", px: "1.91:1", use: "Link share", ratio: "aspect-[1200/630]" },
  { name: "Menu Board", dims: "1920 × 1080", px: "16:9 screen", use: "Digital display", ratio: "aspect-video" },
];

const channelColors: Record<string, string> = {
  Instagram: "bg-pink-100 text-pink-700",
  Facebook: "bg-blue-100 text-blue-700",
  "In-store": "bg-amber-100 text-amber-700",
  TikTok: "bg-slate-200 text-slate-800",
};

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface SocialPost {
  id: string;
  day: number; // 0 = Mon
  channel: keyof typeof channelColors;
  caption: string;
}

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

  const [posts, setPosts] = useState<SocialPost[]>([
    { id: "p1", day: 0, channel: "Instagram", caption: "Motivation Monday — new burger drop 🍔" },
    { id: "p2", day: 2, channel: "Facebook", caption: "Midweek deal: 2-for-1 sliders" },
    { id: "p3", day: 4, channel: "Instagram", caption: "Weekend teaser reel 🎬" },
    { id: "p4", day: 5, channel: "In-store", caption: "Table-tent promo live" },
  ]);
  const [newDay, setNewDay] = useState(0);
  const [newChannel, setNewChannel] = useState<keyof typeof channelColors>("Instagram");
  const [newCaption, setNewCaption] = useState("");

  const addPost = () => {
    if (!newCaption.trim()) return;
    setPosts((prev) => [
      ...prev,
      { id: Date.now().toString(), day: newDay, channel: newChannel, caption: newCaption.trim() },
    ]);
    setNewCaption("");
  };
  const removePost = (id: string) =>
    setPosts((prev) => prev.filter((p) => p.id !== id));

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

      {/* Poster size presets */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-bold text-gray-900 mb-1">Poster & social sizes</h2>
        <p className="text-sm text-gray-500 mb-4">
          Export designs at these dimensions so print and social always look sharp.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {posterSizes.map((s) => (
            <div key={s.name} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 shrink-0 ${s.ratio} bg-gradient-to-br from-red-400 to-orange-400 rounded`} />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.dims}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                <span>{s.px}</span>
                <span className="px-1.5 py-0.5 bg-gray-100 rounded">{s.use}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Social content calendar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-bold text-gray-900 mb-1">Weekly social calendar</h2>
        <p className="text-sm text-gray-500 mb-4">
          Plan posts across channels for the week. Keep a steady cadence.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 mb-5">
          {dayNames.map((d, i) => (
            <div key={d} className="border border-gray-200 rounded-lg p-2 min-h-[92px]">
              <p className="text-xs font-semibold text-gray-500 mb-2">{d}</p>
              <div className="space-y-1.5">
                {posts
                  .filter((p) => p.day === i)
                  .map((p) => (
                    <div key={p.id} className="group relative rounded-md bg-gray-50 border border-gray-100 p-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${channelColors[p.channel]}`}>
                        {p.channel}
                      </span>
                      <p className="text-[11px] text-gray-700 mt-1 leading-snug">{p.caption}</p>
                      <button
                        onClick={() => removePost(p.id)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs"
                        aria-label="Remove post"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Day</label>
            <select
              value={newDay}
              onChange={(e) => setNewDay(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
            >
              {dayNames.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Channel</label>
            <select
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value as keyof typeof channelColors)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
            >
              {Object.keys(channelColors).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Caption</label>
            <input
              type="text"
              value={newCaption}
              onChange={(e) => setNewCaption(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPost()}
              placeholder="What's the post?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
            />
          </div>
          <button
            onClick={addPost}
            disabled={!newCaption.trim()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            Add post
          </button>
        </div>
      </div>

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
