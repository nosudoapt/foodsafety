"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileContext } from "@/lib/profile";
import { fetchJson } from "@/lib/fetch-json";
import { BTB_UPLOAD_MAX_BYTES, type BtbUploaderConnection } from "@/lib/btb-uploads";
import { downloadDataUrl, fileToDataUrl, formatFileSize } from "@/lib/files";
import { Badge, Button, PageHeader } from "@/components/ui";
import Modal from "@/components/Modal";
import { jsonRequest } from "@/components/btb/Feedback";
import { Check, CircleAlert, Download, FileImage, Megaphone, Plus, Trash2 } from "lucide-react";

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
  creatorName: string | null;
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

// The client-approved size list — the exact formats marketing exports at.
// `cat` ties every preset to the category picker on the promotion form.
// NOTE: the stored `size` is free text, so this list can change without SQL;
// `category` is constrained by the CHECK in schema-marketing-fields.sql.
const posterSizes = [
  { name: '24"×36" Poster', dims: '24 × 36 in', px: "2880 × 4320 px", use: "Wall / window", ratio: "aspect-[24/36]", cat: "Poster" },
  { name: '8"×11" Flyer', dims: '8 × 11 in', px: "960 × 1320 px", use: "Counter handout", ratio: "aspect-[8/11]", cat: "Flyer" },
  { name: "8'×4' Banner", dims: "8 × 4 ft", px: "960 × 480 px", use: "Outdoor banner", ratio: "aspect-[8/4]", cat: "Signage" },
  { name: '5\'×10" Sign', dims: '5 ft × 10 in', px: "600 × 120 px", use: "Bench / roadside", ratio: "aspect-[50/10]", cat: "Signage" },
  { name: "Social Media Poster", dims: "1080 × 1080 px", px: "1:1 square", use: "Feed post", ratio: "aspect-square", cat: "Social" },
];

// What a promotion is for. Stored on marketing_promotions.category — see
// supabase/schema-marketing-fields.sql. Labels are client wording; the stored
// `value` must stay inside that migration's CHECK list.
const CATEGORIES = [
  { value: "poster", label: "Poster" },
  { value: "flyer", label: "Flyer / Handout" },
  { value: "social", label: "Social Media Poster" },
  { value: "story", label: "Social Story" },
  { value: "menu_board", label: "Menu Board" },
  { value: "signage", label: "Sign / Banner" },
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
  date: string | null;
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
  btb_created_by_name?: string | null;
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
    creatorName: row.btb_created_by_name ?? null,
  };
}

type SocialPostRow = {
  id: string;
  day: number;
  channel: string;
  caption: string;
  post_date: string | null;
};

function toPost(row: SocialPostRow): SocialPost {
  const known = Object.keys(channelColors).includes(row.channel);
  return {
    id: row.id,
    day: row.day,
    channel: (known ? row.channel : "In-store") as keyof typeof channelColors,
    caption: row.caption,
    date: row.post_date,
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
const POST_COLUMNS = "id, day, channel, caption, post_date";

export default function MarketingBoard({ readOnly = false, restaurant: fixedRestaurant }: { readOnly?: boolean; restaurant?: string }) {
  const { user, restaurantName } = useAuth();
  const restaurant = fixedRestaurant ?? restaurantName;
  return <MarketingWorkspace key={`${fixedRestaurant ? "independent" : user?.id}:${restaurant}`} readOnly={readOnly} restaurant={restaurant} independentWorkspace={!!fixedRestaurant} />;
}

function MarketingWorkspace({ readOnly, restaurant, independentWorkspace }: { readOnly: boolean; restaurant: string; independentWorkspace: boolean }) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [feedbackArea, setFeedbackArea] = useState<"campaign" | "planner">("campaign");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState("all");

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
  const [locationsError, setLocationsError] = useState("");
  const [legacySchema, setLegacySchema] = useState(false);
  const [connection, setConnection] = useState<BtbUploaderConnection | null>(null);
  const uploadConnected = !independentWorkspace || connection?.connected === true;

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [newDay, setNewDay] = useState(0);
  const [newChannel, setNewChannel] = useState<keyof typeof channelColors>("Instagram");
  const [newCaption, setNewCaption] = useState("");
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    const load = async () => {
      try {
      if (!restaurant) throw new Error("Your marketing workspace could not be identified. Reconnect and try again.");
      if (independentWorkspace) {
        const result = await fetchJson<{ promotions: PromotionRow[]; posts: SocialPostRow[]; uploader: BtbUploaderConnection }>("/api/btb/marketing", { signal: controller.signal });
        if (!cancelled) {
          setPromotions(result.promotions.map(toPromotion)); setPosts(result.posts.map(toPost));
          setConnection(result.uploader); setLocations([]); setLocationsError("");
          setLegacySchema(false); setLoadError("");
        }
        return;
      }
      const [promos, calendar, sites] = await Promise.all([
        supabase.from("marketing_promotions").select(PROMO_COLUMNS).eq("restaurant_name", restaurant).order("created_at", { ascending: false }).abortSignal(controller.signal),
        supabase.from("social_media_calendar").select(POST_COLUMNS).eq("restaurant_name", restaurant).order("day", { ascending: true }).abortSignal(controller.signal),
        supabase.from("locations").select("id, name").order("name").abortSignal(controller.signal),
      ]);
      if (cancelled) return;

      let promoData: PromotionRow[] | null = promos.data;
      if (promos.error) {
        if (!["42703", "PGRST204"].includes(promos.error.code)) throw new Error("Promotions couldn’t be loaded. Please try again.");
        // Most likely the Patch 8 columns aren't migrated yet — re-read the
        // shape this database actually has instead of blanking the board.
        const retry = await supabase
          .from("marketing_promotions")
          .select(PROMO_COLUMNS_LEGACY)
          .eq("restaurant_name", restaurant)
          .order("created_at", { ascending: false }).abortSignal(controller.signal);
        if (cancelled) return;
        if (retry.error) {
          throw new Error("Promotions couldn’t be loaded. Please try again.");
        }
        promoData = retry.data;
        setLegacySchema(true);
      } else setLegacySchema(false);

      if (calendar.error) throw new Error("The social planner couldn’t be loaded. Please try again.");
      setLocationsError(sites.error ? "Campaign locations couldn’t be loaded. You can save for all locations, or reload this page to retry." : "");
      setPosts((calendar.data ?? []).map(toPost));

      setPromotions((promoData ?? []).map(toPromotion));
      if (!sites.error) setLocations((sites.data ?? []) as { id: string; name: string }[]);
      setLoadError("");
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "The marketing board couldn’t be loaded.");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      controller.abort(); window.clearTimeout(timeout);
    };
  }, [independentWorkspace, restaurant, revision]);

  const addPost = async () => {
    if (readOnly || !uploadConnected || !newCaption.trim() || saving) return;
    setSaving(true);
    setFeedbackArea("planner");
    setError(""); setNotice("");
    try {
    const fields = { day: newDay, channel: newChannel, caption: newCaption.trim(), post_date: newDate || null };
    let post: SocialPostRow;
    if (independentWorkspace) {
      const result = await fetchJson<{ post: SocialPostRow }>("/api/btb/social-posts", jsonRequest(fields));
      post = result.post;
    } else {
      const ctx = await getProfileContext();
      if (!ctx || ctx.restaurantName !== restaurant) throw new Error("An uploader profile is required for this workspace. Sign in again, then retry your post.");
      const { data, error } = await supabase.from("social_media_calendar")
        .insert({ user_id: ctx.userId, restaurant_name: restaurant, ...fields })
        .select(POST_COLUMNS).abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The post wasn’t saved. Your caption and schedule are still here; please try again.");
      post = data;
    }
    setPosts((prev) => [...prev, toPost(post)]);
    setNewCaption("");
    setNotice(newDate ? "Scheduled post saved." : "Post added to your weekly plan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The post couldn’t be saved."); }
    finally { setSaving(false); }
  };

  const removePost = async (id: string) => {
    if (readOnly || busyId) return;
    setBusyId(id); setError(""); setNotice("");
    setFeedbackArea("planner");
    try {
    if (independentWorkspace) {
      await fetchJson("/api/btb/social-posts", jsonRequest({ id }, "DELETE"));
    } else {
      const { data, error } = await supabase.from("social_media_calendar").delete().eq("id", id).eq("restaurant_name", restaurant)
        .select("id").abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The post wasn’t removed. Please try again.");
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setNotice("Post removed from the planner.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The post couldn’t be removed."); }
    finally { setBusyId(null); }
  };

  const handleUpload = async () => {
    if (readOnly || !uploadConnected || !title.trim() || saving) return;
    setSaving(true);
    setFeedbackArea("campaign");
    setError(""); setNotice("");

    try {
    if (independentWorkspace && selectedFile && selectedFile.size > BTB_UPLOAD_MAX_BYTES) throw new Error("Choose a file no larger than 3 MB.");
    const fields = {
      title: title.trim(), description: description.trim(), month, year, status: "planned",
      ...(legacySchema ? {} : { category, size, person_name: personName.trim() || null, location_id: locationId || null }),
    };
    let promotion: PromotionRow;
    if (independentWorkspace) {
      const result = await fetchJson<{ promotion: PromotionRow }>("/api/btb/marketing", jsonRequest({ ...fields, file: selectedFile ? { name: selectedFile.name, url: await fileToDataUrl(selectedFile) } : null }));
      promotion = result.promotion;
    } else {
      const ctx = await getProfileContext();
      if (!ctx || ctx.restaurantName !== restaurant) throw new Error("An uploader profile is required for this workspace. Sign in again, then retry this promotion.");
      const { data, error } = await supabase.from("marketing_promotions").insert({
        user_id: ctx.userId, restaurant_name: restaurant, ...fields,
        file_name: selectedFile ? selectedFile.name : null,
        file_url: selectedFile ? await fileToDataUrl(selectedFile) : null,
        file_size: selectedFile ? selectedFile.size : null,
      }).select(legacySchema ? PROMO_COLUMNS_LEGACY : PROMO_COLUMNS).abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The promotion wasn’t saved. Your details and artwork are still here; please try again.");
      // The runtime projection is pinned by PROMO_COLUMNS / _LEGACY above.
      promotion = data as unknown as PromotionRow;
    }
    setPromotions((prev) => [toPromotion(promotion), ...prev]);
    setNotice(`${title.trim()} added to the campaign board.`);
    setPeriod("all");
    setShowUpload(false);
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    setCategory(CATEGORIES[0].value);
    setSize(posterSizes[0].name);
    setPersonName("");
    setLocationId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The promotion couldn’t be saved."); }
    finally { setSaving(false); }
  };

  const deletePromotion = async (id: string) => {
    if (readOnly || busyId || !confirm("Delete this promotion?")) return;
    setBusyId(id); setError(""); setNotice("");
    setFeedbackArea("campaign");
    try {
    if (independentWorkspace) {
      await fetchJson("/api/btb/marketing", jsonRequest({ id }, "DELETE"));
    } else {
      const { data, error } = await supabase.from("marketing_promotions").delete().eq("id", id).eq("restaurant_name", restaurant)
        .select("id").abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The promotion wasn’t deleted. Please try again.");
    }
    setPromotions((prev) => prev.filter((p) => p.id !== id));
    setNotice("Promotion deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The promotion couldn’t be deleted."); }
    finally { setBusyId(null); }
  };

  const toggleStatus = async (id: string) => {
    if (readOnly || busyId) return;
    const promo = promotions.find((p) => p.id === id);
    if (!promo) return;
    const nextStatus =
      promo.status === "planned" ? "active" : promo.status === "active" ? "completed" : "planned";
    setBusyId(id); setError(""); setNotice("");
    setFeedbackArea("campaign");
    try {
    if (independentWorkspace) {
      await fetchJson("/api/btb/marketing", jsonRequest({ id, status: nextStatus, previous_status: promo.status }, "PATCH"));
    } else {
      const { data, error } = await supabase.from("marketing_promotions")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", id).eq("restaurant_name", restaurant).select("id")
        .abortSignal(AbortSignal.timeout(15_000)).single();
      if (error || !data) throw new Error("The promotion status wasn’t changed. Please try again.");
    }
    setPromotions((prev) => prev.map((p) => (p.id === id ? { ...p, status: nextStatus } : p)));
    setNotice(`${promo.title} marked ${nextStatus}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The promotion couldn’t be updated."); }
    finally { setBusyId(null); }
  };

  const viewPromotion = async (promo: Promotion) => {
    if (!promo.fileName || busyId) return;
    setBusyId(promo.id); setError("");
    setFeedbackArea("campaign");
    try {
    if (independentWorkspace) {
      const result = await fetchJson<{ url: string; name: string }>(`/api/btb/marketing?download=${encodeURIComponent(promo.id)}`);
      downloadDataUrl(result.url, result.name);
      return;
    }
    const { data, error } = await supabase
      .from("marketing_promotions")
      .select("file_url")
      .eq("id", promo.id)
      .eq("restaurant_name", restaurant)
      .abortSignal(AbortSignal.timeout(15_000))
      .single();
    if (error || !data?.file_url) {
      throw new Error("The artwork couldn’t be downloaded. Please try again.");
    }
    downloadDataUrl(data.file_url, promo.fileName);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The artwork couldn’t be downloaded."); }
    finally { setBusyId(null); }
  };

  const sortedPromotions = promotions.filter((promo) => period === "all" || `${promo.year}-${promo.month}` === period).sort((a, b) => {
    const dateA = new Date(a.year, a.month - 1);
    const dateB = new Date(b.year, b.month - 1);
    return dateA.getTime() - dateB.getTime();
  });

  if (loadError && !loading) return <div className="marketing-board"><PageHeader title="Marketing Promotions" subtitle="Campaigns, artwork and the social content planner." /><div className="ui-card ui-empty"><CircleAlert size={30} aria-hidden="true" /><h2>The marketing board is unavailable</h2><p role="alert">{loadError}</p><Button onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Retry marketing board</Button></div></div>;

  return (
    <div className="marketing-board">
      {/* Header */}
      <PageHeader title="Marketing Promotions" subtitle="Campaigns, artwork and the social content planner — ready for your next release."
        action={!readOnly && <Button disabled={loading || !uploadConnected} aria-describedby={!uploadConnected ? "marketing-connection" : undefined} onClick={() => { setError(""); setShowUpload(true); }}><Plus size={17} aria-hidden="true" />Add Promotion</Button>} />

      {!readOnly && !loading && !uploadConnected && <div className="ui-notice" id="marketing-connection"><CircleAlert size={18} aria-hidden="true" /><span>{connection?.message ?? "The BTB uploader connection could not be checked."}</span><Button variant="ghost" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Retry uploader connection</Button></div>}

      {feedbackArea === "campaign" && error && !showUpload && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
      {feedbackArea === "campaign" && notice && <div className="ui-notice ui-notice--success" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}

      {/* Month Tabs */}
      <div className="marketing-periods" role="group" aria-label="Filter campaigns by month">
        <Button variant={period === "all" ? "solid" : "ghost"} aria-pressed={period === "all"} onClick={() => setPeriod("all")}>All campaigns{!loading && ` · ${promotions.length}`}</Button>
        {[0, 1, 2].map((offset) => {
          const m = currentMonth + offset > 12 ? currentMonth + offset - 12 : currentMonth + offset;
          const y = currentMonth + offset > 12 ? currentYear + 1 : currentYear;
          const count = promotions.filter((p) => p.month === m && p.year === y).length;
          return (
            <Button
              key={offset}
              variant={period === `${y}-${m}` ? "solid" : "ghost"}
              aria-pressed={period === `${y}-${m}`}
              onClick={() => setPeriod(`${y}-${m}`)}
            >
              {monthNames[m - 1]} {y}
              {!loading && ` · ${count}`}
            </Button>
          );
        })}
      </div>

      <section aria-labelledby="campaign-heading">
        <div className="dash-section__head"><div><h2 id="campaign-heading">Campaign board</h2><p>{restaurant} · {period === "all" ? "All planned, active and completed promotions" : "Campaigns for the selected month"}</p></div></div>
        {loading ? (
          <div className="marketing-campaign-grid" role="status" aria-label="Loading campaigns">{[0, 1, 2].map((i) => <div key={i} className="ui-card h-64 animate-pulse" />)}</div>
        ) : sortedPromotions.length === 0 ? (
          <div className="ui-card ui-empty">
            <Megaphone size={32} aria-hidden="true" />
            <h3>{period === "all" ? "Make room for your next idea" : "No campaigns this month"}</h3>
            <p>{period === "all" ? "Add a campaign plan, then bring in the artwork when it’s ready." : "Choose another month or view the full campaign board."}</p>
            {period !== "all" && <Button variant="ghost" onClick={() => setPeriod("all")}>View all campaigns</Button>}
          </div>
        ) : (
          <div className="marketing-campaign-grid">
            {sortedPromotions.map((promo) => (
              <article key={promo.id} className="ui-card marketing-campaign" aria-label={promo.title}>
                <div className="marketing-campaign__art"><FileImage size={30} aria-hidden="true" /><span>{promo.fileName ? "Artwork attached" : "Campaign in planning"}</span></div>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0"><h3>{promo.title}</h3><p className="text-xs text-gray-500 mt-1">{monthNames[promo.month - 1]} {promo.year}</p></div>
                    {readOnly ? <span className={`marketing-campaign__status ${statusColors[promo.status]}`}>{promo.status}</span> : (
                      <button onClick={() => toggleStatus(promo.id)} disabled={!!busyId || saving}
                        aria-label={`Mark ${promo.title} ${promo.status === "planned" ? "active" : promo.status === "active" ? "completed" : "planned"}`}
                        title={`Mark ${promo.status === "planned" ? "active" : promo.status === "active" ? "completed" : "planned"}`}
                        className={`marketing-campaign__status ${statusColors[promo.status]}`}>{promo.status} →</button>
                    )}
                  </div>
                  {(promo.category || promo.size) && <div className="ui-actions mb-3">{promo.category && <Badge accent="purple">{categoryLabel(promo.category)}</Badge>}{promo.size && <Badge>{promo.size}</Badge>}</div>}
                  {(promo.personName || promo.locationId) && <p className="text-xs text-gray-500 mb-3">{promo.personName ?? ""}{promo.personName && promo.locationId ? " · " : ""}{promo.locationId ? locations.find((site) => site.id === promo.locationId)?.name ?? "Removed location" : ""}</p>}
                  {promo.creatorName && <p className="text-xs text-gray-500 mb-3">Added by {promo.creatorName}</p>}
                  {promo.description && <p className="text-sm text-gray-600 mb-3">{promo.description}</p>}
                  <div className="marketing-campaign__file"><span>{promo.fileName || "No artwork attached yet"}</span><span>{promo.fileSize}</span></div>
                  <div className="flex gap-2 mt-3">
                    <Button onClick={() => viewPromotion(promo)} disabled={!promo.fileName || !!busyId || saving} variant="ghost" className="flex-1"><Download size={16} aria-hidden="true" />Download</Button>
                    {!readOnly && <button onClick={() => deletePromotion(promo.id)} disabled={!!busyId || saving} className="ui-iconbutton ui-iconbutton--danger" aria-label={`Delete ${promo.title}`}><Trash2 size={17} aria-hidden="true" /></button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Upload Modal */}
      {!readOnly && (
        <Modal open={showUpload} title="Add Promotion" description="Plan the campaign now. Artwork is optional." busy={saving} onClose={() => { setShowUpload(false); setError(""); }}>
          <form onSubmit={(event) => { event.preventDefault(); void handleUpload(); }}>
            {error && <div className="ui-notice ui-notice--error" role="alert">{error}</div>}

            <fieldset disabled={saving} className="ui-form-stack">
              <div>
                <label htmlFor="promotion-title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  id="promotion-title"
                  data-modal-autofocus
                  required
                  maxLength={200}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Holiday Special"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                />
              </div>

              <div>
                <label htmlFor="promotion-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="promotion-description"
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the promotion..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
                />
              </div>

              {legacySchema ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This workspace supports basic campaigns. Your administrator can enable location, person, category and size fields.
                </p>
              ) : (
                <>
                  {locationsError && <p className="ui-notice ui-notice--warning">{locationsError}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="promotion-location" className="block text-sm font-medium text-gray-700 mb-1">
                        Select Location
                      </label>
                      <select
                        id="promotion-location"
                        disabled={!!locationsError}
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
                      <label htmlFor="promotion-person" className="block text-sm font-medium text-gray-700 mb-1">
                        Person Name
                      </label>
                      <input
                        id="promotion-person"
                        type="text"
                        maxLength={100}
                        value={personName}
                        onChange={(e) => setPersonName(e.target.value)}
                        placeholder="Who this is for"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="promotion-category" className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        id="promotion-category"
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
                      <label htmlFor="promotion-size" className="block text-sm font-medium text-gray-700 mb-1">
                        Size
                      </label>
                      <select
                        id="promotion-size"
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
                  <label htmlFor="promotion-month" className="block text-sm font-medium text-gray-700 mb-1">
                    Month
                  </label>
                  <select
                    id="promotion-month"
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
                  <label htmlFor="promotion-year" className="block text-sm font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <select
                    id="promotion-year"
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
                <label htmlFor="promotion-file" className="block text-sm font-medium text-gray-700 mb-1">
                  Poster / Design File
                </label>
                <input
                  id="promotion-file"
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.jpg,.jpeg,.png,.psd,.ai,.svg"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-900"
                  aria-describedby={independentWorkspace ? "promotion-file-limit" : undefined}
                />
                {independentWorkspace && <small id="promotion-file-limit">Maximum 3 MB. Artwork is optional.</small>}
              </div>
            </fieldset>

            <div className="ui-modal__actions">
              <Button variant="ghost" disabled={saving} onClick={() => { setShowUpload(false); setError(""); }}>Cancel</Button>
              <Button type="submit" disabled={!title.trim() || saving}>{saving ? "Saving promotion…" : "Save promotion"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Poster size presets */}
      <details className="ui-card marketing-formats">
        <summary>Poster & social sizes <Plus size={17} aria-hidden="true" /></summary>
        <p className="text-sm text-gray-500 mb-4">
          Export designs at these dimensions so print and social always look sharp.
        </p>
        <div className="marketing-formats__grid">
          {posterSizes.map((s) => (
            <div key={s.name} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className={`marketing-format w-10 shrink-0 ${s.ratio} rounded`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.dims}</p>
                </div>
              </div>
              <div className="marketing-format__meta">
                <span>{s.px}</span>
                <span className="px-1.5 py-0.5 bg-gray-100 rounded">{s.cat} · {s.use}</span>
              </div>
            </div>
          ))}
        </div>
      </details>

      {/* Social content calendar */}
      <section className="ui-card marketing-planner" aria-labelledby="social-planner-heading">
        <h2 className="font-semibold text-gray-900 mb-1" id="social-planner-heading">Social content planner</h2>
        <p className="text-sm text-gray-500 mb-4">
          Plan by weekday. Add a publishing date to include a post in your dashboard’s scheduled count.
        </p>

        <div className="marketing-week">
          {dayNames.map((d, i) => (
            <div key={d} className="border border-gray-200 rounded-lg p-2 min-h-[92px]">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{d}</h3>
              <div className="space-y-1.5">
                {loading ? (
                  <div className="h-6 rounded bg-gray-100 animate-pulse" />
                ) : posts
                  .filter((p) => p.day === i)
                  .map((p) => (
                    <div key={p.id} className="marketing-post">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${channelColors[p.channel]}`}>
                        {p.channel}
                      </span>
                      <p>{p.caption}</p>
                      <small>{p.date ? new Date(`${p.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Undated plan"}</small>
                      {!readOnly && (
                        <button
                          onClick={() => removePost(p.id)}
                          disabled={!!busyId || saving}
                          className="ui-iconbutton ui-iconbutton--danger"
                          aria-label={`Remove post: ${p.caption}`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                {!loading && !posts.some((post) => post.day === i) && <p className="marketing-day-empty">No posts planned</p>}
              </div>
            </div>
          ))}
        </div>

        {feedbackArea === "planner" && error && <div className="ui-notice ui-notice--error mt-4" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
        {feedbackArea === "planner" && notice && <div className="ui-notice ui-notice--success mt-4" role="status"><Check size={18} aria-hidden="true" />{notice}</div>}
        {!readOnly && (
          <form onSubmit={(event) => { event.preventDefault(); void addPost(); }}><fieldset disabled={saving || loading || !uploadConnected} className="marketing-post-form" aria-describedby={!uploadConnected ? "marketing-connection" : undefined}>
            <div>
              <label htmlFor="social-day" className="block text-sm font-medium text-gray-600 mb-1">Day</label>
              <select
                id="social-day"
                value={newDay}
                onChange={(e) => { setNewDay(Number(e.target.value)); setNewDate(""); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
              >
                {dayNames.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="social-channel" className="block text-sm font-medium text-gray-600 mb-1">Channel</label>
              <select
                id="social-channel"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as keyof typeof channelColors)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
              >
                {Object.keys(channelColors).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div><label htmlFor="social-date" className="block text-sm font-medium text-gray-600 mb-1">Date (optional)</label><input id="social-date" type="date" className="ui-input" value={newDate} onChange={(event) => { const value = event.target.value; setNewDate(value); if (value) setNewDay((new Date(`${value}T12:00:00`).getDay() + 6) % 7); }} /></div>
            <div className="marketing-post-form__caption">
              <label htmlFor="social-caption" className="block text-sm font-medium text-gray-600 mb-1">Caption</label>
              <input
                id="social-caption"
                required
                maxLength={2000}
                type="text"
                value={newCaption}
                onChange={(e) => setNewCaption(e.target.value)}
                placeholder="What's the post?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
              />
            </div>
            <Button type="submit" disabled={!newCaption.trim() || saving || loading || !uploadConnected}>{saving ? "Saving post…" : "Add post"}</Button>
          </fieldset></form>
        )}
      </section>

    </div>
  );
}
