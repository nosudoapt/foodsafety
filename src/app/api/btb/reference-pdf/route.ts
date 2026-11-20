import { btbRoute, BtbApiError, dbError, readBody, requireBtbAccess } from "@/lib/btb-api";
import { BTB_REFERENCE_SLOTS, type BtbReferenceSlot } from "@/lib/btb-reference-slots";
import { BTB_RESTAURANT } from "@/lib/btb-team";
import { parseBtbUpload, requireBtbUploader } from "@/lib/btb-uploader";
import { BTB_UPLOAD_BODY_BYTES } from "@/lib/btb-uploads";

function referenceSlot(value: unknown) {
  if (typeof value !== "string" || !Object.hasOwn(BTB_REFERENCE_SLOTS, value)) throw new BtbApiError("Choose a reference PDF.");
  return BTB_REFERENCE_SLOTS[value as BtbReferenceSlot];
}

export const GET = btbRoute(undefined, false, async (_, request) => {
  const slot = referenceSlot(new URL(request.url).searchParams.get("slot"));
  const { db } = await requireBtbAccess(slot.page === "loyalty-rewards" ? "loyalty_rewards" : "reference", false, { page: slot.page, allowLocationWorkspace: true });
  const result = await db.from("print_manuals").select("id,title,file_name,file_size,file_url")
    .eq("restaurant_name", BTB_RESTAURANT).eq("title", slot.title).eq("category", slot.category)
    .order("created_at", { ascending: false }).order("id").limit(1);
  dbError(result.error, "This reference PDF could not be loaded. Please retry.");
  return { manual: result.data?.[0] ?? null };
}, { allowLocationWorkspace: true });

export const POST = btbRoute(undefined, false, async (_, request) => {
  const body = await readBody(request, BTB_UPLOAD_BODY_BYTES);
  const slot = referenceSlot(body.slot);
  await requireBtbAccess(slot.page === "loyalty-rewards" ? "loyalty_rewards" : "reference", false, { page: slot.page, allowLocationWorkspace: true });
  // Reference readers cannot upload. The existing manuals editing tier and its
  // own page grant are both required, even for an upload from a reference page.
  const { db } = await requireBtbAccess("manuals", true, { allowLocationWorkspace: true });
  const file = parseBtbUpload(body.file, "document");
  if (!file.file_name.toLowerCase().endsWith(".pdf")) throw new BtbApiError("Choose a PDF file.");
  const result = await db.from("print_manuals").insert({ user_id: await requireBtbUploader(db), restaurant_name: BTB_RESTAURANT,
    title: slot.title, category: slot.category, description: "", ...file }).select("id,title,file_name,file_size,file_url").single();
  dbError(result.error, "The reference PDF could not be uploaded. Please retry.");
  return { manual: result.data };
}, { allowLocationWorkspace: true });
