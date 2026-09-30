// Demo role accounts for the green FoodSafe surface.
//
// One pre-seeded account per interesting RBAC role so a prospect can see the
// product as an owner, a manager, line staff and corporate without signing up.
// Roles are validated against roles.ts (the single source of truth) — this file
// must never invent a role.
//
// The password is deliberately NOT here: it lives server-side only and is read
// from the DEMO_PASSWORD env var by src/lib/demo-server.ts, so a curious
// visitor can read the client bundle without learning it. Accounts are created
// by supabase/seed-demo.sql.
//
// Relative imports only (no "@/") so tests/*.test.ts can compile this file.
import { ROLES, ROLE_LABELS, type Role } from "./roles";

/** Accent subset of src/components/ui.tsx — kept structural so this stays a .ts file. */
type DemoAccent = "green" | "blue" | "amber" | "purple";

export interface DemoAccount {
  role: Role;
  email: string;
  fullName: string;
  restaurantName: string;
  /** Short button label, e.g. "Owner". */
  label: string;
  /** One-line promise of what this view shows. */
  headline: string;
  desc: string;
  accent: DemoAccent;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    role: "owner",
    email: "owner@foodsafe.demo",
    fullName: "Avery Chen",
    restaurantName: "The Grill House",
    label: "Owner",
    headline: "The full compliance picture",
    desc: "Everything: inspections, staff licences, documents, the login vault and every operational record.",
    accent: "green",
  },
  {
    role: "manager",
    email: "manager@foodsafe.demo",
    fullName: "Jordan Patel",
    restaurantName: "The Grill House",
    label: "Manager",
    headline: "Runs the day-to-day kitchen",
    desc: "Temperatures, checks, cleaning, deliveries and staff licences — with no vault or new-restaurant access.",
    accent: "blue",
  },
  {
    role: "staff",
    email: "staff@foodsafe.demo",
    fullName: "Sam Rivera",
    restaurantName: "The Grill House",
    label: "Staff",
    headline: "Just the shift in front of them",
    desc: "Today's checks, the temperature log and training. No admin panel, nothing to get lost in.",
    accent: "amber",
  },
  {
    role: "corporate",
    email: "corporate@foodsafe.demo",
    fullName: "Morgan Blake",
    restaurantName: "Grill House Group",
    label: "Corporate",
    headline: "Read-only multi-location rollup",
    desc: "Compliance, documents and inspection results across every site — no operational write access.",
    accent: "purple",
  },
] as const;

export const DEMO_ROLES: Role[] = DEMO_ACCOUNTS.map((a) => a.role);

export function isDemoRole(value: unknown): value is Role {
  return (
    typeof value === "string" &&
    (ROLES as readonly string[]).includes(value) &&
    DEMO_ROLES.includes(value as Role)
  );
}

export function demoAccountFor(role: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.role === role);
}

export function isDemoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEMO_ACCOUNTS.some((a) => a.email.toLowerCase() === email.toLowerCase());
}

/** Role label for the "Demo — {role}" badge. */
export function demoBadgeLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}
