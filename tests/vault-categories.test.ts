import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VAULT_CATEGORIES,
  LEGACY_VAULT_CATEGORIES,
  vaultCategory,
} from "../src/lib/vault-categories";

const sql = readFileSync(
  join(__dirname, "../../supabase/schema-vault-categories.sql"),
  "utf8"
);

test("flat list is exactly what the Login Vault screen shows", () => {
  assert.deepEqual(
    VAULT_CATEGORIES.map((c) => c.value),
    [
      "debit_machine",
      "internet",
      "myr_pos",
      "security_system",
      "gfs_vendor",
      "bank_login",
      "location_email",
      "skip",
      "uber",
      "doordash",
    ]
  );
  for (const c of VAULT_CATEGORIES) {
    assert.ok(c.label, `${c.value} needs a label`);
    assert.ok(c.icon, `${c.value} needs an icon`);
  }
  const values = VAULT_CATEGORIES.map((c) => c.value);
  assert.equal(new Set(values).size, values.length, "category values must be unique");
});

test("every category is allowed by the migration CHECK", () => {
  for (const c of [...VAULT_CATEGORIES, ...LEGACY_VAULT_CATEGORIES]) {
    assert.ok(sql.includes(`'${c.value}'`), `${c.value} missing from login_vault_category_check`);
  }
  assert.ok(sql.includes("DROP CONSTRAINT IF EXISTS"), "the migration must be re-runnable");
});

test("legacy rows stay reachable and unknown values fall back", () => {
  for (const c of LEGACY_VAULT_CATEGORIES) {
    assert.equal(vaultCategory(c.value).label, c.label);
  }
  assert.equal(vaultCategory("debit_machine").label, "Debit machine");
  assert.equal(vaultCategory("made_up").label, "made_up");
  const legacyValues = LEGACY_VAULT_CATEGORIES.map((c) => c.value);
  for (const c of VAULT_CATEGORIES) {
    assert.ok(!legacyValues.includes(c.value), `${c.value} clashes with a legacy bucket`);
  }
});
