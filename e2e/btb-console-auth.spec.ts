import { test, expect, capture, signInBtb, signInFoodSafe, workspacePassword } from "./fixtures";
import { consoleAdmin, consoleCookie, consoleEmail, consolePassword, signInConsole } from "./btb-console-fixtures";
import type { Page } from "@playwright/test";

async function expectConsoleGate(page: Page) {
  const response = await page.request.get("/btb/admin", { maxRedirects: 0 });
  if (response.status() === 307) {
    expect(response.headers().location).toContain("/btb/admin/login");
  } else {
    // Next emits a meta redirect when DB-backed revocation is discovered after
    // streaming has begun. No authenticated console UI may be in that response.
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="__next-page-redirect"');
    expect(html).toContain("url=/btb/admin/login");
    expect(html).not.toMatch(/btb-console__header|Alex Console|console@workspace\.test/);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  expect(await (await page.request.get("/api/btb/admin/me")).json()).toMatchObject({ authenticated: false });
}

test("console credentials and cookies never authenticate the demo or FoodSafe, and vice versa", async ({ page, fixture, context }) => {
  await fixture.configure({ tables: { btb_super_admins: [consoleAdmin] } });
  await page.goto("/btb/admin");
  await expect(page).toHaveURL(/\/btb\/admin\/login/);
  await signInBtb(page, "admin");
  await page.goto("/btb/admin");
  await expect(page).toHaveURL(/\/btb\/admin\/login/);
  const rejected = await page.request.post("/api/btb/admin/login", {
    headers: { Origin: "http://127.0.0.1:5101" }, data: { email: "admin@btb.demo", password: workspacePassword },
  });
  expect(rejected.status()).toBe(401);
  await context.clearCookies();
  await signInConsole(page);
  const me = await page.request.get("/api/btb/admin/me");
  expect(await me.json()).toMatchObject({ authenticated: true, admin: { name: "Alex Console", email: consoleEmail } });
  expect(await me.text()).not.toMatch(/password_hash|session_version|ConsoleBrowserTest/);
  expect((await me.headers())["cache-control"]).toContain("no-store");
  expect(await (await page.request.get("/api/btb/me")).json()).toMatchObject({ authenticated: false });
  await page.goto("/btb/demo");
  await expect(page).toHaveURL(/\/btb\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("logging out of any one workspace preserves the other two sessions", async ({ page, fixture }) => {
  await fixture.configure({ tables: { btb_super_admins: [consoleAdmin] } });
  await signInFoodSafe(page, "owner");
  await signInBtb(page, "staff");
  await signInConsole(page);
  await page.getByRole("button", { name: "Console sign out" }).click();
  await expect(page).toHaveURL(/\/btb\/admin\/login$/);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your business, at a glance." })).toBeVisible();
  await page.goto("/btb/demo");
  await expect(page).toHaveURL(/\/btb\/demo$/);
  await signInConsole(page);
  await page.goto("/btb/demo");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/btb\/login$/);
  await page.goto("/btb/admin");
  await expect(page.getByRole("heading", { name: "The group, at a glance." })).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.goto("/btb/admin");
  await expect(page.getByRole("heading", { name: "The group, at a glance." })).toBeVisible();
});

test("console expiry, tampering, blocking and credential-version revocation fail closed", async ({ page, context, fixture }) => {
  await fixture.configure({ tables: { btb_super_admins: [consoleAdmin] } });
  for (const value of [consoleCookie(Math.floor(Date.now() / 1000) - 1), consoleCookie(Math.floor(Date.now() / 1000) + 3600, 2), consoleCookie(Math.floor(Date.now() / 1000) + 3600).slice(0, -1)]) {
    await context.addCookies([{ name: "btb_admin_session", value, url: "http://127.0.0.1:5101", httpOnly: true, sameSite: "Lax" }]);
    // Assert the actual HTTP gate, without Chromium's cross-document animation
    // race when repeatedly replacing cookies and following server redirects.
    await expectConsoleGate(page);
  }
  await signInConsole(page);
  await fixture.configure({ tables: { btb_super_admins: [{ ...consoleAdmin, active: false }] } });
  await expectConsoleGate(page);
  await fixture.configure({ tables: { btb_super_admins: [consoleAdmin] } });
  await signInConsole(page);
  await fixture.configure({ tables: { btb_super_admins: [{ ...consoleAdmin, session_version: 2 }] } });
  await expectConsoleGate(page);
});

test("console sign-in retains failed entries, rejects CSRF and confines return paths", async ({ page, fixture }) => {
  await fixture.configure({ tables: { btb_super_admins: [consoleAdmin] } });
  const csrf = await page.request.post("/api/btb/admin/login", { headers: { Origin: "https://outside.example" }, data: { email: consoleEmail, password: consolePassword } });
  expect(csrf.status()).toBe(403);
  await page.goto("/btb/admin/login?next=https%3A%2F%2Foutside.example");
  await page.getByLabel("Console email").fill(consoleEmail);
  await page.getByLabel("Console password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Open the console" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("email and password don’t match");
  await expect(page.getByLabel("Console email")).toHaveValue(consoleEmail);
  await page.getByLabel("Console password", { exact: true }).fill(consolePassword);
  await page.getByRole("button", { name: "Open the console" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:5101/btb/admin");
});

test("console login and shell fit desktop, tablet and phone with keyboard focus", async ({ page, fixture }, info) => {
  await fixture.configure({ tables: { btb_super_admins: [consoleAdmin] } });
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/btb/admin/login");
    await page.getByLabel("Console email").focus();
    await expect(page.getByLabel("Console email")).toBeFocused();
    expect((await page.getByLabel("Console email").boundingBox())!.y).toBeLessThan(600);
    await capture(page, info, `console-login-${width}`);
  }
  await signInConsole(page);
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await capture(page, info, `console-shell-${width}`);
  }
});
