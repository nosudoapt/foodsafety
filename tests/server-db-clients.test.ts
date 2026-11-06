import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

// ---------------------------------------------------------------------------
// Security-architecture guards (static source checks).
//
// These pin the access model in place:
//   * the privileged server client (supabase-server.ts) is imported ONLY by
//     server route code — never by pages/components that ship to the browser;
//   * no BTB API route uses the shared anon browser client any more, so the
//     anon grants CAN be revoked without breaking the API;
//   * every BTB route resolves the role from the cookie server-side;
//   * the service-role key is never given a NEXT_PUBLIC_* name.
// If any of these regress, the tests fail before the code ships.
// ---------------------------------------------------------------------------

// Compiled tests run from .test-dist/tests/, so the project root is two up.
const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const srcFiles = walk(join(ROOT, "src")).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
const btbRoutes = srcFiles.filter((f) => f.includes(`${sep}api${sep}btb${sep}`) && f.endsWith("route.ts"));
const read = (f: string) => readFileSync(f, "utf8");

test("the repo has BTB routes to check (guard against a broken walk)", () => {
  assert.ok(btbRoutes.length >= 8, `expected the BTB inventory routes, found ${btbRoutes.length}`);
});

test("no BTB API route imports the shared anon browser client", () => {
  for (const f of btbRoutes) {
    const src = read(f);
    assert.ok(
      !src.includes('from "@/lib/supabase"'),
      `${f} must use the server client (@/lib/supabase-server), not the anon browser client`,
    );
  }
});

// Session-lifecycle routes don't resolve an existing session — login CREATES
// one from credentials, logout clears it. Every other BTB route must resolve
// the role from the cookie server-side.
const SESSION_LIFECYCLE_ROUTES = new Set(["login", "logout"]);

test("every BTB API route resolves the role from the cookie server-side", () => {
  for (const f of btbRoutes) {
    const routeName = f.split(sep).at(-2) ?? "";
    if (SESSION_LIFECYCLE_ROUTES.has(routeName)) continue;
    const src = read(f);
    assert.ok(
      src.includes("btbRoute(") || src.includes("btbIdentityFromSession(") || src.includes("verifiedBtbRole as roleFromSession") || src.includes("legacyBtbRole as roleFromSession"),
      `${f} must verify individual account state, not just decode a cookie role`,
    );
    if (!src.includes("btbRoute(")) assert.ok(src.includes("BTB_COOKIE"), `${f} must read the BTB cookie`);
  }
});

test("the privileged server client is imported ONLY by route files", () => {
  for (const f of srcFiles) {
    if (!read(f).includes('from "@/lib/supabase-server"')) continue;
    assert.ok(
      f.includes(`${sep}api${sep}`) && f.endsWith("route.ts"),
      `${f} imports the privileged server client but is not an API route — it would leak to the browser`,
    );
  }
});

test("the month-end inventory page no longer touches Supabase directly", () => {
  const page = read(join(ROOT, "src", "app", "between-the-buns", "month-end-inventory", "page.tsx"));
  assert.ok(!page.includes('from "@/lib/supabase"'), "page must fetch via API routes, not the anon client");
  assert.ok(!page.includes("supabase.from("), "no direct table access from the browser");
});

test("the service-role key is server-only: never a NEXT_PUBLIC name", () => {
  const server = read(join(ROOT, "src", "lib", "supabase-server.ts"));
  assert.ok(server.includes("SUPABASE_SERVICE_ROLE_KEY"), "must reference the service-role env var");
  assert.ok(server.includes('import "server-only"'), "must carry Next's build-time server-only guard");
  assert.ok(
    !server.includes("NEXT_PUBLIC_SUPABASE_SERVICE"),
    "the service-role key must never live under a NEXT_PUBLIC_ name",
  );
  assert.ok(
    !server.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    "privileged routes must fail closed, never fall back to the anon key",
  );
  assert.ok(server.includes('typeof window !== "undefined"'), "must refuse to run in a browser");
});

test("the browser client module never references the service-role key", () => {
  const browser = read(join(ROOT, "src", "lib", "supabase.ts"));
  assert.ok(!browser.includes("SERVICE_ROLE"), "anon browser client must not see the service-role key");
});

test("no client component directly accesses a protected inventory/access table", () => {
  const protectedTables = [
    "inventory_items",
    "inventory_counts",
    "inventory_month_summary",
    "inventory_purchases",
    "inventory_month_snapshots",
    "inventory_audit_log",
    "role_page_access",
    "btb_employees", "btb_employee_credentials", "btb_training_records", "btb_training_reviews",
    "btb_shifts", "btb_shift_checks", "btb_order_sheets", "btb_order_revisions", "btb_franchise_tasks",
    "btb_staff_licences", "btb_notification_settings", "btb_licence_email_log",
  ];
  for (const file of srcFiles) {
    const source = read(file);
    if (!source.startsWith('"use client"') && !source.startsWith("'use client'")) continue;
    for (const table of protectedTables) {
      assert.ok(
        !source.includes(`.from("${table}")`) && !source.includes(`.from('${table}')`),
        `${file} directly accesses protected table ${table}; use an authenticated server route`,
      );
    }
  }
});
