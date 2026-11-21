import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { btbIdentityFromSession } from "@/lib/btb-api";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { btbDemoSlug } from "@/lib/btb-demo";
import { loadBtbEffectiveAccess } from "@/lib/btb-effective-access";
import { inventoryDb } from "@/lib/supabase-server";
import BtbWorkspaceLayout from "./shell";

/** Resolves the location slug supplied by the proxy rewrite. The demo slug is
 *  configured in the server environment; every other slug must be a real
 *  location. Unknown slugs 404 instead of silently rendering the workspace. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const slug = cookieStore.get("btb_slug")?.value?.trim().toLowerCase()
    || (await headers()).get("x-btb-slug")?.trim().toLowerCase() || "demo";
  const demo = slug === btbDemoSlug() || slug === "demo";
  let locationId: string | null = null;
  if (!demo) {
    const { data, error } = await inventoryDb().from("locations").select("id,slug").eq("slug", slug).maybeSingle();
    if (error || !data) notFound();
    locationId = data.id as string;
    // An individual employee may only open a branch they are assigned to. This
    // check runs before any page data is rendered, so a guessed URL for another
    // branch is refused at the workspace boundary.
    const session = cookieStore.get(BTB_COOKIE)?.value;
    if (session?.startsWith("employee.")) {
      const identity = await btbIdentityFromSession(session);
      if (!identity?.employeeId) notFound();
      const access = await loadBtbEffectiveAccess(inventoryDb(), identity);
      if (!locationId || !access.locationIds.includes(locationId)) notFound();
    }
  }
  return <BtbWorkspaceLayout slug={slug}>{children}</BtbWorkspaceLayout>;
}
