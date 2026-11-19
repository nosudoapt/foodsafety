import { test, expect } from "@playwright/test";

test("legacy BTB bookmarks redirect permanently with query strings intact", async ({ request }) => {
  for (const [oldPath, newPath] of [
    ["/between-the-buns", "/btb/demo"],
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
