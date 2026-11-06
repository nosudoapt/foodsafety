import { btbRoute, BtbApiError, btbEmployeeIsLocationManaged, dbError, EMPLOYEE_COLUMNS, readAll, readBody } from "@/lib/btb-api";
import { BTB_RESTAURANT, employeeEditableBy, isUuid, isVersion, validateEmployee, type BtbEmployee } from "@/lib/btb-team";
import { BTB_ACCOUNTS } from "@/lib/btb-auth";
import { hashEmployeePassword, validEmployeePassword } from "@/lib/btb-passwords";

export const GET = btbRoute("employees", false, async ({ db }) => ({
  employees: await readAll<BtbEmployee>((from, to) => db.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).order("name").order("id").range(from, to), "Employee records could not be loaded. Apply the BTB team schema if it has not been installed."),
}));

export const POST = btbRoute("employees", true, async ({ db, identity }, request) => {
  const body = await readBody(request);
  const error = validateEmployee(body);
  if (error) throw new BtbApiError(error);
  if (!isVersion(body.version) || (body.id != null && !isUuid(body.id))) throw new BtbApiError("Reload this employee record before saving.");
  const role = body.role as BtbEmployee["role"];
  if (!employeeEditableBy(identity.role, role)) throw new BtbApiError("Supervisors can manage staff accounts. A manager manages supervisor and manager accounts.", 403);
  let existing: BtbEmployee | null = null;
  if (body.id) {
    const result = await db.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).eq("id", body.id).maybeSingle();
    dbError(result.error, "The employee record could not be verified.");
    existing = result.data as BtbEmployee | null;
    if (!existing) throw new BtbApiError("This employee could not be found.", 404);
    if (!employeeEditableBy(identity.role, existing.role)) throw new BtbApiError("A manager manages this employee account.", 403);
    // An unassigned legacy manager must not be able to touch a person who is
    // governed by the location platform (reset their password, change their
    // role or deactivate them). Corporate/owner retain organization-wide reach.
    if (!["corporate", "owner"].includes(identity.role) && await btbEmployeeIsLocationManaged(db, existing.id)) {
      throw new BtbApiError("This employee belongs to the location platform. Ask their location manager or corporate to update the account.", 403);
    }
    if (existing.id === identity.employeeId && (body.active !== true || role !== existing.role)) throw new BtbApiError("Ask another manager to change your own access.");
  }
  const email = String(body.email).trim().toLowerCase();
  if (BTB_ACCOUNTS.some((account) => account.email === email)) throw new BtbApiError("Use the employee’s individual email, rather than a shared workspace address.");
  const password = body.password;
  if ((!existing?.login_enabled || password) && !validEmployeePassword(password)) throw new BtbApiError("Set an initial password of 10–128 characters.");
  const passwordHash = validEmployeePassword(password) ? await hashEmployeePassword(password) : null;
  const result = await db.rpc("btb_save_employee", {
    p_id: body.id ?? null, p_version: body.version,
    p_name: String(body.name).trim(), p_email: email, p_phone: String(body.phone).trim(),
    p_position: String(body.position).trim(), p_role: role, p_active: body.active, p_password_hash: passwordHash,
  });
  dbError(result.error, "The employee could not be saved. Your form is still here; please retry.");
  const employee = result.data?.[0] as BtbEmployee | undefined;
  if (!employee?.id) throw new BtbApiError("The employee save was not confirmed. Please reload before retrying.", 503);
  return { employee };
});
