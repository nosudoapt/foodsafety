// BTB role names — shared by server auth and the client-side hub card filter.
// This module must stay secret-free (no passwords, no session token): it is
// imported by client components, unlike ./btb-auth which is server-only.
export const BTB_ROLES = ["staff", "manager", "owner", "corporate"] as const;
export type BtbRole = (typeof BTB_ROLES)[number];

export function isBtbRole(value: unknown): value is BtbRole {
  return typeof value === "string" && (BTB_ROLES as readonly string[]).includes(value);
}
