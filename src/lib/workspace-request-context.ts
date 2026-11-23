import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceClaims } from "./workspace-auth-types";

interface RequestWorkspace { claims: WorkspaceClaims; db: SupabaseClient }
const workspace = new AsyncLocalStorage<RequestWorkspace>();

export function requestWorkspace(): RequestWorkspace | undefined { return workspace.getStore(); }
export function inWorkspace<T>(scope: RequestWorkspace, work: () => Promise<T>): Promise<T> {
  return workspace.run(scope, work);
}
