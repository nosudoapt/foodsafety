// Uses the existing service-role key; no Supabase CLI or DB password is needed.
import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const restaurant = "Between the Buns";
const email = "btb-uploader@foodsafe.invalid";

async function main() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Configure the Supabase URL and SUPABASE_SERVICE_ROLE_KEY first.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // An unrelated malformed legacy auth row can break listUsers(). Look up only
  // this dedicated profile, then verify its Auth marker before reusing it.
  const existing = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing.error) throw new Error("The dedicated uploader profile could not be located. Check database access.");
  let user = null;
  if (existing.data) {
    const result = await db.auth.admin.getUserById(existing.data.id);
    if (result.error || !result.data.user) throw new Error("The dedicated Auth identity could not be verified. Check Supabase Auth logs.");
    user = result.data.user;
    if (user.email !== email || user.app_metadata?.btb_uploader !== true) throw new Error("An existing uploader/email needs manual review. No existing account was changed.");
  }
  const configured = process.env.BTB_UPLOADER_PROFILE_ID?.trim();
  if (configured && configured !== user?.id) throw new Error("BTB_UPLOADER_PROFILE_ID already selects another account. Review it before provisioning.");
  if (!user) {
    const result = await db.auth.admin.createUser({
      email, password: randomBytes(48).toString("base64url"), email_confirm: true,
      ban_duration: "876000h", app_metadata: { btb_uploader: true },
      user_metadata: { full_name: "BTB workspace uploader", restaurant_name: restaurant, role: "staff" },
    });
    if (result.error || !result.data.user) throw new Error("The dedicated uploader could not be created. Check Supabase Auth logs and retry this script.");
    user = result.data.user;
  }
  const profile = await db.from("profiles").select("id,restaurant_name,role").eq("id", user.id).maybeSingle();
  if (profile.error) throw new Error("The uploader profile could not be checked. Rerun this script after resolving the database error.");
  if (!profile.data) {
    const result = await db.from("profiles").insert({ id: user.id, email, full_name: "BTB workspace uploader", restaurant_name: restaurant, role: "staff" });
    if (result.error) throw new Error("The Auth identity exists, but its profile could not be created. Rerun this script after resolving the database error.");
  } else if (profile.data.restaurant_name !== restaurant || profile.data.role !== "staff") {
    throw new Error("The existing uploader profile has unexpected restaurant/role values. Review it without overwriting it.");
  }
  if (!user.banned_until || new Date(user.banned_until).getTime() < Date.now() + 365 * 24 * 60 * 60 * 1000) {
    const result = await db.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
    if (result.error) throw new Error("The uploader login could not be disabled. Review the account in Supabase Auth.");
  }
  console.log("Dedicated Supabase Auth/profile uploader is ready (interactive login disabled).");
  console.log(`BTB_UPLOADER_PROFILE_ID=${user.id}`);
  console.log("Add this server-only setting to .env.local and Vercel, then redeploy.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
