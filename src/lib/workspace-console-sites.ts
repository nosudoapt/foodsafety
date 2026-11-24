import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError } from "./api-errors";
import type { WorkspaceAuthContext, WorkspaceClaims } from "./workspace-auth-types";

/** The branches a console principal may act on: its own console assignments,
 *  inside the tenant its session is bound to.
 *
 * A console's authority is the estate, not one branch. Its session still carries
 * a single `locationId` (the durable session row requires one), so every
 * location-scoped console check resolves this same set instead of comparing
 * against that pinned id — otherwise only one branch per console would ever open.
 */
export async function consoleBranchIds(
  db: SupabaseClient,
  claims: WorkspaceClaims,
  principal: WorkspaceAuthContext,
): Promise<string[]> {
  if (claims.principalType !== "console") return [];
  const [assigned, sites] = await Promise.all([
    db.from("workspace_console_locations").select("location_id").eq("console_id", principal.credentialId),
    db.from("locations").select("id").eq("tenant_id", claims.tenantId),
  ]);
  if (assigned.error || sites.error) {
    throw new BtbApiError("Your console branches could not be verified. Please retry.", 503, assigned.error ?? sites.error);
  }
  const inTenant = new Set((sites.data ?? []).map((row: { id: string }) => row.id));
  return (assigned.data ?? [])
    .map((row: { location_id: string }) => row.location_id)
    .filter((id: string) => inTenant.has(id));
}
