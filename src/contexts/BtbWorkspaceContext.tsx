"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isBtbRole } from "@/lib/btb-roles";
import { isBtbPageAccess, type BtbPageAccess } from "@/lib/btb-page-access";
import { fetchJson } from "@/lib/fetch-json";
import type { BtbIdentity } from "@/lib/btb-team";

interface WorkspaceState { key: string; identity: BtbIdentity | null; rows: BtbPageAccess[] | null; error: string; accessError: string }
interface BtbWorkspaceValue {
  identity: BtbIdentity | null;
  rows: BtbPageAccess[] | null;
  loading: boolean;
  error: string;
  accessError: string;
  reload: () => void;
}

const BtbContext = createContext<BtbWorkspaceValue | null>(null);

export function BtbWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<WorkspaceState | null>(null);
  const key = `${pathname}:${revision}`;
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    void Promise.allSettled([
      fetchJson<{ authenticated: boolean; role?: string; name?: string; email?: string; employeeId?: string | null }>("/api/btb/me", { signal: controller.signal }),
      fetchJson<{ rows: unknown[] }>("/api/btb/role-page-access", { signal: controller.signal }),
    ]).then(([me, permissions]) => {
      if (cancelled) return;
      if (me.status === "fulfilled" && !me.value.authenticated) {
        router.replace(`/between-the-buns/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const identity = me.status === "fulfilled" && isBtbRole(me.value.role)
        ? { role: me.value.role, name: me.value.name || "Your team", email: me.value.email || "", employeeId: me.value.employeeId ?? null } : null;
      const rows = permissions.status === "fulfilled" && Array.isArray(permissions.value.rows) && permissions.value.rows.every(isBtbPageAccess)
        ? permissions.value.rows : null;
      setState({ key, identity, rows,
        error: identity ? "" : "Your session could not be loaded. Check your connection and try again.",
        accessError: rows ? "" : "Page access settings couldn’t be loaded. Retry to open your tools.",
      });
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [key, pathname, router]);

  useEffect(() => {
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, [reload]);

  const loaded = state?.key === key;
  return <BtbContext.Provider value={{ identity: loaded ? state.identity : null, rows: loaded ? state.rows : null, loading: !loaded, error: loaded ? state.error : "", accessError: loaded ? state.accessError : "", reload }}>{children}</BtbContext.Provider>;
}

export function useBtbWorkspace(): BtbWorkspaceValue {
  const context = useContext(BtbContext);
  if (!context) throw new Error("BTB pages must be rendered within BtbWorkspaceProvider.");
  return context;
}
