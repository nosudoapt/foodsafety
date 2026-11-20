import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { BtbApiError, requireBtbAccess } from "@/lib/btb-api";
import { btbCardForPath, pageSlug } from "@/lib/btb-page-access";

/** Each page entry awaits this boundary before returning its client view.
 * Layouts/client-only gates cannot withhold leaf content from an RSC response. */
export default async function BtbServerPage({ page, children }: { page: string; children: React.ReactNode }) {
  const card = page ? btbCardForPath(`/btb/demo/${page}`) : undefined;
  let failure: BtbApiError | null = null;
  try {
    if (page && page !== "account" && !card) throw new BtbApiError("This page is not available.", 403);
    await requireBtbAccess(card?.feature, false, { allowLocationWorkspace: true, page: card ? pageSlug(card) : undefined });
  } catch (error) {
    failure = error instanceof BtbApiError ? error : new BtbApiError("Your workspace could not be verified. Please try again.", 503);
  }
  // redirect throws; keep it outside the catch so Next can handle streaming too.
  if (failure?.status === 401) redirect(`/btb/login?next=${encodeURIComponent(`/btb/demo${page ? `/${page}` : ""}`)}`);
  if (failure) return <div className="ui-empty btb-loading" data-btb-access-denied>
    {failure.status === 403 ? <LockKeyhole size={30} aria-hidden="true" /> : <CircleAlert size={30} aria-hidden="true" />}
    <h1>{failure.status === 403 ? "This page isn’t in your workspace." : "Let’s reconnect your workspace."}</h1>
    <p role={failure.status === 403 ? undefined : "alert"}>{failure.status === 403 ? "Your overview shows the tools available to your role and assigned locations." : failure.message}</p>
    <Link href="/btb/demo" className="ui-button ui-button--ghost">Back to overview</Link>
  </div>;
  return <>{children}</>;
}
