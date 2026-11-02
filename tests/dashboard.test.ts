import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionFor, dashboardRecordScope, metricQuery, type DashboardContext } from "../src/lib/dashboard";
import { loadDashboard, loadLocationPulse } from "../src/lib/dashboard-data";
import { queryExactCount, verifiedCount } from "../src/lib/query-count";
import { activeWorkspaceItem, searchWorkspace, workspaceNavForRole } from "../src/lib/workspace-nav";
import { queryClient, jsonRows } from "./helpers/query-client";

const now = new Date("2026-11-01T12:00:00Z");
const context: DashboardContext = { role: "owner", userId: "person-1", locationIds: ["site-east"], restaurantName: "  Test Restaurant  " };
const signal = () => new AbortController().signal;

test("personal, site and restaurant scopes remain distinct when locations change", () => {
  assert.deepEqual(dashboardRecordScope("personal", context), { column: "user_id", op: "eq", value: "person-1" });
  assert.deepEqual(dashboardRecordScope("site", context), { column: "location_id", op: "in", value: ["site-east"] });
  assert.deepEqual(dashboardRecordScope("site", { ...context, locationIds: ["site-west"] }), { column: "location_id", op: "in", value: ["site-west"] });
  assert.deepEqual(dashboardRecordScope("restaurant", { ...context, locationIds: ["site-west"] }), { column: "restaurant_name", op: "eq", value: "Test Restaurant" });
  assert.equal(dashboardRecordScope("site", { ...context, locationIds: [] }), null);
  assert.equal(dashboardRecordScope("restaurant", { ...context, restaurantName: " " }), null);
  assert.equal(dashboardRecordScope("personal", { ...context, userId: "" }), null);
  assert.deepEqual(dashboardRecordScope("site", { ...context, role: "staff" }), { column: "user_id", op: "eq", value: "person-1" });
});

test("unknown sites produce unavailable metrics without unscoped operational requests", async () => {
  const { client, requests } = queryClient(() => jsonRows([], 3));
  const result = await loadDashboard(client, { ...context, locationIds: [] }, now, signal());
  assert.equal(result.values.temperatureAlerts, null);
  assert.equal(result.values.renewals, null);
  assert.equal(result.values.openActions, null);
  assert.equal(result.values.documents, 3);
  assert.equal(result.activityUnavailable, true);
  assert.ok(requests.every((request) => !/temperature_records|corrective_actions|compliance_documents/.test(request.url)));
  const documents = requests.find((request) => request.url.includes("business_documents"))!;
  assert.equal(new URL(documents.url).searchParams.get("restaurant_name"), "eq.Test Restaurant");
});

test("staff counts and activity query only their own records", async () => {
  const { client, requests } = queryClient(() => jsonRows([], 0));
  const result = await loadDashboard(client, { ...context, role: "staff" }, now, signal());
  assert.equal(result.values.checksToday, 0);
  assert.equal(result.activityUnavailable, false);
  for (const request of requests) {
    const params = new URL(request.url).searchParams;
    assert.equal(params.get("user_id"), "eq.person-1");
    assert.equal(params.has("location_id"), false);
    assert.equal(params.has("restaurant_name"), false);
  }
});

test("designer dashboard requests marketing data only", async () => {
  const { client, requests } = queryClient(() => jsonRows([], 2));
  const result = await loadDashboard(client, { ...context, role: "designer" }, now, signal());
  assert.equal(result.values.activePromotions, 2);
  assert.equal(result.values.temperatureAlerts, undefined);
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.match(new URL(request.url).pathname, /\/(marketing_promotions|social_media_calendar)$/);
    assert.equal(new URL(request.url).searchParams.get("restaurant_name"), "eq.Test Restaurant");
  }
  assert.equal(metricQuery("renewals", { ...context, role: "designer" }, now), null);
});

test("count errors, missing count headers and cancellation cannot become zero", async () => {
  for (const result of [{ count: null }, { count: 5, error: { message: "denied" } }, { count: -1 }, { count: 1.5 }, { count: NaN }]) {
    assert.equal(verifiedCount(result), null);
  }
  assert.equal(verifiedCount({ count: 0, error: null }), 0);
  const denied = queryClient(() => new Response(JSON.stringify({ message: "denied" }), { status: 403 }));
  assert.equal(await queryExactCount(denied.client, "daily_checks", [], signal()), null);
  const absent = queryClient(() => new Response(null, { status: 200 }));
  assert.equal(await queryExactCount(absent.client, "daily_checks", [], signal()), null);
  const offline = queryClient(() => { throw new TypeError("Network unavailable"); });
  assert.equal(await queryExactCount(offline.client, "daily_checks", [], signal()), null);
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(await queryExactCount(absent.client, "daily_checks", [], aborted.signal), null);
});

test("one unavailable source retains successful figures and recent equipment readings", async () => {
  const { client } = queryClient((request) => {
    const table = new URL(request.url).pathname.split("/").pop();
    if (table === "corrective_actions") return new Response(JSON.stringify({ message: "unavailable" }), { status: 503 });
    if (request.method === "HEAD") return jsonRows([], 0);
    return jsonRows(table === "temperature_records" ? [{ id: "t1", equipment_name: "Walk-in fridge", temperature: 42, unit: "F", is_safe: false, recorded_at: "2026-11-01T10:00:00Z" }] : []);
  });
  const result = await loadDashboard(client, context, now, signal());
  assert.equal(result.values.documents, 0);
  assert.equal(result.values.openActions, null);
  assert.equal(result.activityUnavailable, true);
  assert.equal(result.activity[0].title, "Walk-in fridge");
  assert.equal(result.activity[0].detail, "42°F · Outside safe range");
  assert.equal(result.activity[0].at, "2026-11-01T10:00:00Z");
});

test("location comparisons query each permitted location id, not its display name", async () => {
  const { client, requests } = queryClient((request) => jsonRows([], new URL(request.url).searchParams.get("location_id") === "in.(site-east)" ? 1 : 7));
  const sites = [{ id: "site-east", name: "A display name" }, { id: "site-west", name: "Another name" }];
  const pulse = await loadLocationPulse(client, { ...context, role: "multi_location_owner" }, sites, now, signal());
  assert.equal(pulse[0].values.openActions, 1);
  assert.equal(pulse[1].values.openActions, 7);
  assert.equal(requests.length, 6);
  assert.ok(requests.every((request) => !new URL(request.url).searchParams.has("restaurant_name")));
});

test("priorities rank known issues and never interpret unavailable figures as resolved", () => {
  const priorities = attentionFor("owner", { renewals: 3, temperatureAlerts: 2, openActions: null, licensesDue: 0 });
  assert.deepEqual(priorities.map(({ id, count }) => [id, count]), [["temperatureAlerts", 2], ["renewals", 3]]);
});

test("workspace search respects role access and the active item uses the deepest route", () => {
  assert.deepEqual(searchWorkspace("vault", "staff"), []);
  assert.equal(searchWorkspace("vault", "owner")[0].href, "/admin/vault");
  assert.ok(searchWorkspace("cold holding", "manager").some((item) => item.href === "/temperatures"));
  assert.deepEqual(workspaceNavForRole("unrecognized"), []);
  assert.equal(activeWorkspaceItem("/admin", "owner")?.href, "/dashboard");
  assert.equal(activeWorkspaceItem("/admin/inspections/corporate", "corporate")?.href, "/admin/inspections/corporate");
  assert.equal(activeWorkspaceItem("/checks", "designer"), undefined);
});
