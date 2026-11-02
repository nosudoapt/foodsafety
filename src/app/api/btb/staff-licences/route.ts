import { btbRoute, BtbApiError, dbError, readAll, readBody, TEAM_COLUMNS } from "@/lib/btb-api";
import { BTB_RESTAURANT, attributionName, isIsoDate, isUuid, isVersion, type TeamMember } from "@/lib/btb-team";
import { STAFF_LICENCE_TYPES, type StaffLicence } from "@/lib/btb-licences";

const COLUMNS = "id,employee_id,staff_name,license_type,file_name,file_size,issue_date,expiry_date,notes,uploaded_by_name,version,created_at";
export const GET = btbRoute("staff_licenses", false, async ({ db }, request) => {
  const download = new URL(request.url).searchParams.get("download");
  if (download) {
    if (!isUuid(download)) throw new BtbApiError("Choose a saved certificate.");
    const result = await db.from("btb_staff_licences").select("file_url,file_name").eq("restaurant_name", BTB_RESTAURANT).eq("id", download).maybeSingle();
    dbError(result.error, "The certificate file could not be loaded.");
    if (!result.data?.file_url) throw new BtbApiError("No file is attached to this certificate.", 404);
    return { url: result.data.file_url, name: result.data.file_name };
  }
  const [licences, employees] = await Promise.all([
    readAll<StaffLicence>((from, to) => db.from("btb_staff_licences").select(COLUMNS).eq("restaurant_name", BTB_RESTAURANT).order("created_at", { ascending: false }).order("id").range(from, to), "Staff certificates could not be loaded."),
    readAll<TeamMember>((from, to) => db.from("btb_employees").select(TEAM_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).order("name").order("id").range(from, to), "The employee list could not be loaded."),
  ]);
  return { licences, employees };
});

export const POST = btbRoute("staff_licenses", true, async ({ db, identity }, request) => {
  const body = await readBody(request, 7_200_000);
  if (!isVersion(body.version) || body.id != null && !isUuid(body.id) || body.employee_id != null && !isUuid(body.employee_id)) throw new BtbApiError("Choose a saved employee or certificate record.");
  if (typeof body.staff_name !== "string" || !body.staff_name.trim() || body.staff_name.length > 100 || !STAFF_LICENCE_TYPES.some((type) => type.value === body.license_type)) throw new BtbApiError("Enter the employee name and certificate type.");
  if (body.issue_date && !isIsoDate(body.issue_date) || body.expiry_date && !isIsoDate(body.expiry_date) || body.issue_date && body.expiry_date && String(body.issue_date) > String(body.expiry_date)) throw new BtbApiError("Check the issue and expiry dates. Expiry must be on or after the issue date.");
  if (typeof body.notes !== "string" || body.notes.length > 2000) throw new BtbApiError("Keep notes under 2,000 characters.");
  let name = body.staff_name.trim();
  if (body.employee_id) {
    const employee = await db.from("btb_employees").select("name").eq("restaurant_name", BTB_RESTAURANT).eq("id", body.employee_id).maybeSingle();
    dbError(employee.error, "The employee could not be verified.");
    if (!employee.data) throw new BtbApiError("This employee no longer exists.", 404);
    name = employee.data.name;
  }
  let file: { file_url: string; file_name: string; file_size: number } | undefined;
  if (body.file != null) {
    const upload = body.file as Record<string, unknown>;
    if (typeof upload.name !== "string" || !upload.name || upload.name.length > 200 || typeof upload.url !== "string" || !/^data:(application\/pdf|image\/(jpeg|png|webp));base64,[A-Za-z0-9+/]+={0,2}$/.test(upload.url)) throw new BtbApiError("Attach a PDF, JPEG, PNG or WebP certificate.");
    const size = Buffer.from(upload.url.split(",")[1], "base64").byteLength;
    if (!size || size > 5 * 1024 * 1024) throw new BtbApiError("Choose a certificate file under 5 MB.", 413);
    file = { file_url: upload.url, file_name: upload.name, file_size: size };
  }
  const payload = { employee_id: body.employee_id ?? null, staff_name: name, license_type: body.license_type, issue_date: body.issue_date || null, expiry_date: body.expiry_date || null, notes: body.notes.trim(), uploaded_by: identity.employeeId, uploaded_by_name: attributionName(identity), version: body.version + 1, ...file };
  const result = body.id
    ? await db.from("btb_staff_licences").update(payload).eq("restaurant_name", BTB_RESTAURANT).eq("id", body.id).eq("version", body.version).select(COLUMNS).maybeSingle()
    : await db.from("btb_staff_licences").insert({ ...payload, restaurant_name: BTB_RESTAURANT, version: 1 }).select(COLUMNS).single();
  dbError(result.error, "The certificate could not be saved. Your form is still here.");
  if (!result.data) throw new BtbApiError("This certificate changed. Reload the register before saving.", 409);
  return { licence: result.data };
});

export const DELETE = btbRoute("staff_licenses", true, async ({ db }, request) => {
  const body = await readBody(request);
  if (!isUuid(body.id) || !isVersion(body.version)) throw new BtbApiError("Choose a saved certificate.");
  const result = await db.from("btb_staff_licences").delete().eq("restaurant_name", BTB_RESTAURANT).eq("id", body.id).eq("version", body.version).select("id");
  dbError(result.error, "The certificate could not be removed.");
  if (result.data?.length !== 1) throw new BtbApiError("This certificate changed. Reload before removing it.", 409);
  return { ok: true };
});
