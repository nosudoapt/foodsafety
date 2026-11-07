// BTB role names — shared by server auth and the client-side hub card filter.
// This module must stay secret-free (no passwords, no session token): it is
// imported by client components, unlike ./btb-auth which is server-only.
// Ordered low → high privilege. "manager" is the merged managers/owners tier
// (an owner is a manager for access purposes); "supervisor" sits between staff
// and manager. "corporate" is franchise HQ (opens new restaurants, sees the
// corporate franchise report).
export const BTB_ROLES = ["staff", "supervisor", "manager", "designer", "corporate", "owner", "admin"] as const;
export type BtbRole = (typeof BTB_ROLES)[number];

/** Company register key used by the operational schema and overview counts. */
export const BTB_RESTAURANT = "Between the Buns";

export const BTB_ROLE_LABELS: Record<BtbRole, string> = {
  staff: "Staff", supervisor: "Supervisor", manager: "Manager", designer: "Designer", corporate: "Corporate", owner: "Owner / Super Admin", admin: "Administrator",
};

export function isBtbRole(value: unknown): value is BtbRole {
  return typeof value === "string" && (BTB_ROLES as readonly string[]).includes(value);
}
