import { test as base, expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

export const fixtureUrl = "http://127.0.0.1:5102";
export const password = "BrowserTest!234";
export const east = "20000000-0000-4000-8000-000000000001";
export const west = "20000000-0000-4000-8000-000000000002";
export const bun = "30000000-0000-4000-8000-000000000001";
export type FoodSafeRole = "staff" | "manager" | "owner" | "multi_location_owner" | "corporate" | "designer";
export type BtbRole = "staff" | "supervisor" | "manager" | "corporate" | "admin";
type Row = Record<string, unknown>;
interface Failure { table: string; method?: string; status?: number; times?: number; match?: Record<string, string> }
interface FixtureOptions { tables?: Record<string, Row[]>; failures?: Failure[]; emailFailures?: ("reject" | "accepted-then-500")[] }
interface FixtureState { tables: Record<string, Row[]>; requests: { path: string; method: string; query: Record<string, string>; body: unknown }[]; emailDeliveries: { id: string; key: string; body: { to: string[]; subject: string; text: string } }[]; emailRequests: { key: string; body: unknown }[] }

class LocalFixture {
  constructor(private request: APIRequestContext) {}
  async configure(options: FixtureOptions) {
    const response = await this.request.post(`${fixtureUrl}/__test/configure`, { data: options });
    expect(response.ok()).toBeTruthy();
  }
  async state(): Promise<FixtureState> {
    const response = await this.request.get(`${fixtureUrl}/__test/state`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
}

export const test = base.extend<{ fixture: LocalFixture; browserHealth: void }>({
  fixture: async ({ request }, provide) => {
    const response = await request.post(`${fixtureUrl}/__test/reset`, { data: {} });
    expect(response.ok()).toBeTruthy();
    await provide(new LocalFixture(request));
  },
  browserHealth: [async ({ page, context, fixture }, provide, info) => {
    void fixture;
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.hostname !== "127.0.0.1") {
        errors.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    await provide();
    if (consoleErrors.length) await info.attach("browser-console", { body: consoleErrors.join("\n"), contentType: "text/plain" });
    expect(errors, "No uncaught browser errors or external data requests").toEqual([]);
  }, { auto: true }],
});

export { expect };

export function monthAt(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}

export async function signInFoodSafe(page: Page, role: FoodSafeRole, next = "/dashboard") {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(`${role}@workspace.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

export async function signInBtb(page: Page, role: BtbRole, next = "/between-the-buns") {
  await page.goto(`/between-the-buns/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Team email").fill(`${role}@foodsafe.demo`);
  await page.getByLabel("Workspace password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
}

export async function signInEmployee(page: Page, email: string, next = "/between-the-buns", employeePassword = password) {
  await page.goto(`/between-the-buns/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Team email").fill(email);
  await page.getByLabel("Workspace password", { exact: true }).fill(employeePassword);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "The viewport should contain the page; tables may scroll in their own region").toBeLessThanOrEqual(1);
}

export async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // Anchor fixed chrome to the top of full-page captures after form interactions.
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await noHorizontalOverflow(page);
  const path = info.outputPath(`${name}.png`);
  // A dialog and its backdrop belong to the viewport, not the full document.
  const fullPage = await page.getByRole("dialog").count() === 0;
  await page.screenshot({ path, fullPage, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}
