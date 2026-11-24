import { test, expect } from "@playwright/test";

test("legacy BTB bookmarks redirect permanently with query strings intact", async ({ request }) => {
  for (const [oldPath, newPath] of [
    ["/between-the-buns", "/btb/demo"],
    // The legacy bookmark still maps onto its old structural target; that target
    // is now a retired door and redirects on (covered by the next test).
    ["/between-the-buns/login", "/btb/login"],
    ["/between-the-buns/prep-list", "/btb/demo/prep-list"],
    ["/between-the-buns/platform/settings", "/btb/demo/platform/settings"],
  ]) {
    const response = await request.get(`${oldPath}?date=2026-11-19&from=email`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const destination = new URL(response.headers().location, "http://127.0.0.1:5101");
    expect(destination.pathname).toBe(newPath);
    expect(destination.searchParams.get("date")).toBe("2026-11-19");
    expect(destination.searchParams.get("from")).toBe("email");
  }
});

test("the retired BTB doors and the public branch list are gone", async ({ request }) => {
  // Signed-out visitors are sent to the one unified form, never a BTB door.
  for (const door of ["/btb/login", "/btb/admin/login", "/btb/demo-login"]) {
    const response = await request.get(`${door}?next=%2Fbtb%2Fdemo`, { maxRedirects: 0 });
    expect(response.status(), `${door} must not render`).toBe(307);
    expect(new URL(response.headers().location, "http://127.0.0.1:5101").pathname).toBe("/auth/sign-in");
  }
  // Branch names and slugs are never disclosed before sign-in.
  const locations = await request.get("/api/btb/locations", { maxRedirects: 0 });
  expect(locations.status()).toBe(404);
});

test("the unified sign-in form offers no second product door", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: /sign in to your workspace/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /between the buns/i })).toHaveCount(0);
  // Signed-out callers get no identity at all, and no branch list.
  const me = await page.request.get("/api/btb/me", { maxRedirects: 0 });
  expect(me.status()).toBe(200);
  expect(await me.json()).toEqual({ authenticated: false });
});
