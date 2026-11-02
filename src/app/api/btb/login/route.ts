import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
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
} from "@/lib/btb-auth";

// BTB sign-in: { email, password } against a shared workspace or an individual
// employee's credential hash. This flow is independent of Supabase Auth.
export async function POST(request: NextRequest) {
  let email = "";
  let password = "";
  try {
    requireBtbOrigin(request, "Sign in from the BTB workspace.");
    const body = await readBody(request, 4096);
    email = String(body?.email ?? body?.username ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
  } catch (error) {
    return apiFailure(error);
  }

  try {
    if (!isEmail(email) || !password || password.length > 128) throw new BtbApiError("Invalid email or password", 401);
    let value: string;
    let role: string;
    let name: string;
    let maxAge = BTB_COOKIE_MAX_AGE;
    if (BTB_ACCOUNTS.some((item) => item.email === email)) {
      const account = accountForCredentials(email, password);
      if (!account) throw new BtbApiError("Invalid email or password", 401);
      value = sessionValueFor(account.role);
      role = account.role;
      name = account.name;
    } else {
      const db = inventoryDb();
      const limit = await db.rpc("btb_consume_login_attempt", { p_key: createHash("sha256").update(email).digest("hex") });
      dbError(limit.error, "Employee sign-in is not ready. Apply the BTB team schema and try again.");
      if (limit.data !== true) throw new BtbApiError("Too many sign-in attempts. Wait 15 minutes and try again.", 429);
      const member = await db.from("btb_employees").select(EMPLOYEE_COLUMNS).eq("restaurant_name", BTB_RESTAURANT).eq("email", email).maybeSingle();
      dbError(member.error, "Employee sign-in is temporarily unavailable.");
      const employee = member.data as BtbEmployee | null;
      const credentials = employee ? await db.from("btb_employee_credentials").select("password_hash,session_version").eq("employee_id", employee.id).maybeSingle() : { data: null, error: null };
      dbError(credentials.error, "Employee sign-in is temporarily unavailable.");
      const valid = await verifyEmployeePassword(password, credentials.data?.password_hash ?? null);
      if (!valid || !employee?.active || !employee.login_enabled || !credentials.data) throw new BtbApiError("Invalid email or password", 401);
      value = employeeSessionValueFor({ id: employee.id, role: employee.role, version: credentials.data.session_version });
      role = employee.role;
      name = employee.name;
      maxAge = BTB_EMPLOYEE_MAX_AGE;
    }
    const response = NextResponse.json({ ok: true, role, name }, { headers: PRIVATE_HEADERS });
    response.cookies.set(BTB_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
    return response;
  } catch (error) {
    if (error instanceof BtbConfigurationError) {
      return NextResponse.json({ error: "BTB login is not configured" }, { status: 503 });
    }
    return apiFailure(error);
  }
}
