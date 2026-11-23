import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBtbLocation, withLocation, locationColumn } from "../src/lib/btb-location-context";
import type { BtbEffectiveAccess } from "../src/lib/btb-page-access";
import type { BtbIdentity } from "../src/lib/btb-team";

const drumheller = { id: "20000000-0000-4000-8000-000000000001", name: "Drumheller", slug: "drumheller", active: true };
const calgary = { id: "20000000-0000-4000-8000-000000000002", name: "Calgary", slug: "calgary", active: true };

const access = (...locations: (typeof drumheller)[]): BtbEffectiveAccess => ({
  rows: [], locationIds: locations.map((site) => site.id), pageGrants: ["temperatures"],
  locations, pages: [], locationWorkspace: true,
});

const employee = (overrides: Partial<BtbIdentity> = {}): BtbIdentity => ({
  role: "manager", name: "Micky", email: "m@btb.test",
  employeeId: "50000000-0000-4000-8000-000000000001",
  tenantId: "60000000-0000-4000-8000-000000000001",
  currentLocationId: drumheller.id,
  allowedLocationIds: [drumheller.id],
  ...overrides,
});

test("the verified session's current branch is the branch, with no guessing", () => {
  assert.deepEqual(resolveBtbLocation(employee(), access(drumheller)),
    { id: drumheller.id, name: "Drumheller", slug: "drumheller" });
});

test("an explicit ?location= may only restate the current branch", () => {
  assert.deepEqual(resolveBtbLocation(employee(), access(drumheller), drumheller.id),
    { id: drumheller.id, name: "Drumheller", slug: "drumheller" });
  const both = access(calgary, drumheller);
  assert.throws(() => resolveBtbLocation(employee(), both, calgary.id), /not the current workspace/);
});

test("a stale workspace slug may only restate the current branch", () => {
  assert.deepEqual(resolveBtbLocation(employee(), access(drumheller), null, "drumheller"),
    { id: drumheller.id, name: "Drumheller", slug: "drumheller" });
  assert.throws(() => resolveBtbLocation(employee(), access(calgary, drumheller), null, "calgary"), /not the current workspace/);
});

test("a session with no branch, tenant or employee identity fails closed", () => {
  for (const broken of [employee({ employeeId: null }), employee({ tenantId: undefined }), employee({ currentLocationId: undefined })]) {
    assert.throws(() => resolveBtbLocation(broken, access(drumheller)), /No active workspace assigned/);
  }
});

test("a branch the session may not use is refused, never inferred", () => {
  // The claim names Drumheller but the live assignment list no longer has it.
  assert.throws(() => resolveBtbLocation(employee(), access(calgary)), /not in your workspace/);
  // And an inactive site is not usable either.
  assert.throws(() => resolveBtbLocation(employee(), access({ ...drumheller, active: false })), /not in your workspace/);
});

test("every query is filtered by the branch — there is no unowned tenant", () => {
  const calls: [string, string, unknown][] = [];
  const builder = { eq: (column: string, value: string) => { calls.push(["eq", column, value]); return builder; } };
  assert.equal(withLocation(builder, { id: drumheller.id, name: "Drumheller", slug: "drumheller" }), builder);
  assert.deepEqual(calls, [["eq", "location_id", drumheller.id]]);
  // No location means no query at all (the old `location_id IS NULL` bucket).
  assert.throws(() => withLocation(builder, null), /No active workspace assigned/);
  assert.throws(() => locationColumn(null), /No active workspace assigned/);
  assert.equal(locationColumn({ id: drumheller.id, name: "Drumheller", slug: "drumheller" }), drumheller.id);
});
