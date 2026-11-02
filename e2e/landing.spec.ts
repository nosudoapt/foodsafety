import { test, expect, capture, noHorizontalOverflow } from "./fixtures";

test("landing preview is keyboard usable and adapts to small and enlarged layouts", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Log type" });
  const first = tabs.getByRole("tab").first();
  await first.focus();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab").last()).toBeFocused();
  await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByText("sample data", { exact: true })).toBeVisible();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel")).toBeFocused();
  await capture(page, info, "landing-desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeFocused();
  await capture(page, info, "landing-mobile");
  await page.setViewportSize({ width: 812, height: 375 });
  await noHorizontalOverflow(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await noHorizontalOverflow(page);
});
