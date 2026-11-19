import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin Turbopack's workspace root to this project so Next stops inferring it
// from a parent lockfile (the boot-time turbopack.root warning).
const nextConfig: NextConfig = {
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  // The BTB workspace moved from /between-the-buns/* to /btb/demo/* (sign-in
  // to /btb/login). These redirects keep old bookmarks, QR codes and links in
  // already-sent notification emails working. They are intentionally permanent
  // and stay in place — the OLD paths must never be reused for something else.
  async redirects() {
    return [
      // Sign-in moved out of the workspace tree.
      { source: "/between-the-buns/login", destination: "/btb/login", permanent: true },
      // The hub.
      { source: "/between-the-buns", destination: "/btb/demo", permanent: true },
      // Every workspace page. Query strings are forwarded automatically.
      { source: "/between-the-buns/:path*", destination: "/btb/demo/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
