import { createHash, scryptSync } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect, east, west, password } from "./fixtures";
import { consoleEmail, consolePassword, consoleId, consoleSites } from "./btb-console-fixtures";

export const origin = { Origin: "http://127.0.0.1:5101" };
export const managedManager = "80000000-0000-4000-8000-000000000001";
export const managedStaff = "80000000-0000-4000-8000-000000000002";
export const legacyManager = "80000000-0000-4000-8000-000000000003";
export const managerEmail = "granted-manager@workspace.test";
export const staffEmail = "granted-staff@workspace.test";
export const legacyEmail = "legacy-manager@workspace.test";
const salt = "d".repeat(32);
const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

// Loopback-only personal credentials and genuine memberships. The used
// invitation keeps removed console people distinguishable from legacy users.
export function accessTables(pages: Record<string, string[]> = { [east]: ["platform", "prep-manual", "emergency", "handbook"], [west]: ["manuals"] }) {
  const people = [
    { id: managedManager, name: "Morgan Manager", email: managerEmail, role: "manager" },
    { id: managedStaff, name: "Sam Staff", email: staffEmail, role: "staff" },
    { id: legacyManager, name: "Lee Legacy", email: legacyEmail, role: "manager" },
  ];
  return {
    ...consoleSites,
    btb_employees: people.map(person => ({ ...person, restaurant_name: "Between the Buns", phone: "306-555-0123", position: "Team", active: true, login_enabled: true, version: 1 })),
    btb_employee_credentials: people.map(person => ({ employee_id: person.id, password_hash: passwordHash, session_version: 1 })),
    btb_location_access: [{ location_id: east, employee_id: managedManager }, { location_id: east, employee_id: managedStaff }],
    btb_location_page_access: Object.entries(pages).flatMap(([location_id, allowed]) => allowed.map(page => ({ location_id, page, allowed: true }))),
    btb_invitations: people.slice(0, 2).map((person, index) => ({
      id: `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, employee_id: person.id, email: person.email, role: person.role,
      location_id: east, invited_by: consoleId, token_hash: createHash("sha256").update(`used-browser-invite-${index}`).digest("hex"),
      used_at: "2026-01-01T12:00:00Z", expires_at: "2026-01-08T12:00:00Z",
    })),
  };
}

export async function consoleApiSignIn(request: APIRequestContext) {
  await expect(await request.post("/api/btb/admin/login", { headers: origin, data: { email: consoleEmail, password: consolePassword } })).toBeOK();
}

export async function updateLocationPages(request: APIRequestContext, id: string, pages: string[], active = true) {
  const current = await request.get(`/api/btb/admin/locations/${id}`);
  await expect(current).toBeOK();
  const { location } = await current.json();
  const saved = await request.patch(`/api/btb/admin/locations/${id}`, { headers: origin, data: {
    version: location.version, name: location.name, address: location.address ?? "", timezone: location.timezone, active, pages,
  } });
  await expect(saved).toBeOK();
}

export async function pageToken(request: APIRequestContext, page: string, mode = "read") {
  const response = await request.get(`/api/btb/public-token?page=${page}&mode=${mode}`);
  await expect(response).toBeOK();
  const result = await response.json();
  expect(result.token).toMatch(/^[0-9a-f]{64}$/);
  return result.token as string;
}

export function anonHeaders(token?: string) {
  return { apikey: "browser-test-anon-key", Authorization: "Bearer browser-test-anon-key", ...(token ? { "x-btb-public-token": token } : {}) };
}
