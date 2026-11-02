// Shared upload limits and connection feedback; safe to import in the browser.
// Base64 expands a 3 MiB file to 4 MiB, leaving room for JSON/metadata within
// Vercel's function request limit.
export const BTB_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
export const BTB_UPLOAD_BODY_BYTES = 4_300_000;

export interface BtbUploaderConnection {
  connected: boolean;
  message: string | null;
}
