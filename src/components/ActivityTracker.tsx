"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { ActivityWorkspace } from "@/lib/activity";

/** Mounted once per product layout: reports each page visit to /api/activity.
 * The server resolves identity from the session cookie and derives the page
 * name from the path — the browser only sends the path. 401s (logged-out
 * pages) are silent no-ops. */
export default function ActivityTracker({ workspace = "foodsafe", enabled = true, identityKey = "" }: { workspace?: ActivityWorkspace; enabled?: boolean; identityKey?: string }) {
  const pathname = usePathname();
  const last = useRef<{ path: string; at: number }>({ path: "", at: 0 });

  useEffect(() => {
    if (!enabled || !pathname || pathname.startsWith("/login") || pathname === "/trial-expired") return;
    const visitKey = `${workspace}:${identityKey}:${pathname}`;
    const now = Date.now();
    if (last.current.path === visitKey && now - last.current.at < 120_000) return;
    last.current = { path: visitKey, at: now };
    void fetch(workspace === "btb" ? "/api/activity?workspace=btb" : "/api/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname, workspace, enabled, identityKey]);

  return null;
}
