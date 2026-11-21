import { NextResponse } from "next/server";
import { PRIVATE_HEADERS } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";

/** Public branch cards for the team sign-in. Names and slugs only — never
 *  people, records or secrets. Closed locations are omitted. */
export async function GET() {
  try {
    const db = inventoryDb();
    const [managed, settings] = await Promise.all([
      db.from("btb_superadmin_locations").select("location_id"),
      db.from("btb_location_settings").select("location_id,active"),
    ]);
    const ids = (managed.data ?? []).map((row) => row.location_id as string);
    if (!ids.length) return NextResponse.json({ locations: [] }, { headers: PRIVATE_HEADERS });
    const sites = await db.from("locations").select("id,name,slug").in("id", ids).order("name");
    const active = new Set((settings.data ?? []).filter((row) => row.active).map((row) => row.location_id as string));
    return NextResponse.json({
      locations: (sites.data ?? []).filter((site) => active.has(site.id as string) && site.slug)
        .map((site) => ({ name: site.name as string, slug: site.slug as string })),
    }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ locations: [] }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
