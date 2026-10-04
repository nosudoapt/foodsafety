// Shared file helpers. Previously each admin upload screen carried its own
// copy of formatFileSize; data-URL encoding matches the pattern already used
// by the BTB cleaning schedule (src/app/between-the-buns/cleaning-schedule).

// Media Storage buckets (supabase/schema-storage-buckets.sql). Cleaning and
// inspection photos still live in the original ops-photos bucket so existing
// object paths keep resolving; the three below are for new uploads.
export const STORAGE_BUCKETS = {
  ops: "ops-photos",
  cleaning: "cleaning-photos",
  inspection: "inspection-photos",
  trainingVideos: "training-videos",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

const MAX_EDGE = 1280; // long edge px — generous for a tablet screen
const TARGET_BYTES = 150_000; // ~150 KB after JPEG re-encode (<150 KB target)

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

/**
 * Upload a compressed photo; resolves to the object path to persist in the row.
 * The Supabase client is imported lazily: this module is compiled into the
 * node:test suite (tests/files.test.ts) and constructing the browser client at
 * import time there would throw.
 */
export async function uploadToSupabase(
  path: string,
  blob: Blob,
  bucket: StorageBucket = STORAGE_BUCKETS.ops,
): Promise<string> {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/** Read a File into a data URL for storage in a *_url TEXT column. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Trigger a browser download. The download attribute applies to data: URLs;
 * for remote URLs the browser falls back to opening them.
 */
export function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Hand a stored (data-URL) PDF to the browser's print dialog — the Print
 * button on each manual (Patch 7). The file renders into a hidden iframe and
 * prints once loaded; the frame outlives the call so the job isn't cancelled
 * the moment the dialog opens.
 */
export function printDataUrl(url: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  };
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60_000);
}
