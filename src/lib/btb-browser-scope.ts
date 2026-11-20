// Direct PostgREST workflows that remain in the legacy BTB workspace.
// A capability belongs to one page and one read/write mode, never a restaurant
// or the whole browser. SQL repeats these boundaries and revalidates each use.
export const BTB_BROWSER_TABLE_PAGES: Readonly<Record<string, readonly string[]>> = {
  compliance_documents: ["compliance"],
  business_documents: ["documents"],
  staff_licenses: ["staff-licenses"],
  inhouse_inspections: ["inspections"],
  corporate_inspections: ["inspections", "franchise-inspection"],
  emergency_contacts: ["emergency"],
  operational_protocols: ["protocols"],
  handbook_documents: ["handbook"],
  print_manuals: ["manuals"],
  marketing_promotions: ["marketing"],
  social_media_calendar: ["marketing"],
  new_restaurant_tasks: ["new-restaurant"],
  prep_counts: ["prep-list"],
  order_sheets: ["order-sheet"],
  cleaning_logs: ["cleaning-schedule"],
  cash_outs: ["cash-out"],
  branding_requests: ["branding-requests"],
  corporate_dates: ["tax-dates"],
};

export const BTB_BROWSER_RPC_PAGES: Readonly<Record<string, string>> = {
  btb_replay_prep_save: "prep-list",
};

/** Shared reference registers do not turn on legacy operational workflows. */
export const BTB_LOCATION_REFERENCE_PAGES = ["emergency", "protocols", "handbook", "manuals"] as const;

export function btbBrowserScope(path: string, method: string, pathname: string): { page: string; write: boolean } | null {
  const rpc = path.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
  if (rpc) return BTB_BROWSER_RPC_PAGES[rpc] ? { page: BTB_BROWSER_RPC_PAGES[rpc], write: true } : null;
  const table = path.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
  const pages = table ? BTB_BROWSER_TABLE_PAGES[table] : undefined;
  if (!pages) return null;
  const current = pathname.replace(/^\/btb\/demo\//, "");
  // Combined compliance sections still request the destination's own grant.
  const page = pages.includes(current) ? current : pages.length === 1 ? pages[0] : null;
  return page ? { page, write: !["GET", "HEAD"].includes(method.toUpperCase()) } : null;
}
