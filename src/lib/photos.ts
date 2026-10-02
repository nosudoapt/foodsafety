// Photo helpers for the shared-tablet screens. Photos are compressed on-device
// (iPad uplinks; ~5 MB of raw camera shots per cleaning card) before upload to
// the `ops-photos` Storage bucket — the *_photo TEXT columns in Postgres only
// ever hold object paths, never the bytes. Storage is demo-grade public, matching
// the public RLS on cleaning_logs (shared tablets). NOT production access control.

import { supabase } from "@/lib/supabase";

export const PHOTO_BUCKET = "ops-photos";

const MAX_EDGE = 1280; // long edge px — plenty to see a clean/dirty difference
const TARGET_BYTES = 150_000; // ~150 KB per angle after JPEG re-encode

function decodeImage(file: File): Promise<HTMLImageElement> {
  // <img> decode applies EXIF orientation by default, so canvas output isn't
  // rotated on iPad camera shots.
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image."))),
      "image/jpeg",
      quality,
    );
  });
}

/** Resize to ≤1280px long edge and re-encode as JPEG (~150 KB). */
export async function compressImage(file: File): Promise<Blob> {
  const img = await decodeImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable in this browser.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.65;
  let blob = await toBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > 0.3) {
    quality = Math.max(0.3, quality - 0.15);
    blob = await toBlob(canvas, quality);
  }
  return blob;
}

/** Upload a compressed photo; resolves to the object path to persist in the row. */
export async function uploadToSupabase(path: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** Object path (or legacy data URL) → displayable URL. */
export function photoSrc(path: string): string {
  if (/^(data:|blob:|https?:)/.test(path)) return path;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Best-effort removal of stored objects (legacy data URLs are skipped). */
export async function removePhotos(paths: string[]): Promise<void> {
  const remote = paths.filter((p) => !p.startsWith("data:") && !p.startsWith("blob:"));
  if (!remote.length) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(remote);
  if (error) throw new Error(error.message);
}

/** Parse a *_photo column: JSON array of paths, or a single legacy value. */
export function parsePhotoList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === "string");
    } catch {
      /* fall through to the single-value case */
    }
  }
  return [raw];
}
