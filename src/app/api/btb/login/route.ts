import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { clientIp } from "@/lib/btb-clock-policy";
import { firstAttemptRow, lockoutMessage } from "@/lib/btb-login-guard";
import { btbDemoSlug } from "@/lib/btb-demo";
import { inventoryDb } from "@/lib/supabase-server";
import { BTB_RESTAURANT, isEmail, type BtbEmployee } from "@/lib/btb-team";
import { verifyEmployeePassword } from "@/lib/btb-passwords";
import { apiFailure, BtbApiError, dbError, EMPLOYEE_COLUMNS, PRIVATE_HEADERS, readBody, requireBtbOrigin } from "@/lib/btb-api";
import {
  BTB_ACCOUNTS,
  BTB_COOKIE,
  BTB_COOKIE_MAX_AGE,
  BTB_EMPLOYEE_MAX_AGE,
  BtbConfigurationError,
  accountForCredentials,
  employeeSessionValueFor,
  sessionValueFor,
  sharedWorkspaceLoginEnabled,
} from "@/lib/btb-auth";

// BTB sign-in: { email, password } against an individual employee's credential
// hash. Shared role accounts are rejected unless an operator explicitly turns
// them on for local QA (BTB_SHARED_LOGIN=1); the live team sign-in is
// employee-only. This flow is independent of Supabase Auth.
export async function POST(request: NextRequest) {
  let email = "";
  let password = "";
  let locationSlug = "";
  try {
    requireBtbOrigin(request, "Sign in from the BTB workspace.");
    const body = await readBody(request, 4096);
    email = String(body?.email ?? body?.username ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
    locationSlug = String(body?.locationSlug ?? "").trim().toLowerCase();
  } catch (error) {
    return apiFailure(error);
  }

  try {
    if (!isEmail(email) || !password || password.length > 128) throw new BtbApiError("Invalid email or password", 401);
    let value: string;
    let role: string;
    let name: string;
    let slug = "";
    let maxAge = BTB_COOKIE_MAX_AGE;
    if (BTB_ACCOUNTS.some((item) => item.email === email)) {
      // Live sign-in is individual-only. The shared store-tablet accounts are
      // an opt-in QA convenience, never a production credential.
      if (!sharedWorkspaceLoginEnabled()) {
        throw new BtbApiError("Shared workspace accounts can’t sign in here. Use the individual employee email and password your restaurant manager set up.", 403);
      }
      const account = accountForCredentials(email, password);
      if (!account) throw new BtbApiError("Invalid email or password", 401);
      value = sessionValueFor(account.role);
      role = account.role;
      name = account.name;
      // Test/local shared accounts live behind the hidden demo door.
      slug = btbDemoSlug() ?? "";
    } else {
      const db = inventoryDb();
      const ip = clientIp(request);
      const emailKey = createHash("sha256").update(email).digest("hex");
      // Per-IP throttle runs before the password check: it is what stops one
      // client spraying many emails. A real person on a different IP is never
      // caught by someone else's failures.
      const ipCheck = await db.rpc("btb_auth_check_ip", { p_scope: "employee", p_ip: ip });
      dbError(ipCheck.error, "Employee sign-in is not ready. Apply the BTB team schema and try again.");
      const ipRow = firstAttemptRow(ipCheck.data);
      if (ipRow.blocked) {
        await db.from("btb_login_events").insert({ scope: "employee", email, email_hash: emailKey, ip, outcome: "ip_blocked" });
        throw new BtbApiError(lockoutMessage(ipRow.retry_after), 429);
      }
      const member = await db.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).eq("email", email).maybeSingle();
      dbError(member.error, "Employee sign-in is temporarily unavailable.");
      const employee = member.data as BtbEmployee | null;
      const credentials = employee ? await db.from("btb_employee_credentials").select("password_hash,session_version").eq("employee_id", employee.id).maybeSingle() : { data: null, error: null };
      dbError(credentials.error, "Employee sign-in is temporarily unavailable.");
      const valid = await verifyEmployeePassword(password, credentials.data?.password_hash ?? null);
      if (!valid || !employee?.active || !employee.login_enabled || !credentials.data) {
        // Only a refused password is counted, so ordinary sign-ins can never
        // lock the account out. A correct password always clears the counter.
        const failure = await db.rpc("btb_auth_note_failure", {
          p_scope: "employee", p_key: emailKey, p_ip: ip, p_email: email,
          p_outcome: !employee ? "no_account" : !employee.active || !employee.login_enabled || !credentials.data ? "disabled" : "bad_password",
        });
        dbError(failure.error, "Employee sign-in is temporarily unavailable.");
        const row = firstAttemptRow(failure.data);
        if (row.blocked) throw new BtbApiError(lockoutMessage(row.retry_after), 429);
        throw new BtbApiError("Invalid email or password", 401);
      }
      const cleared = await db.rpc("btb_auth_note_success", { p_scope: "employee", p_key: emailKey, p_ip: ip, p_email: email });
      dbError(cleared.error, "Employee sign-in is temporarily unavailable.");
      value = employeeSessionValueFor({ id: employee.id, role: employee.role, version: credentials.data.session_version });
      role = employee.role;
      name = employee.name;
      maxAge = BTB_EMPLOYEE_MAX_AGE;
      // Send the person to their own location URL. Only active assignments
      // count; the proxy still resolves the real slug on every request.
      try {
        const access = await db.from("btb_location_access").select("location_id").eq("employee_id", employee.id);
        const ids = (access.data ?? []).map((row) => row.location_id as string);
        if (ids.length) {
          const [settings, names] = await Promise.all([
            db.from("btb_location_settings").select("location_id").in("location_id", ids).eq("active", true),
            db.from("locations").select("id,name,slug").in("id", ids).order("name"),
          ]);
          const active = new Set((settings.data ?? []).map((row) => row.location_id as string));
          const allowed = (names.data ?? []).filter((row) => active.has(row.id as string) && row.slug);
          if (locationSlug) {
            if (!allowed.some((row) => row.slug === locationSlug)) {
              throw new BtbApiError("Your account is not assigned to that location.", 403);
            }
            slug = locationSlug;
          } else {
            slug = (allowed[0]?.slug as string) ?? "";
          }
        } else if (locationSlug) {
          throw new BtbApiError("Your account is not assigned to that location.", 403);
        }
      } catch (error) {
        if (error instanceof BtbApiError) throw error;
        slug = "";
      }
    }
    const response = NextResponse.json({ ok: true, role, name, slug }, { headers: PRIVATE_HEADERS });
    response.cookies.set(BTB_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
    if (slug) response.cookies.set("btb_slug", slug, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
    return response;
  } catch (error) {
    if (error instanceof BtbConfigurationError) {
      return NextResponse.json({ error: "The BTB backend connection is unavailable. Please try again." }, { status: 503, headers: PRIVATE_HEADERS });
    }
    return apiFailure(error);
  }
}
