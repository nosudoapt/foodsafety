import { redirect } from "next/navigation";
import { workspacePageSession } from "@/lib/workspace-page-server";
import BtbWorkspaceLayout from "./shell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await workspacePageSession();
  if (session.claims.principalType !== "employee" || session.claims.tenantSlug !== "between-the-buns") redirect(session.claims.permittedView);
  const site = session.principal.locations.find(item => item.id === session.claims.locationId)!;
  return <BtbWorkspaceLayout slug={site.slug}>{children}</BtbWorkspaceLayout>;
}
