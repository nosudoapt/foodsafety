import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BtbApiError } from "./api-errors";
import { authUuid, type WorkspaceAuthContext, type WorkspaceClaims } from "./workspace-auth-types";
import { scopeRpcRequest, scopeTableRequest, type WorkspaceDatabaseScope, type WorkspaceTable } from "./workspace-db-policy";
import { consoleBranchIds } from "./workspace-console-sites";

export async function scopedWorkspaceDb(base: SupabaseClient, claims: WorkspaceClaims, principal: WorkspaceAuthContext): Promise<SupabaseClient> {
  const [catalog, members, consoleSites] = await Promise.all([
    base.rpc("workspace_scope_catalog"),
    claims.principalType === "employee" || claims.principalType === "console"
      ? base.from("btb_location_access").select("employee_id").eq("location_id", claims.locationId)
      : Promise.resolve({ data: [], error: null }),
    // A console's estate: its own assignments inside the session's tenant. The
    // session is pinned to one branch, but the console may act on all of them.
    consoleBranchIds(base, claims, principal),
  ]);
  if (catalog.error || members.error || !Array.isArray(catalog.data)) throw new BtbApiError("Your workspace scope could not be verified. Please retry.", 503, catalog.error ?? members.error);
  if (!catalog.data.every((table: WorkspaceTable) => table && /^[a-z_][a-z_0-9]*$/.test(table.name) && Array.isArray(table.columns)
    && table.columns.every(column => typeof column === "string") && typeof table.uuidTenant === "boolean")) throw new BtbApiError("Invalid workspace register contract.", 503);
  const tables = catalog.data as WorkspaceTable[];
  const ids = (members.data ?? []).map(row => row.employee_id).filter(authUuid);
  const employees = ids.length ? await base.from("btb_employees").select("id").in("id", ids).eq("tenant_id", claims.tenantId) : { data: [], error: null };
  if (employees.error) throw new BtbApiError("Your workspace team could not be verified.", 503, employees.error);
  const scope: WorkspaceDatabaseScope = { claims, principal, tables, employeeIds: (employees.data ?? []).map(row => row.id), consoleLocationIds: consoleSites };
  const serverUrl = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serverUrl || !key) throw new BtbApiError("Authentication is not configured.", 503);
  const nativeFetch = globalThis.fetch;
  return createClient(serverUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-workspace-session": claims.sid }, fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== new URL(serverUrl).origin) throw new BtbApiError("Invalid workspace data destination.", 403);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      let body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const tableName = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
      if (tableName) {
        const table = tables.find(item => item.name === tableName);
        if (!table) throw new BtbApiError("This register is not available in your workspace.", 403);
        body = scopeTableRequest(url, method, body, table, scope);
      }
      if (rpc) body = scopeRpcRequest(rpc, method, body, scope);
      if (!tableName && !rpc) {
        // No Auth admin API, global object listing or arbitrary HTTP escape.
        // Storage writers must use a tenant/current-location object prefix.
        const storage = url.pathname.match(/^\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
        if (!storage || !["training-videos", "documents", "photos", "staff-licenses"].includes(storage[1])
          || !storage[2].startsWith(`${claims.tenantId}/${claims.locationId}/`) || storage[2].split("/").some(segment => decodeURIComponent(segment) === "..")) {
          throw new BtbApiError("Use the authorized workspace file action.", 403);
        }
      }
      return nativeFetch(url, { ...init, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } },
  });
}
