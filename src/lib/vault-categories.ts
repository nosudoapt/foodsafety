// The Login Vault's flat category list (Patch 8) — the things a location
// actually logs in to, in the order src/app/admin/vault/page.tsx shows them.
// Kept in a lib module so the screen and tests/vault-categories.test.ts share
// one definition, and mirrored by the CHECK in
// supabase/schema-vault-categories.sql.

export interface VaultCategory {
  /** login_vault.category */
  value: string;
  /** Shown on screen */
  label: string;
  icon: string;
}

/** The flat list — every location keeps one of each. */
export const VAULT_CATEGORIES: VaultCategory[] = [
  { value: "debit_machine", label: "Debit machine", icon: "💳" },
  { value: "internet", label: "Internet", icon: "🌐" },
  { value: "myr_pos", label: "MYR POS", icon: "🧾" },
  { value: "security_system", label: "Security system", icon: "📹" },
  { value: "gfs_vendor", label: "GFS Vendor", icon: "📦" },
  { value: "bank_login", label: "Bank login", icon: "🏦" },
  { value: "location_email", label: "Location email", icon: "✉️" },
  { value: "skip", label: "Skip", icon: "🥡" },
  { value: "uber", label: "Uber", icon: "🚗" },
  { value: "doordash", label: "DoorDash", icon: "🛵" },
];

/**
 * Pre-Patch 8 buckets still stored on existing rows. They are not offered on
 * the add form, but are listed (with their entries) so nothing already in the
 * vault becomes unreachable.
 */
export const LEGACY_VAULT_CATEGORIES: VaultCategory[] = [
  { value: "pos", label: "POS", icon: "🧾" },
  { value: "banking", label: "Banking", icon: "🏦" },
  { value: "delivery", label: "Delivery", icon: "🛵" },
  { value: "utility", label: "Utility", icon: "💡" },
  { value: "supplier", label: "Supplier", icon: "📦" },
  { value: "other", label: "Other", icon: "🔗" },
];

/** Label + icon for a stored category value, including unknown leftovers. */
export function vaultCategory(value: string): VaultCategory {
  return (
    VAULT_CATEGORIES.find((c) => c.value === value) ??
    LEGACY_VAULT_CATEGORIES.find((c) => c.value === value) ?? {
      value,
      label: value,
      icon: "🔗",
    }
  );
}
