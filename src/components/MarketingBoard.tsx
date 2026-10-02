"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getProfileContext } from "@/lib/profile";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";

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
  category: string | null;
  size: string | null;
  personName: string | null;
  locationId: string | null;
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
// `cat` ties every preset to the category picker on the promotion form.
const posterSizes = [
  { name: "A4 Poster", dims: "210 × 297 mm", px: "2480 × 3508 px", use: "In-store print", ratio: "aspect-[210/297]", cat: "Poster" },
  { name: "A3 Poster", dims: "297 × 420 mm", px: "3508 × 4961 px", use: "Window / wall", ratio: "aspect-[297/420]", cat: "Poster" },
  { name: "US Letter", dims: '8.5 × 11 in', px: "2550 × 3300 px", use: "Counter flyer", ratio: "aspect-[85/110]", cat: "Flyer" },
  { name: "Table Tent", dims: "4 × 6 in", px: "1200 × 1800 px", use: "Table card", ratio: "aspect-[4/6]", cat: "Signage" },
  { name: "Instagram Post", dims: "1080 × 1080", px: "1:1 square", use: "Feed post", ratio: "aspect-square", cat: "Social" },
  { name: "Instagram Story", dims: "1080 × 1920", px: "9:16 vertical", use: "Story / Reel", ratio: "aspect-[9/16]", cat: "Story" },
  { name: "Facebook Post", dims: "1200 × 630", px: "1.91:1", use: "Link share", ratio: "aspect-[1200/630]", cat: "Social" },
  { name: "Menu Board", dims: "1920 × 1080", px: "16:9 screen", use: "Digital display", ratio: "aspect-video", cat: "Menu Board" },
];

// What a promotion is for. Stored on marketing_promotions.category — see
// supabase/schema-marketing-fields.sql.
const CATEGORIES = [
  { value: "poster", label: "Poster" },
  { value: "flyer", label: "Flyer / Handout" },
  { value: "social", label: "Social Post" },
  { value: "story", label: "Story / Reel" },
  { value: "menu_board", label: "Menu Board" },
  { value: "signage", label: "In-store Signage" },
];

function categoryLabel(value: string | null | undefined): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "";
}

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

type PromotionRow = {
  id: string;
  title: string;
  description: string | null;
  file_name: string | null;
  file_size: number | null;
  month: number;
  year: number;
  status: "planned" | "active" | "completed";
  created_at: string;
  category?: string | null;
  size?: string | null;
  person_name?: string | null;
  location_id?: string | null;
};

function toPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    fileName: row.file_name || "",
    fileSize: row.file_size ? formatFileSize(row.file_size) : "",
    month: row.month,
    year: row.year,
    status: row.status,
    uploadedAt: (row.created_at || "").split("T")[0],
    category: row.category ?? null,
    size: row.size ?? null,
    personName: row.person_name ?? null,
    locationId: row.location_id ?? null,
  };
}

type SocialPostRow = {
  id: string;
  day: number;
  channel: string;
  caption: string;
};

function toPost(row: SocialPostRow): SocialPost {
  const known = Object.keys(channelColors).includes(row.channel);
  return {
    id: row.id,
    day: row.day,
    channel: (known ? row.channel : "In-store") as keyof typeof channelColors,
    caption: row.caption,
  };
}

// Patch 8 adds category / size / person / location (supabase/schema-marketing-
// fields.sql). A database that predates the migration rejects the wider
// projection, so reads fall back to the legacy columns and the form hides the
// fields it cannot persist.
const PROMO_COLUMNS =
  "id, title, description, file_name, file_size, month, year, status, category, size, person_name, location_id, created_at";
const PROMO_COLUMNS_LEGACY =
  "id, title, description, file_name, file_size, month, year, status, created_at";
const POST_COLUMNS = "id, day, channel, caption";

export default function MarketingBoard({ readOnly = false }: { readOnly?: boolean }) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Patch 8 form fields — location comes straight from the locations table.
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [size, setSize] = useState(posterSizes[0].name);
  const [personName, setPersonName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [legacySchema, setLegacySchema] = useState(false);

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [newDay, setNewDay] = useState(0);
  const [newChannel, setNewChannel] = useState<keyof typeof channelColors>("Instagram");
  const [newCaption, setNewCaption] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [promos, calendar, sites] = await Promise.all([
        supabase.from("marketing_promotions").select(PROMO_COLUMNS).order("created_at", { ascending: false }),
        supabase.from("social_media_calendar").select(POST_COLUMNS).order("day", { ascending: true }),
        supabase.from("locations").select("id, name").order("name"),
      ]);
      if (cancelled) return;

      let promoData: PromotionRow[] | null = promos.data;
      if (promos.error) {
        // Most likely the Patch 8 columns aren't migrated yet — re-read the
        // shape this database actually has instead of blanking the board.
        const retry = await supabase
          .from("marketing_promotions")
          .select(PROMO_COLUMNS_LEGACY)
          .order("created_at", { ascending: false });
        if (cancelled) return;
        if (retry.error) {
          setError(promos.error.message);
          setLoading(false);
          return;
        }
        promoData = retry.data;
        setLegacySchema(true);
      }

      if (calendar.error) setError(calendar.error.message);
      else setPosts((calendar.data ?? []).map(toPost));

      setPromotions((promoData ?? []).map(toPromotion));
      if (!sites.error) setLocations((sites.data ?? []) as { id: string; name: string }[]);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const addPost = async () => {
    if (!newCaption.trim() || saving) return;
    setSaving(true);
    setError("");
    const ctx = await getProfileContext();
    if (!ctx) {
      setError("No profile found for this session — sign in again.");
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from("social_media_calendar")
      .insert({
        user_id: ctx.userId,
        restaurant_name: ctx.restaurantName,
        day: newDay,
        channel: newChannel,
        caption: newCaption.trim(),
      })
      .select(POST_COLUMNS)
      .single();
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setPosts((prev) => [...prev, toPost(data)]);
    setNewCaption("");
    setSaving(false);
  };

  const removePost = async (id: string) => {
    const { error } = await supabase.from("social_media_calendar").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpload = async () => {
    if (!title || saving) return;
    setSaving(true);
    setError("");

    const ctx = await getProfileContext();
    if (!ctx) {
      setError("No profile found for this session — sign in again.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("marketing_promotions")
      .insert({
        user_id: ctx.userId,
        restaurant_name: ctx.restaurantName,
        title,
        description,
        file_name: selectedFile ? selectedFile.name : null,
        file_url: selectedFile ? await fileToDataUrl(selectedFile) : null,
        file_size: selectedFile ? selectedFile.size : null,
        month,
        year,
        status: "planned",
        ...(legacySchema
          ? {}
          : {
              category,
              size,
              person_name: personName.trim() || null,
              location_id: locationId || null,
            }),
      })
      .select(legacySchema ? PROMO_COLUMNS_LEGACY : PROMO_COLUMNS)
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    // The select projection is chosen at runtime, so the generated type can't
    // parse it — the row shape is pinned by PROMO_COLUMNS / _LEGACY above.
    setPromotions((prev) => [toPromotion(data as unknown as PromotionRow), ...prev]);
    setSaving(false);
    setShowUpload(false);
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    setCategory(CATEGORIES[0].value);
    setSize(posterSizes[0].name);
    setPersonName("");
    setLocationId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deletePromotion = async (id: string) => {
    if (!confirm("Delete this promotion?")) return;
    const { error } = await supabase.from("marketing_promotions").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setPromotions((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleStatus = async (id: string) => {
    const promo = promotions.find((p) => p.id === id);
    if (!promo) return;
    const nextStatus =
      promo.status === "planned" ? "active" : promo.status === "active" ? "completed" : "planned";
    const { error } = await supabase
      .from("marketing_promotions")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setPromotions((prev) => prev.map((p) => (p.id === id ? { ...p, status: nextStatus } : p)));
  };

  const viewPromotion = async (promo: Promotion) => {
    if (!promo.fileName) return;
    setError("");
    const { data, error } = await supabase
      .from("marketing_promotions")
      .select("file_url")
      .eq("id", promo.id)
      .single();
    if (error || !data?.file_url) {
      setError(error?.message ?? "File not found.");
      return;
    }
    downloadDataUrl(data.file_url, promo.fileName);
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
        {!readOnly && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <span>+</span> Add Promotion
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

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
      {!readOnly && showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
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

              {legacySchema ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Location, person, category and size appear once
                  supabase/schema-marketing-fields.sql has been run against the
                  database.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <select
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      >
                        <option value="">All locations</option>
                        {locations.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Person Name
                      </label>
                      <input
                        type="text"
                        value={personName}
                        onChange={(e) => setPersonName(e.target.value)}
                        placeholder="Who this is for"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Size
                      </label>
                      <select
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      >
                        {posterSizes.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name} — {s.dims}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

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
                  ref={fileInputRef}
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
                disabled={!title || saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Uploading…" : "Upload"}
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
                <span className="px-1.5 py-0.5 bg-gray-100 rounded">{s.cat} · {s.use}</span>
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
                {loading ? (
                  <div className="h-6 rounded bg-gray-100 animate-pulse" />
                ) : posts
                  .filter((p) => p.day === i)
                  .map((p) => (
                    <div key={p.id} className="group relative rounded-md bg-gray-50 border border-gray-100 p-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${channelColors[p.channel]}`}>
                        {p.channel}
                      </span>
                      <p className="text-[11px] text-gray-700 mt-1 leading-snug">{p.caption}</p>
                      {!readOnly && (
                        <button
                          onClick={() => removePost(p.id)}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs"
                          aria-label="Remove post"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {!readOnly && (
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
        )}
      </div>

      {/* Promotions Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-64 animate-pulse" />
          ))}
        </div>
      ) : sortedPromotions.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-3xl mb-2">📣</p>
          <p className="font-semibold text-gray-900">No promotions yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Upload a poster or design file to start the next campaign.
          </p>
        </div>
      ) : (
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
                  {(promo.category || promo.size) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {promo.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
                          {categoryLabel(promo.category)}
                        </span>
                      )}
                      {promo.size && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-100 text-gray-700">
                          {promo.size}
                        </span>
                      )}
                    </div>
                  )}
                  {(promo.personName || promo.locationId) && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {promo.personName ? `👤 ${promo.personName}` : ""}
                      {promo.personName && promo.locationId ? " · " : ""}
                      {promo.locationId
                        ? `📍 ${locations.find((l) => l.id === promo.locationId)?.name ?? "Removed location"}`
                        : ""}
                    </p>
                  )}
                </div>
                {readOnly ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColors[promo.status]}`}>
                    {promo.status.toUpperCase()}
                  </span>
                ) : (
                  <button
                    onClick={() => toggleStatus(promo.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColors[promo.status]} cursor-pointer hover:opacity-80`}
                  >
                    {promo.status.toUpperCase()}
                  </button>
                )}
              </div>

              {promo.description && (
                <p className="text-sm text-gray-600 mb-3">{promo.description}</p>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{promo.fileName}</span>
                <span>{promo.fileSize}</span>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => viewPromotion(promo)}
                  className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200"
                >
                  View
                </button>
                {!readOnly && (
                  <button
                    onClick={() => deletePromotion(promo.id)}
                    className="px-3 py-1.5 text-gray-400 hover:text-red-500 text-xs"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}


