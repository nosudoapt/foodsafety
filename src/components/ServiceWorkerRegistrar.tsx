"use client";

import { useEffect } from "react";

// Registers the offline service worker (public/sw.js) once, client-side.
// Kept out of layout markup so the root layout stays a server component.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Development chunk URLs are reused by HMR. A previously installed worker
    // must not serve old component code against the current source maps.
    if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
      void (async () => {
        const scriptUrl = new URL("/sw.js", window.location.origin).href;
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.filter((registration) =>
          [registration.active, registration.waiting, registration.installing]
            .some((worker) => worker?.scriptURL === scriptUrl)
        ).map((registration) => registration.unregister()));
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith("foodsafe-")).map((name) => caches.delete(name)));
      })().catch(() => { /* Local cache cleanup can be retried on refresh. */ });
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal for the app shell */
      });
    };
    if (document.readyState === "complete") {
      onLoad();
      return;
    }
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
