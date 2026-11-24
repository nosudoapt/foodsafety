import { test as base, expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

export const fixtureUrl = "http://127.0.0.1:5102";
export const password = "BrowserTest!234";
// BTB_PASSWORD is the synthetic value configured for the QA sandbox (qa/env.json);
// there is no built-in fallback in the product.
export const workspacePassword = process.env.BTB_PASSWORD ?? "";
export const east = "20000000-0000-4000-8000-000000000001";
export const west = "20000000-0000-4000-8000-000000000002";
export const bun = "30000000-0000-4000-8000-000000000001";
export type FoodSafeRole = "staff" | "manager" | "owner" | "multi_location_owner" | "corporate" | "designer";
export type BtbRole = "staff" | "supervisor" | "manager" | "corporate" | "admin";
type Row = Record<string, unknown>;
interface Failure { table: string; method?: string; status?: number; times?: number; match?: Record<string, string | null>; afterCommit?: boolean; message?: string }
interface FixtureOptions { tables?: Record<string, Row[]>; failures?: Failure[]; emailFailures?: ("reject" | "accepted-then-500")[] }
interface FixtureState { tables: Record<string, Row[]>; requests: { path: string; method: string; query: Record<string, string>; body: unknown; authorization: "anon" | "authenticated" | "service_role"; capability: boolean }[]; emailDeliveries: { id: string; key: string; body: { to: string[]; subject: string; text: string } }[]; emailRequests: { key: string; body: unknown }[] }

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

/** The browser suite signs in through the one unified door, which resolves a
 * credential through Supabase Auth (`auth.users`) and the `workspace_*` schema.
 * The e2e PostgREST stand-in is a plain PostgreSQL assembled from the BTB schema
 * files — it has neither — so an authenticated run would fail before its first
 * assertion. Those specs are skipped with this reason instead of silently
 * deleted: `--list` still shows every one of them. See e2e/README.md.
 */
export { authHarnessReady, AUTH_HARNESS_REASON } from "./auth-harness";
import { authHarnessReady, AUTH_HARNESS_REASON } from "./auth-harness";

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

// Every spec that imports this module signs someone in. Until the harness can
// answer the unified login, skip them with one visible reason (see above).
test.beforeEach(() => { test.skip(!authHarnessReady, AUTH_HARNESS_REASON); });

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

export async function signInBtb(page: Page, role: BtbRole, next = "/btb/demo") {
  // The per-role shared doors are retired: this helper now signs in as the
  // person through the one unified form and lets the server route them.
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(`${role}@btb.demo`);
  await page.getByLabel("Password", { exact: true }).fill(workspacePassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

export async function signInEmployee(page: Page, email: string, next = "/btb/demo", employeePassword = password) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(employeePassword);
  await page.getByRole("button", { name: /^sign in$/i }).click();
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
