import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBtbLocation, withLocation } from "../src/lib/btb-location-context";
import type { BtbEffectiveAccess } from "../src/lib/btb-page-access";
import type { BtbIdentity } from "../src/lib/btb-team";

const drumheller = { id: "20000000-0000-4000-8000-000000000001", name: "Drumheller", slug: "drumheller", active: true };
const calgary = { id: "20000000-0000-4000-8000-000000000002", name: "Calgary", slug: "calgary", active: true };

const access = (...locations: (typeof drumheller)[]): BtbEffectiveAccess => ({
  rows: [], locationIds: locations.map((site) => site.id), pageGrants: ["temperatures"],
  locations, pages: [], locationWorkspace: true,
});

const employee = (employeeId: string | null = "50000000-0000-4000-8000-000000000001"): BtbIdentity =>
  ({ role: "manager", name: "Micky", email: "m@btb.test", employeeId });

test("the shared demo keeps the legacy tenant and never a branch", () => {
  assert.equal(resolveBtbLocation(employee(null), access(drumheller), null, "demo"), null);
  // Even a slug that happens to match a branch name must not pull the demo in.
  assert.equal(resolveBtbLocation(employee(null), access(), null, "demo"), null);
});

test("an employee resolves to the single branch they belong to", () => {
  assert.deepEqual(resolveBtbLocation(employee(), access(drumheller), null, null),
    { id: drumheller.id, name: "Drumheller", slug: "drumheller" });
});

test("the visited workspace slug wins over another assignment", () => {
  const both = access(calgary, drumheller);
  assert.deepEqual(resolveBtbLocation(employee(), both, null, "calgary"), { id: calgary.id, name: "Calgary", slug: "calgary" });
  assert.deepEqual(resolveBtbLocation(employee(), both, null, "DRUMHELLER"), { id: drumheller.id, name: "Drumheller", slug: "drumheller" });
});

test("an explicit branch must be one of the employee's own", () => {
  assert.deepEqual(resolveBtbLocation(employee(), access(drumheller), drumheller.id, null), { id: drumheller.id, name: "Drumheller", slug: "drumheller" });
  // A branch that exists but is not assigned is refused, never inferred.
  assert.throws(() => resolveBtbLocation(employee(), access(calgary), drumheller.id, null), /not in your workspace/);
  assert.throws(() => resolveBtbLocation(employee(), access(), "not-a-uuid", null), /valid branch/);
});

test("owner and corporate keep the aggregate view instead of being pinned", () => {
  const owner: BtbIdentity = { role: "owner", name: "Owner", email: "o@btb.test", employeeId: "50000000-0000-4000-8000-000000000009" };
  assert.equal(resolveBtbLocation(owner, access(calgary, drumheller), null, null), null);
  assert.deepEqual(resolveBtbLocation(owner, access(calgary, drumheller), null, "calgary"), { id: calgary.id, name: "Calgary", slug: "calgary" });
});

test("an employee with no branch fails closed instead of reading everything", () => {
  assert.throws(() => resolveBtbLocation(employee(), access(), null, null), /No branch is assigned/);
});

test("an ambiguous employee must choose instead of defaulting to branch one", () => {
  assert.throws(() => resolveBtbLocation(employee(), access(calgary, drumheller), null, null), /Choose one of your assigned branches/);
  // An unknown slug (e.g. the demo URL while an employee is signed in) is not
  // silently treated as a branch either.
  assert.throws(() => resolveBtbLocation(employee(), access(calgary, drumheller), null, "demo"), /Choose one of your assigned branches/);
});

test("the row filter is strict: a branch sees its rows, the demo sees unowned rows", () => {
  const calls: [string, string, unknown][] = [];
  const builder = {
    eq: (column: string, value: string) => { calls.push(["eq", column, value]); return builder; },
    is: (column: string, value: null) => { calls.push(["is", column, value]); return builder; },
  };
  assert.equal(withLocation(builder, { id: drumheller.id, name: "Drumheller", slug: "drumheller" }), builder);
  assert.equal(withLocation(builder, null), builder);
  assert.deepEqual(calls, [["eq", "location_id", drumheller.id], ["is", "location_id", null]]);
});
