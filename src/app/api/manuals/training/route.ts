import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFailure, BtbApiError, dbError, PRIVATE_HEADERS, readAll } from "@/lib/btb-api";
import { MULTI_SITE_ROLES } from "@/lib/locations";
import { canView } from "@/lib/permissions";
import { isRole } from "@/lib/roles";
import { canAccess } from "@/lib/route-guards";
import { inventoryDb } from "@/lib/supabase-server";
import { readTrainingManuals } from "@/lib/training-manuals";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    });
    // FoodSafe verifies its own Supabase session, even if a BTB cookie is present.
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new BtbApiError("Please sign in to Pholo to print manuals.", 401);
    const { data: profile, error } = await supabase.from("profiles")
      .select("role,location_id,trial_ends_at").eq("id", user.id).maybeSingle();
    dbError(error, "Your Pholo profile could not be verified. Please try again.");
    if (!profile || !isRole(profile.role) || !canAccess("/admin/manuals", profile.role) || !canView("training_module", profile.role)) {
      throw new BtbApiError("Your Pholo role cannot access these manuals.", 403);
    }
    if (profile.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) {
      throw new BtbApiError("Your Pholo trial has ended.", 403);
    }

    let locationIds: string[] | null = null;
    if (!(MULTI_SITE_ROLES as readonly string[]).includes(profile.role)) {
      const members = await readAll<{ location_id: string }>((from, to) => supabase.from("location_members")
        .select("location_id").eq("user_id", user.id).order("location_id").range(from, to), "Your Pholo locations could not be verified. Please try again.");
      locationIds = [...new Set([...members.map((member) => member.location_id), ...(profile.location_id ? [profile.location_id as string] : [])])];
    }
    return NextResponse.json({ training: await readTrainingManuals(inventoryDb(), locationIds) }, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiFailure(error); }
}
