import { createHash, randomUUID } from "node:crypto";
import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import {
  PLATFORM_FILE_BODY_BYTES,
  PLATFORM_FILE_MAX_BYTES,
  PLATFORM_FILE_MIME,
  isPlatformFilePurpose,
} from "@/lib/btb-platform";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

/** Magic-byte prefixes: a declared MIME type must match the real file header. */
const MAGIC: Record<string, readonly (readonly number[])[]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
};
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Store one private file (reference brief, artwork, task evidence, purchase
 * or sales source, compliance certificate, report). The payload never enters an
 * API response: only metadata comes back to the browser.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, PLATFORM_FILE_BODY_BYTES);
  const location = body.location_id;
  if (!isUuid(location)) throw new BtbApiError("Choose a location.");
  if (!isPlatformFilePurpose(body.purpose)) throw new BtbApiError("Choose what this file is for.");
  const purpose = body.purpose;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200 || /[\x00-\x1f/\\]/.test(name)) throw new BtbApiError("Use a file name under 200 characters, without folder separators.");
  if (typeof body.mime !== "string" || !(PLATFORM_FILE_MIME as readonly string[]).includes(body.mime)) throw new BtbApiError("Attach a PDF, JPEG, PNG or CSV file.");
  const mime = body.mime;
  if (typeof body.content_base64 !== "string" || !body.content_base64 || !BASE64.test(body.content_base64)) throw new BtbApiError("The file could not be read. Choose it again and retry.");
  const bytes = Buffer.from(body.content_base64, "base64");
  if (!bytes.byteLength) throw new BtbApiError("The file is empty. Choose it again and retry.");
  if (bytes.byteLength > PLATFORM_FILE_MAX_BYTES) throw new BtbApiError("Choose a file no larger than 3 MB.", 413);
  if (bytes.toString("base64") !== body.content_base64) throw new BtbApiError("The file is incomplete. Choose it again and retry.");
  const magic = MAGIC[mime];
  if (magic && !magic.some((prefix) => prefix.every((byte, index) => bytes[index] === byte))) {
    throw new BtbApiError("The file contents do not match its format. Choose the original file and retry.");
  }
  const id = randomUUID();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const saved = await platformRpc(db, "btb_platform_file_put", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location,
    p_data: { id, purpose, name, mime, byte_size: bytes.byteLength, sha256, content_base64: body.content_base64 },
  }, "This file could not be saved.");
  return { file: saved };
});
