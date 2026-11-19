import { createHmac, scryptSync } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { east, west } from "./fixtures";

// Disposable loopback-only credentials. Never production defaults or seeds.
export const consoleId = "40000000-0000-4000-8000-000000000001";
export const consoleEmail = "console@workspace.test";
export const consolePassword = "ConsoleBrowserTest!234";
const salt = "c".repeat(32);
export const consoleAdmin = {
  id: consoleId, name: "Alex Console", email: consoleEmail, active: true, session_version: 1,
  password_hash: `scrypt:${salt}:${scryptSync(consolePassword, salt, 64).toString("hex")}`,
  created_at: "2026-01-01T00:00:00Z",
};

export const consoleSites = {
  btb_super_admins: [consoleAdmin],
  btb_location_settings: [east, west].map(location_id => ({ location_id, active: true, timezone: "America/Regina", version: 1 })),
  btb_superadmin_locations: [east, west].map(location_id => ({ location_id })),
};

export function consoleCookie(expires: number, version = 1) {
  const key = createHmac("sha256", "browser-test-service-key").update("btb-admin-session-signing:v1").digest("hex");
  const payload = Buffer.from(JSON.stringify({ id: consoleId, version, expires })).toString("base64url");
  return `admin.${payload}.${createHmac("sha256", key).update(`btb-admin:${payload}`).digest("hex")}`;
}

export async function signInConsole(page: Page, next = "/btb/admin") {
  await page.goto(`/btb/admin/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Console email").fill(consoleEmail);
  await page.getByLabel("Console password", { exact: true }).fill(consolePassword);
  await page.getByRole("button", { name: "Open the console" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}
