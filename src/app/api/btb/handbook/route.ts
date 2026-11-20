import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { BTB_RESTAURANT, isUuid } from "@/lib/btb-team";
import { uploadText } from "@/lib/btb-uploader";

export const GET = btbRoute("handbook", false, async ({ db }) => {
  const result = await db.from("handbook_documents").select("id,title,version,body").eq("restaurant_name", BTB_RESTAURANT)
    .order("created_at", { ascending: false }).order("id").limit(1);
  dbError(result.error, "The handbook could not be loaded. Please retry.");
  const book = result.data?.[0] ?? null;
  if (!book) return { book: null, signatures: [] };
  const signatures = await db.from("handbook_signatures").select("id,staff_name,signature,signed_at").eq("handbook_id", book.id).order("signed_at", { ascending: false });
  dbError(signatures.error, "Acknowledgements could not be loaded. Please retry.");
  return { book, signatures: signatures.data ?? [] };
}, { allowLocationWorkspace: true });

// Acknowledgement is a reader action, not permission to edit documents or other
// people's signatures. There is no general-purpose public signature write token.
export const POST = btbRoute("handbook", false, async ({ db, identity }, request) => {
  const body = await readBody(request, 4096);
  if (!isUuid(body.handbook_id)) throw new BtbApiError("A saved handbook is required before signing.");
  const name = uploadText(body.staff_name, "your full name", 100, true);
  const signature = uploadText(body.signature, "your signature", 100, true);
  if (name.toLowerCase() !== signature.toLowerCase() || identity.employeeId && name.toLowerCase() !== identity.name.toLowerCase()) throw new BtbApiError("Type your own full name in both fields to acknowledge.");
  const book = await db.from("handbook_documents").select("id").eq("restaurant_name", BTB_RESTAURANT).eq("id", body.handbook_id).maybeSingle();
  dbError(book.error, "The handbook could not be verified. Please retry.");
  if (!book.data) throw new BtbApiError("This handbook is no longer available. Reload before signing.", 404);
  const saved = await db.from("handbook_signatures").insert({ handbook_id: book.data.id, staff_name: name, signature }).select("id,staff_name,signature,signed_at").single();
  dbError(saved.error, "Your acknowledgement was not saved. Please retry.");
  return { signature: saved.data };
}, { allowLocationWorkspace: true });
