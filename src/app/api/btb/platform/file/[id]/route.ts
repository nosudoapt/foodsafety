import { BtbApiError, PRIVATE_HEADERS } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

interface PrivateFile {
  name: string;
  mime: string;
  byte_size: number;
  sha256: string;
  content_base64: string;
}

// Authorized binary download of one private file. The SQL function decides who
// may read the bytes (owner, marketing participant, management tier, compliance
// holder); this route only streams the authorised result and never caches it.
export const GET = platformRoute(["GET"], async ({ db, employeeId, sessionVersion }, request) => {
  const { id } = await paramsOf(request);
  if (!isUuid(id)) throw new BtbApiError("Choose a saved file.", 404);
  const file = await platformRpc<PrivateFile>(db, "btb_platform_file_get", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_file: id,
  }, "This file could not be opened.");
  const bytes = Buffer.from(file.content_base64, "base64");
  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = file.name.replace(/["\\\r\n]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      ...PRIVATE_HEADERS,
    },
  });
});

/** The file id is the last path segment; Next's own route context is not needed. */
async function paramsOf(request: Request): Promise<{ id: string }> {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return { id: decodeURIComponent(segments.at(-1) ?? "") };
}
