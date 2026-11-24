import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { workspacePageSession } from "@/lib/workspace-page-server";
import BtbWorkspaceLayout from "./shell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await workspacePageSession();
  const { claims, principal } = session;
  // Both a branch's own employee and a console that switched into the branch
  // render this workspace. A console was rejected here and bounced to
  // /btb/admin, which is exactly what "Drumheller opens then closes" looked like.
  if (claims.tenantSlug !== "between-the-buns" || !["employee", "console"].includes(claims.principalType)) {
    redirect(claims.permittedView);
  }
  const site = principal.locations.find(item => item.id === claims.locationId);
  if (!site) redirect(claims.permittedView);
  // The proxy pins the branch it rewrote for this visit. Chrome for one branch
  // over another branch's records would be worse than a redirect, so a mismatch
  // goes to the branch this session is actually in.
  const requested = (await headers()).get("x-btb-slug");
  if (requested && requested !== site.slug) redirect(`/btb/${site.slug}`);
  return <BtbWorkspaceLayout slug={site.slug}>{children}</BtbWorkspaceLayout>;
}
