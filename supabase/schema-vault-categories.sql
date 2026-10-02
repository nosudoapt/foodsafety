-- Patch 8 — Login Vault flat category list.
--
-- The vault screen (src/app/admin/vault/page.tsx) replaced its category
-- dropdown with a flat list of the things a location actually logs in to
-- (src/lib/vault-categories.ts): Debit machine, Internet, MYR POS, Security
-- system, GFS Vendor, Bank login, Location email, Skip, Uber, DoorDash.
-- The original CHECK only allowed 6 buckets, so widen it to the new values
-- while keeping every legacy row readable. Idempotent: safe to re-run.
--
-- Run order: after supabase/schema-compliance.sql (login_vault). Until this
-- file has been run, adding a login under one of the new categories is
-- rejected by the CHECK — /api/vault returns a message naming this file.

ALTER TABLE login_vault
  DROP CONSTRAINT IF EXISTS login_vault_category_check;

ALTER TABLE login_vault
  ADD CONSTRAINT login_vault_category_check
  CHECK (category IN (
    -- Flat list — keep in sync with src/lib/vault-categories.ts
    'debit_machine',
    'internet',
    'myr_pos',
    'security_system',
    'gfs_vendor',
    'bank_login',
    'location_email',
    'skip',
    'uber',
    'doordash',
    -- Legacy buckets (pre-Patch 8 rows)
    'pos',
    'banking',
    'delivery',
    'utility',
    'supplier',
    'other'
  ));
