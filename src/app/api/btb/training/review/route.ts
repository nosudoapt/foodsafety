import { btbRoute, BtbApiError, dbError, readBody } from "@/lib/btb-api";
import { attributionName, isUuid, isVersion } from "@/lib/btb-team";

export const POST = btbRoute("training_guide", true, async ({ db, identity }, request) => {
  if (identity.role !== "manager") throw new BtbApiError("A manager must approve training.", 403);
  const body = await readBody(request);
  if (!isUuid(body.id) || !isVersion(body.version) || !["approved", "changes_requested"].includes(String(body.decision)) || typeof body.notes !== "string" || body.notes.length > 2000) throw new BtbApiError("Choose a review decision and keep feedback under 2,000 characters.");
  if (body.decision === "changes_requested" && !body.notes.trim()) throw new BtbApiError("Tell the employee what they need to revisit.");
  const current = await db.from("btb_training_records").select("employee_id").eq("id", body.id).maybeSingle();
  dbError(current.error, "This training submission could not be verified.");
  if (!current.data) throw new BtbApiError("This training submission could not be found.", 404);
  if (current.data.employee_id === identity.employeeId) throw new BtbApiError("Another manager must review your training.", 403);
  const result = await db.rpc("btb_review_training", { p_id: body.id, p_version: body.version, p_decision: body.decision, p_notes: body.notes.trim(), p_reviewer: identity.employeeId, p_actor: attributionName(identity) });
  dbError(result.error, "The review could not be saved. Your feedback is still here.");
  if (!result.data?.[0]) throw new BtbApiError("The review save was not confirmed.", 503);
  return { record: result.data[0] };
});
