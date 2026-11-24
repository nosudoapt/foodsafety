import { cookies } from "next/headers";
import { btbRoute, BtbApiError, btbEmployeeIsLocationManaged, dbError, EMPLOYEE_COLUMNS, readAll, readBody, type BtbApiContext } from "@/lib/btb-api";
import { BTB_RESTAURANT, employeeEditableBy, isUuid, isVersion, validateEmployee, type BtbEmployee } from "@/lib/btb-team";
import { BTB_ACCOUNTS } from "@/lib/btb-auth";
import { hashEmployeePassword, validEmployeePassword } from "@/lib/btb-passwords";

/** The branch chosen on the sign-in cards (or the person's first active one).
 *  Corporate/owner and the shared demo keep the restaurant-wide view. */
async function activeLocation(context: BtbApiContext): Promise<string | null> {
  const { identity, access } = context;
  if (!identity.employeeId || ["corporate", "owner"].includes(identity.role)) return null;
  const slug = (await cookies()).get("btb_slug")?.value;
  const site = access.locations.find((item) => item.slug === slug) ?? access.locations.find((item) => item.active);
  return site?.id ?? null;
}

export const GET = btbRoute("employees", false, async (context) => {
  const { db } = context;
  const locationId = await activeLocation(context);
  if (!locationId) return {
    employees: await readAll<BtbEmployee>((from, to) => db.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).order("name").order("id").range(from, to), "Employee records could not be loaded. Apply the BTB team schema if it has not been installed."),
  };
  const memberships = await db.from("btb_location_access").select("employee_id").eq("location_id", locationId);
  dbError(memberships.error, "This branch’s team could not be loaded. Please retry.");
  const ids = (memberships.data ?? []).map((row) => row.employee_id as string);
  if (!ids.length) return { employees: [] };
  return {
    employees: await readAll<BtbEmployee>((from, to) => db.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).in("id", ids).order("name").order("id").range(from, to), "Employee records could not be loaded. Apply the BTB team schema if it has not been installed."),
  };
}, { allowLocationWorkspace: true });

export const POST = btbRoute("employees", true, async (context, request) => {
  const { db, identity } = context;
  const locationId = await activeLocation(context);
  const body = await readBody(request);
  const error = validateEmployee(body);
  if (error) throw new BtbApiError(error);
  if (!isVersion(body.version) || (body.id != null && !isUuid(body.id))) throw new BtbApiError("Reload this employee record before saving.");
  const role = body.role as BtbEmployee["role"];
  if (!employeeEditableBy(identity.role, role, identity.console === true)) throw new BtbApiError("Supervisors can manage staff accounts. A manager manages supervisor and manager accounts.", 403);
  let existing: BtbEmployee | null = null;
  if (body.id) {
    const result = await db.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).eq("id", body.id).maybeSingle();
    dbError(result.error, "The employee record could not be verified.");
    existing = result.data as BtbEmployee | null;
    if (!existing) throw new BtbApiError("This employee could not be found.", 404);
    if (locationId) {
      const membership = await db.from("btb_location_access").select("employee_id")
        .eq("location_id", locationId).eq("employee_id", existing.id).maybeSingle();
      dbError(membership.error, "This employee’s branch could not be verified.");
      if (!membership.data) throw new BtbApiError("This employee belongs to another branch.", 403);
    }
    if (!employeeEditableBy(identity.role, existing.role)) throw new BtbApiError("A manager manages this employee account.", 403);
    // An unassigned legacy manager must not be able to touch a person who is
    // governed by the location platform (reset their password, change their
    // role or deactivate them). Corporate/owner retain organization-wide reach.
    // A branch manager who has just proved this person belongs to their branch
    // may edit them here. The legacy guard remains for unassigned managers so
    // they cannot reach into a location-governed account.
    if (!locationId && !["corporate", "owner"].includes(identity.role) && await btbEmployeeIsLocationManaged(db, existing.id)) {
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
  // A person created/edited from this branch must belong to this branch.
  if (locationId) {
    const membership = await db.from("btb_location_access")
      .upsert({ location_id: locationId, employee_id: employee.id }, { onConflict: "location_id,employee_id" });
    dbError(membership.error, "The employee was saved, but their branch membership could not be recorded. Retry the save.");
  }
  return { employee };
}, { allowLocationWorkspace: true });
