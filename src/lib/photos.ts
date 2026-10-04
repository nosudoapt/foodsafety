// Photo helpers for the shared-tablet screens. Photos are compressed on-device
// (iPad uplinks; ~5 MB of raw camera shots per cleaning card) before upload to
// the `ops-photos` Storage bucket — the *_photo TEXT columns in Postgres only
// ever hold object paths, never the bytes. Storage is demo-grade public, matching
// the public RLS on cleaning_logs (shared tablets). NOT production access control.
//
// compressImage / uploadToSupabase now live in src/lib/files.ts (shared with
// every other upload screen); they're re-exported here so existing callers
// keep working.

import { supabase } from "@/lib/supabase";
import { STORAGE_BUCKETS } from "@/lib/files";

export { compressImage, uploadToSupabase } from "@/lib/files";

export const PHOTO_BUCKET = STORAGE_BUCKETS.ops;

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
