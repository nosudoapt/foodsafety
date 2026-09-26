// Single source of truth for RBAC roles. Consumed by sign-up, settings,
// admin nav, role badges, and mirrored by the DB CHECK constraint in
// supabase/schema-roles.sql. Keep this list and that constraint in sync.

export const ROLES = [
  "staff",
  "manager",
  "owner",
  "multi_location_owner",
  "corporate",
  "designer",
] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "staff";

export const ROLE_LABELS: Record<Role, string> = {
  staff: "Staff",
  manager: "Manager",
  owner: "Owner",
  multi_location_owner: "Multi-Location Owner",
  corporate: "Corporate",
  designer: "Designer",
};

// Tailwind badge classes per role.
export const ROLE_COLORS: Record<Role, string> = {
  staff: "bg-green-100 text-green-700",
  manager: "bg-blue-100 text-blue-700",
  owner: "bg-amber-100 text-amber-700",
  multi_location_owner: "bg-teal-100 text-teal-700",
  corporate: "bg-purple-100 text-purple-700",
  designer: "bg-pink-100 text-pink-700",
};

// Roles with full administrative reach (see everything).
export const ADMIN_ROLES: Role[] = ["owner", "multi_location_owner", "corporate"];

// Nav/permission tiers, derived from ROLES so there is one source of truth.
// (No "supervisor" — that role was dropped from the DB CHECK in schema-roles.sql.)
export const ALL_ROLES: Role[] = [...ROLES];
export const MGMT_ROLES: Role[] = ["owner", "multi_location_owner", "corporate", "manager"];
export const OWNER_TIER_ROLES: Role[] = ["owner", "multi_location_owner", "corporate"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: string): string {
  return isRole(role) ? ROLE_LABELS[role] : role;
}

export function roleColor(role: string): string {
  return isRole(role) ? ROLE_COLORS[role] : "bg-gray-100 text-gray-700";
}

// --- self-check (ponytail: dev-only guard, tree-shaken in prod) ---
if (process.env.NODE_ENV !== "production") {
  console.assert(ROLES.length === 6, "expected 6 RBAC roles");
  console.assert(
    ROLES.every((r) => ROLE_LABELS[r] && ROLE_COLORS[r]),
    "every role needs a label and color"
  );
}
