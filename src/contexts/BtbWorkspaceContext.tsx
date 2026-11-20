"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isBtbRole } from "@/lib/btb-roles";
import { isBtbEffectiveAccess, type BtbEffectiveAccess, type BtbPageAccess } from "@/lib/btb-page-access";
import { fetchJson } from "@/lib/fetch-json";
import type { BtbIdentity } from "@/lib/btb-team";
import { BTB_SESSION_EVENT, BTB_SESSION_STORAGE, clearBtbPublicCapabilities, syncBtbCapabilityIdentity } from "@/lib/btb-public-fetch";

interface WorkspaceState { key: string; identity: BtbIdentity | null; access: BtbEffectiveAccess | null; error: string; accessError: string }
interface BtbWorkspaceValue {
  identity: BtbIdentity | null;
  rows: BtbPageAccess[] | null;
  pageGrants: string[] | null;
  access: BtbEffectiveAccess | null;
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
    // Focus/online/navigation revalidation also fences capabilities that might
    // have been issued before another tab changed the HttpOnly session cookie.
    clearBtbPublicCapabilities();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    void fetchJson<{ authenticated: boolean; role?: string; name?: string; email?: string; employeeId?: string | null; sessionVersion?: number; access?: unknown }>("/api/btb/me", { signal: controller.signal }).then(me => {
      if (cancelled) return;
      if (!me.authenticated) {
        syncBtbCapabilityIdentity(null);
        router.replace(`/btb/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const identity = isBtbRole(me.role)
        ? { role: me.role, name: me.name || "Your team", email: me.email || "", employeeId: me.employeeId ?? null, sessionVersion: me.sessionVersion } : null;
      const access = isBtbEffectiveAccess(me.access) ? me.access : null;
      syncBtbCapabilityIdentity(access ? identity : null);
      setState({ key, identity, access,
        error: identity ? "" : "Your session could not be loaded. Check your connection and try again.",
        accessError: access ? "" : "Page access settings couldn’t be loaded. Retry to open your tools.",
      });
    }).catch(() => {
      if (!cancelled) { syncBtbCapabilityIdentity(null); clearBtbPublicCapabilities(); setState({ key, identity: null, access: null, error: "Your workspace could not be verified. Check your connection and try again.", accessError: "" }); }
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [key, pathname, router]);

  useEffect(() => {
    const storageChanged = (event: StorageEvent) => { if (event.key === BTB_SESSION_STORAGE) reload(); };
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    window.addEventListener(BTB_SESSION_EVENT, reload);
    window.addEventListener("storage", storageChanged);
    return () => { window.removeEventListener("online", reload); window.removeEventListener("focus", reload); window.removeEventListener(BTB_SESSION_EVENT, reload); window.removeEventListener("storage", storageChanged); clearBtbPublicCapabilities(); };
  }, [reload]);

  const loaded = state?.key === key;
  const access = loaded ? state.access : null;
  return <BtbContext.Provider value={{ identity: loaded ? state.identity : null, access, rows: access?.rows ?? null, pageGrants: access?.pageGrants ?? null, loading: !loaded, error: loaded ? state.error : "", accessError: loaded ? state.accessError : "", reload }}>{children}</BtbContext.Provider>;
}

export function useBtbWorkspace(): BtbWorkspaceValue {
  const context = useContext(BtbContext);
  if (!context) throw new Error("BTB pages must be rendered within BtbWorkspaceProvider.");
  return context;
}
