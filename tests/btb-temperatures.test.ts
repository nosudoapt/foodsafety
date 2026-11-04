import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTemperature, temperatureInRange } from "../src/lib/btb-temperatures";

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

test("reading validation rejects invalid metadata and accepts only caller-editable fields", () => {
  for (const patch of [{ id: "bad" }, { record_type: "unknown" }, { equipment_name: " " }, { food_item: "x".repeat(151) }, { notes: "x".repeat(2001) }]) assert.ok(parseTemperature({ ...input, ...patch }).error);
  const parsed = parseTemperature({ ...input, equipment_name: " Fridge ", is_safe: true, user_id: "forged", restaurant_name: "other", recorded_at: "forged" });
  assert.equal(parsed.value?.equipment_name, "Fridge");
  for (const field of ["is_safe", "user_id", "restaurant_name", "recorded_at"]) assert.equal(field in parsed.value!, false);
});
