import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { btbCanEdit, btbCanView } from "../src/lib/btb-access";

// Cleaning schedule and cash-out used to be browser-direct PostgREST tables
// (prep_counts and order_sheets too). They are now server endpoints plus a
// read-only policy, so this file pins both halves: the route contract and the
// database lock.
const read = (path: string) => readFileSync(path, "utf8");
const CLEANING = "src/app/api/btb/cleaning/route.ts";
const CASH_OUT = "src/app/api/btb/cash-out/route.ts";

test("both endpoints resolve the branch from the session, never from the body", () => {
  for (const route of [CLEANING, CASH_OUT]) {
    const source = read(route);
    assert.match(source, /await btbRequestLocation\(context, request\)/, `${route} must resolve the branch`);
    assert.match(source, /withLocation\(/, `${route} must scope every query with withLocation`);
    assert.match(source, /locationColumn\(location\)/, `${route} must stamp writes with the session's branch`);
    assert.ok(!/location_id:\s*(body|request|req)\b/.test(source), `${route} trusts a client-supplied branch`);
    assert.ok(!source.includes('.is("location_id", null)'), `${route} must not hard-code the unowned tenant`);
  }
});

test("a session without a branch is refused: there is no shared/unowned tenant", () => {
  for (const route of [CLEANING, CASH_OUT]) {
    const source = read(route);
    assert.match(source, /if \(!location && context\.identity\.employeeId\)/);
    assert.match(source, /Ask your manager to assign one/, `${route} must fail closed for an unassigned employee`);
    // No handler may fall back to rows with no location.
    assert.ok(!source.includes('.is("location_id", null)'));
  }
  // The filter helper itself refuses to run without a branch.
  const context = read("src/lib/btb-location-context.ts");
  assert.match(context, /export function withLocation<Q>\(query: Q, location: BtbLocationContext \| null\): Q \{/);
  assert.match(context, /if \(!location\) throw new BtbApiError\("No active workspace assigned — contact your manager", 403\)/);
  assert.match(context, /return filter\.eq\("location_id", location\.id\)/);
});

test("reads and writes are gated on the feature matrix, so cash-out stays manager-only", () => {
  assert.match(read(CLEANING), /btbRoute\("cleaning_schedule", false/);
  assert.match(read(CLEANING), /btbRoute\("cleaning_schedule", true/);
  assert.match(read(CASH_OUT), /btbRoute\("cash_out", false/);
  assert.match(read(CASH_OUT), /btbRoute\("cash_out", true/);
  // Authentication is the one verified workspace session, not a BTB cookie.
  const auth = read("src/lib/workspace-auth-server.ts");
  assert.match(auth, /throw new BtbApiError\("Please sign in to continue\.", 401\)/);
  const api = read("src/lib/btb-api.ts");
  assert.match(api, /const session = options\?\.session \?\? await requireWorkspaceSession\(\)/);
  assert.match(api, /throw new BtbApiError\("Your role cannot make this change\.", 403\)/);
  assert.ok(!api.includes("BTB_COOKIE"), "btb-api must not read the retired BTB cookie");
  // And the matrix itself: staff may read the till but never write it.
  assert.equal(btbCanView("cash_out", "staff"), true);
  assert.equal(btbCanEdit("cash_out", "staff"), false);
  assert.equal(btbCanEdit("cash_out", "supervisor"), false);
  assert.equal(btbCanEdit("cash_out", "manager"), true);
  assert.equal(btbCanEdit("cleaning_schedule", "staff"), true);
  assert.equal(btbCanEdit("cleaning_schedule", "corporate"), false);
});

test("the actor is stamped from the signed-in identity, not typed", () => {
  assert.match(read(CLEANING), /done_by: identity\.name/);
  assert.match(read(CASH_OUT), /created_by: identity\.name/);
  for (const route of [CLEANING, CASH_OUT]) {
    assert.ok(!/done_by:\s*body|created_by:\s*body/.test(read(route)), `${route} accepts a client name`);
  }
});

test("one row per task per week and one till count per branch per day", () => {
  const sql = read("supabase/schema-btb-cleaning-cashout-server.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS cleaning_logs_branch_week_task\s+ON public\.cleaning_logs\(location_id, week_start, task_name\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS cash_outs_branch_date\s+ON public\.cash_outs\(location_id, count_date\)/);
  // Duplicates are collapsed before the indexes go on, so no history is lost.
  assert.match(sql, /DELETE FROM public\.cleaning_logs a/);
  assert.match(sql, /DELETE FROM public\.cash_outs a/);
});

test("the browser loses every write grant on the four operational tables", () => {
  const sql = read("supabase/schema-btb-cleaning-cashout-server.sql");
  for (const table of ["cleaning_logs", "cash_outs", "prep_counts", "order_sheets"]) {
    assert.ok(
      sql.includes(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.${table} FROM anon, authenticated`),
      `${table} must not be writable from the browser`,
    );
  }
  // The permissive FOR ALL policy is replaced by a read-only one.
  assert.match(sql, /FOR SELECT USING \(true\)/);
  assert.ok(!/FOR ALL USING \(true\)/.test(sql), "no table may keep a browser-wide write policy");
  assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
});

test("no page or client helper writes to those tables any more", () => {
  const views = ["src/app/btb/demo/cleaning-schedule/view.tsx", "src/app/btb/demo/cash-out/view.tsx"];
  for (const view of views) {
    const source = read(view);
    assert.ok(!source.includes('from "@/lib/supabase"'), `${view} still imports the browser client`);
    assert.ok(!/\.from\("(cleaning_logs|cash_outs)"\)/.test(source), `${view} still writes a table directly`);
  }
});

test("the month is validated before the database is touched", () => {
  const cashOut = read(CASH_OUT);
  assert.match(cashOut, /if \(!isIsoDate\(countDate\)\) throw new BtbApiError\("Choose a valid date\.", 400\)/);
  assert.match(cashOut, /if \(countDate > btbToday\(\)\)/);
  const cleaning = read(CLEANING);
  assert.match(cleaning, /if \(!cleaningTasks\.includes\(task\)\)/);
  assert.match(cleaning, /if \(doneDate > btbToday\(\)\)/);
});
