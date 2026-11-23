import "server-only";
import { requireWorkspacePage } from "@/lib/workspace-page-server";

/** Awaited by every protected leaf entry, before returning its client view. */
export default async function WorkspaceServerPage({ path, locationId, children }: { path: string; locationId?: string; children: React.ReactNode }) {
  await requireWorkspacePage(path, locationId);
  return <>{children}</>;
}
