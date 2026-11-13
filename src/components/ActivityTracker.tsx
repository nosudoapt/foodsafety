"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Mounted once per product layout: reports each page visit to /api/activity.
 * The server resolves identity from the session cookie — the browser only
 * sends the path and tab title. 401s (logged-out pages) are silent no-ops. */
export default function ActivityTracker() {
  const pathname = usePathname();
  const last = useRef<{ path: string; at: number }>({ path: "", at: 0 });

  useEffect(() => {
    if (!pathname || pathname.startsWith("/login") || pathname === "/trial-expired") return;
    const now = Date.now();
    if (last.current.path === pathname && now - last.current.at < 120_000) return;
    last.current = { path: pathname, at: now };
    void fetch("/api/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, title: typeof document !== "undefined" ? document.title : "" }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
