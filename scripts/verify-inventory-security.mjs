#!/usr/bin/env node
// Read-only/no-match verification for deploy/04-security-hardening.sql.
// Uses the public anon key locally but never prints it. GET uses limit=0 (no
// row data); DELETE targets impossible sentinel keys (no real row is changed),
// so running this before hardening also remains data-safe.

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readEnvFile } from "./migrate-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  const values = readEnvFile(path.join(ROOT, name));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!base || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (values were not printed). ");
  process.exit(1);
}

const targets = [
  ["inventory_purchases", "id=eq.00000000-0000-0000-0000-000000000000"],
  ["inventory_counts", "id=eq.00000000-0000-0000-0000-000000000000"],
  ["inventory_items", "id=eq.00000000-0000-0000-0000-000000000000"],
  ["inventory_month_summary", "id=eq.00000000-0000-0000-0000-000000000000"],
  ["inventory_month_snapshots", "count_month=eq.__security_probe__"],
  ["inventory_audit_log", "id=eq.-1"],
  ["role_page_access", "role=eq.__security_probe__"],
];

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const denied = (status) => status === 401 || status === 403;

const results = [];
for (const [table, noMatchFilter] of targets) {
  const read = await fetch(`${base}/rest/v1/${table}?select=*&limit=0`, { headers });
  const write = await fetch(`${base}/rest/v1/${table}?${noMatchFilter}`, {
    method: "DELETE",
    headers: { ...headers, Prefer: "return=minimal" },
  });
  results.push({ table, read: read.status, write: write.status, pass: denied(read.status) && denied(write.status) });
}

console.table(results);
if (results.some((result) => !result.pass)) {
  console.error("FAIL: direct anon read/write is still possible or returned an unexpected status.");
  process.exit(1);
}
console.log("PASS: direct anon reads and writes are denied on all 7 protected tables.");
