import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { btbDemoSlug } from "@/lib/btb-demo";
import { inventoryDb } from "@/lib/supabase-server";
import BtbWorkspaceLayout from "./shell";

/** Resolves the location slug supplied by the proxy rewrite. The demo slug is
 *  configured in the server environment; every other slug must be a real
 *  location. Unknown slugs 404 instead of silently rendering the workspace. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const slug = (await cookies()).get("btb_slug")?.value?.trim().toLowerCase()
    || (await headers()).get("x-btb-slug")?.trim().toLowerCase() || "demo";
  const demo = slug === btbDemoSlug() || slug === "demo";
  if (!demo) {
    const { data, error } = await inventoryDb().from("locations").select("slug").eq("slug", slug).maybeSingle();
    if (error || !data) notFound();
  }
  return <BtbWorkspaceLayout slug={slug}>{children}</BtbWorkspaceLayout>;
}
