import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, ipAllowed, policyFromRow, presenceProblem, type ClockPolicy } from "../src/lib/btb-clock-policy";

const base: ClockPolicy = { geofence: false, latitude: null, longitude: null, radiusM: 150, requireNetwork: false, networks: [], requireDevice: false };

test("distance is metres, not kilometres or degrees", () => {
  assert.ok(distanceMeters(51.465, -112.719, 51.465, -112.719) < 1);
  const hundred = distanceMeters(51.465, -112.719, 51.4659, -112.719);
  assert.ok(hundred > 90 && hundred < 110);
});

test("IPv4 CIDR and exact IPv6 rules are enforced", () => {
  assert.equal(ipAllowed("203.0.113.10", ["203.0.113.0/24"]), true);
  assert.equal(ipAllowed("203.0.114.10", ["203.0.113.0/24"]), false);
  assert.equal(ipAllowed("::1", ["::1"]), true);
  assert.equal(ipAllowed("::2", ["::1"]), false);
  assert.equal(ipAllowed(null, ["203.0.113.0/24"]), false);
});

test("geofence, network and device refusals are specific", () => {
  assert.equal(presenceProblem(base, { latitude: null, longitude: null, accuracy: null, ip: null, deviceId: "d" }), null);
  assert.match(presenceProblem({ ...base, geofence: true, latitude: 51.465, longitude: -112.719 }, { latitude: null, longitude: null, accuracy: null, ip: "203.0.113.10", deviceId: "" }) ?? "", /Allow location access/);
  assert.match(presenceProblem({ ...base, geofence: true, latitude: 51.465, longitude: -112.719 }, { latitude: 51.5, longitude: -112.8, accuracy: 10, ip: null, deviceId: "" }) ?? "", /within 150 m/);
  assert.match(presenceProblem({ ...base, requireNetwork: true, networks: [] }, { latitude: null, longitude: null, accuracy: null, ip: "203.0.113.10", deviceId: "" }) ?? "", /has not configured/);
  assert.match(presenceProblem({ ...base, requireDevice: true }, { latitude: null, longitude: null, accuracy: null, ip: null, deviceId: "" }) ?? "", /device/);
});

test("policy rows default to open clock-in", () => {
  assert.deepEqual(policyFromRow(null), base);
  assert.equal(policyFromRow({ clock_geofence: true, clock_latitude: "51.465", clock_longitude: "-112.719", clock_radius_m: 100, clock_networks: ["::1"] }).geofence, true);
});
