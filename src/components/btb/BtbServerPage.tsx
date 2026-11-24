import "server-only";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { BtbApiError, requireBtbAccess } from "@/lib/btb-api";
import { btbCardForPath, pageSlug } from "@/lib/btb-page-access";
import { workspacePageSession } from "@/lib/workspace-page-server";
import { workspacePageAllowed } from "@/lib/workspace-page-access";

/** Each page entry awaits this boundary before returning its client view.
 * Layouts/client-only gates cannot withhold leaf content from an RSC response. */
export default async function BtbServerPage({ page, children }: { page: string; children: React.ReactNode }) {
  const session = await workspacePageSession();
  const slugs = session.principal.locations.map((site) => site.slug);
  // The branch this render is for: the proxy pins it for an employee, and a
  // console must have switched its session to the branch it is entering.
  const slug = (await headers()).get("x-btb-slug")
    ?? session.principal.locations.find((site) => site.id === session.claims.locationId)?.slug
    ?? "";
  const current = session.principal.locations.find((site) => site.id === session.claims.locationId);
  const branchEntry = session.claims.principalType === "employee" || session.claims.principalType === "console";
  const base = `/btb/${slug}`;
  if (!branchEntry || !current || slug !== current.slug
    || !workspacePageAllowed(`${base}${page ? `/${page}` : ""}`, session.claims, slugs)) {
    redirect(session.claims.permittedView);
  }
  const card = page ? btbCardForPath(`/btb/demo/${page}`) : undefined;
  let failure: BtbApiError | null = null;
  try {
    if (page && page !== "account" && !card) throw new BtbApiError("This page is not available.", 403);
    await requireBtbAccess(card?.feature, false, { allowLocationWorkspace: true, page: card ? pageSlug(card) : undefined, session });
  } catch (error) {
    failure = error instanceof BtbApiError ? error : new BtbApiError("Your workspace could not be verified. Please try again.", 503);
  }
  // redirect throws; keep it outside the catch so Next can handle streaming too.
  if (failure?.status === 401) redirect("/auth/sign-in");
  if (failure?.status === 403) redirect(session.claims.permittedView);
  if (failure) return <div className="ui-empty btb-loading" data-btb-access-denied>
    {failure.status === 403 ? <LockKeyhole size={30} aria-hidden="true" /> : <CircleAlert size={30} aria-hidden="true" />}
    <h1>{failure.status === 403 ? "This page isn’t in your workspace." : "Let’s reconnect your workspace."}</h1>
    <p role={failure.status === 403 ? undefined : "alert"}>{failure.status === 403 ? "Your overview shows the tools available to your role and assigned locations." : failure.message}</p>
    <Link href={session.claims.permittedView} className="ui-button ui-button--ghost">Back to overview</Link>
  </div>;
  return <>{children}</>;
}
