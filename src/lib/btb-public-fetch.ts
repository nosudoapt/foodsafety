// Short-lived capability for the remaining direct BTB PostgREST workflows.
// Never attach it to Storage, Auth, an external host, or another restaurant UI.
const tables = new Set([
  "compliance_documents", "business_documents", "staff_licenses", "inhouse_inspections",
  "corporate_inspections", "emergency_contacts", "operational_protocols", "handbook_documents",
  "handbook_signatures", "print_manuals", "marketing_promotions", "social_media_calendar",
  "new_restaurant_tasks", "prep_counts", "order_sheets", "cleaning_logs",
]);
let capability: { token: string; expiresAt: string } | null = null;
let fetching: Promise<void> | null = null;

async function publicToken(): Promise<string> {
  if (!capability || Date.parse(capability.expiresAt) <= Date.now() + 60_000) {
    fetching ??= (async () => {
      const response = await fetch("/api/btb/public-token", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("The BTB workspace connection is unavailable. Sign in again or retry.");
      capability = await response.json();
    })().finally(() => { fetching = null; });
    await fetching;
  }
  if (!capability?.token) throw new Error("The BTB workspace connection could not be authorized.");
  return capability.token;
}

export function btbPublicFetch(base: string, anonKey: string): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (typeof window !== "undefined" && (window.location.pathname === "/btb/demo" || window.location.pathname.startsWith("/btb/demo/"))
        && url.origin === new URL(base).origin && table && tables.has(table)) {
      const request = new Request(input, init);
      request.headers.set("x-btb-public-token", await publicToken());
      // A FoodSafe login in the same browser must not silently switch the BTB
      // request to its different authenticated RLS context.
      request.headers.set("authorization", `Bearer ${anonKey}`);
      return fetch(request);
    }
    return fetch(input, init);
  };
}
