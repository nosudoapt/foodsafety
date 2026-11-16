import { test } from "node:test";
import assert from "node:assert/strict";
import { btbOriginAllowed } from "../src/lib/btb-origin";

test("HTTP-20: Origin must exactly match host, scheme and port", () => {
  const request = (origin?: string, extras?: Record<string,string>) => new Request("https://app.example/api/btb/inventory-summary", { headers: { ...(origin ? { origin } : {}), ...extras } });
  assert.equal(btbOriginAllowed(request("https://app.example")), true);
  for (const origin of ["https://evil.example", "http://app.example", "https://app.example:444", "null", "https://app.example.evil", "https://app.example/path"]) assert.equal(btbOriginAllowed(request(origin)), false);
  assert.equal(btbOriginAllowed(request()), true);
  assert.equal(btbOriginAllowed(request(undefined, { "sec-fetch-site": "cross-site" })), false);
  assert.equal(btbOriginAllowed(request("https://evil.example", { "x-forwarded-host": "evil.example" })), false);
  assert.equal(btbOriginAllowed(new Request("http://localhost:5101/api/btb/login", { headers: { host: "127.0.0.1:5101", origin: "http://127.0.0.1:5101" } })), true);
});
