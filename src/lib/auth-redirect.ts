/** Resolve return links without accepting external URLs or sibling workspaces. */
export function safeNextPath(value: string | null, fallback = "/dashboard", prefix?: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]|%5c|%2f/i.test(value)) return fallback;
  try {
    const url = new URL(value, "https://foodsafe.invalid");
    if (url.origin !== "https://foodsafe.invalid") return fallback;
    if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return fallback;
    if (url.pathname.startsWith("/auth/") || url.pathname === "/between-the-buns/login") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
