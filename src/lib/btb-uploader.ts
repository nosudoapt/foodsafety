import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError, dbError } from "./btb-api";
import { BTB_RESTAURANT, attributionName, isUuid, type BtbIdentity } from "./btb-team";
import { BTB_UPLOAD_MAX_BYTES, type BtbUploaderConnection } from "./btb-uploads";

/** Resolve a real profiles FK using server configuration, never a browser session. */
export async function requireBtbUploader(db: SupabaseClient): Promise<string> {
  const id = process.env.BTB_UPLOADER_PROFILE_ID?.trim();
  if (!isUuid(id)) throw new BtbApiError("Uploads need a connected BTB uploader profile. Ask your administrator to finish the uploader setup, then retry.", 503);
  const profile = await db.from("profiles").select("id").eq("id", id).eq("restaurant_name", BTB_RESTAURANT).maybeSingle();
  dbError(profile.error, "The BTB uploader connection could not be checked. Please retry.");
  if (!profile.data) throw new BtbApiError("The configured BTB uploader profile is unavailable. Ask your administrator to reconnect it, then retry.", 503);
  return profile.data.id;
}

export async function btbUploaderConnection(db: SupabaseClient): Promise<BtbUploaderConnection> {
  try {
    await requireBtbUploader(db);
    return { connected: true, message: null };
  } catch (error) {
    return { connected: false, message: error instanceof BtbApiError ? error.message : "The BTB uploader connection could not be checked. Please retry." };
  }
}

export function btbUploadCreator(identity: BtbIdentity) {
  return { btb_created_by: identity.employeeId, btb_created_by_name: attributionName(identity) };
}

const MIME_TYPES: Record<string, readonly string[]> = {
  pdf: ["application/pdf"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"],
  doc: ["application/msword"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  psd: ["image/vnd.adobe.photoshop", "application/x-photoshop"],
  ai: ["application/postscript", "application/pdf", "application/illustrator"], svg: ["image/svg+xml"],
};

export function parseBtbUpload(value: unknown, kind: "document" | "artwork") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BtbApiError("Choose a file to upload.");
  const file = value as Record<string, unknown>;
  if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 200 || /[\x00-\x1f/\\]/.test(file.name)) throw new BtbApiError("Use a file name under 200 characters, without folder separators.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = kind === "document" ? ["pdf", "jpg", "jpeg", "png", "doc", "docx"] : ["pdf", "jpg", "jpeg", "png", "psd", "ai", "svg"];
  if (!allowed.includes(extension)) throw new BtbApiError(kind === "document" ? "Attach a PDF, JPEG, PNG or Word document." : "Attach PDF, JPEG, PNG, PSD, AI or SVG artwork.");
  if (typeof file.url !== "string") throw new BtbApiError("The file could not be read. Choose it again and retry.");
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(file.url);
  if (!match || ![...MIME_TYPES[extension], "application/octet-stream"].includes(match[1])) throw new BtbApiError("The file format does not match its name. Choose the original file and retry.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength > BTB_UPLOAD_MAX_BYTES) throw new BtbApiError("Choose a file no larger than 3 MB.", 413);
  if (!bytes.byteLength || bytes.toString("base64") !== match[2]) throw new BtbApiError("The file is empty or incomplete. Choose it again and retry.");
  return { file_name: file.name.trim(), file_url: file.url, file_size: bytes.byteLength };
}

export function uploadText(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || required && !value.trim()) throw new BtbApiError(`Enter ${label} (${required ? "1–" : "up to "}${max.toLocaleString("en-US")} characters).`);
  return value.trim();
}
