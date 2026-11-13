import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTemperature, parseTemperatureSheet, temperatureAlert, temperatureInRange } from "../src/lib/btb-temperatures";

const input = { id: "91000000-0000-4000-8000-000000000001", record_type: "cold_storage", equipment_name: "Walk-in fridge", food_item: "Dairy", temperature: "3.25", min_safe_temp: "0", max_safe_temp: "4", notes: "" };

test("readings require finite Celsius values and ordered targets; blanks never become zero", () => {
  assert.equal(parseTemperature(input).value?.temperature, 3.25);
  assert.equal(parseTemperature({ ...input, temperature: "0" }).value?.temperature, 0);
  for (const temperature of ["", " ", true, null, NaN, Infinity, "4abc", "1000", "-273.16", "3.123"]) assert.ok(parseTemperature({ ...input, temperature }).error, String(temperature));
  assert.ok(parseTemperature({ ...input, min_safe_temp: "5", max_safe_temp: "4" }).error);
  assert.ok(parseTemperature({ ...input, min_safe_temp: "" }).error);
});

test("negative freezer readings and exact target boundaries are handled correctly", () => {
  const parsed = parseTemperature({ ...input, temperature: "-18.5", min_safe_temp: "-25", max_safe_temp: "-18" });
  assert.equal(parsed.value?.temperature, -18.5);
  assert.equal(temperatureInRange(-18.5, -25, -18), true);
  assert.equal(temperatureInRange(-17.99, -25, -18), false);
  assert.equal(temperatureInRange(0, 0, 4), true);
  assert.equal(temperatureInRange(4, 0, 4), true);
  assert.equal(temperatureInRange(4.01, 0, 4), false);
});

test("the daily sheet flags against the client's standing standards", () => {
  // Coolers: green at 1–3 °C (anything colder still fine — a ceiling), amber at
  // 4 °C, red above 4 °C. Freezers: green at −18 °C or colder, amber −17 to
  // −12 °C, red warmer than −12 °C.
  const day = "2026-11-13";
  const freezer = parseTemperatureSheet({ date: day, cells: [{ label: "FREEZER-1", slot: "11:00", value: "-25" }] }, day);
  assert.equal(freezer.value?.cells[0].max_safe_temp, -12, "the freezer red ceiling is −12 °C");
  assert.equal(freezer.value?.cells[0].min_safe_temp, -273.15, "colder than −18 °C is still green, not a −24 band");
  const cooler = parseTemperatureSheet({ date: day, cells: [{ label: "COOLER-1", slot: "11:00", value: "2.5" }] }, day);
  assert.equal(cooler.value?.cells[0].max_safe_temp, 4, "the cooler red ceiling is 4 °C");
  assert.equal(temperatureInRange(-25, -273.15, -18), true, "−25 °C freezer is safe");
  assert.equal(temperatureInRange(-15, -273.15, -12), true, "−15 °C freezer is inside the amber band");
  assert.equal(temperatureInRange(2, -273.15, 4), true, "2 °C cooler is in the green band");
  assert.equal(temperatureInRange(4.4, -273.15, 4), false, "4.4 °C cooler has left the range");
});

test("the alert grades the owner's tolerance: ≤3 °C ok, 4 °C amber, above 4 °C red; freezers ≤−18 ok, −17 to −12 amber, warmer red", () => {
  // Coolers: 1–3 °C green, 4 °C amber, above 4 °C red.
  assert.equal(temperatureAlert(1, "cooler"), "ok");
  assert.equal(temperatureAlert(2.5, "cooler"), "ok");
  assert.equal(temperatureAlert(3, "cooler"), "ok");
  assert.equal(temperatureAlert(3.5, "cooler"), "warn");
  assert.equal(temperatureAlert(4, "cooler"), "warn");
  assert.equal(temperatureAlert(4.1, "cooler"), "unsafe");
  assert.equal(temperatureAlert(4.5, "cooler"), "unsafe");
  // Freezers: −18 °C or colder green; −17 °C to −12 °C amber; above −12 °C red.
  assert.equal(temperatureAlert(-18, "freezer"), "ok");
  assert.equal(temperatureAlert(-30, "freezer"), "ok");
  assert.equal(temperatureAlert(-17.9, "freezer"), "warn");
  assert.equal(temperatureAlert(-15, "freezer"), "warn");
  assert.equal(temperatureAlert(-12, "freezer"), "warn");
  assert.equal(temperatureAlert(-11.9, "freezer"), "unsafe");
  assert.equal(temperatureAlert(-10, "freezer"), "unsafe");
  // Sanitizer keeps its 200–400 PPM band with no tolerance tier.
  assert.equal(temperatureAlert(300, "sanitizer"), "ok");
  assert.equal(temperatureAlert(150, "sanitizer"), "unsafe");
  assert.equal(temperatureAlert(450, "sanitizer"), "unsafe");
});

test("reading validation rejects invalid metadata and accepts only caller-editable fields", () => {
  for (const patch of [{ id: "bad" }, { record_type: "unknown" }, { equipment_name: " " }, { food_item: "x".repeat(151) }, { notes: "x".repeat(2001) }]) assert.ok(parseTemperature({ ...input, ...patch }).error);
  const parsed = parseTemperature({ ...input, equipment_name: " Fridge ", is_safe: true, user_id: "forged", restaurant_name: "other", recorded_at: "forged" });
  assert.equal(parsed.value?.equipment_name, "Fridge");
  for (const field of ["is_safe", "user_id", "restaurant_name", "recorded_at"]) assert.equal(field in parsed.value!, false);
});
