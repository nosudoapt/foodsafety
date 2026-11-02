import { randomUUID } from "node:crypto";
import { test, expect, east, west, fixtureUrl, signInBtb, signInFoodSafe } from "./fixtures";
import { apiSignIn } from "./btb-helpers";
import type { TrainingManual } from "../src/lib/training";

const btbEndpoint = "/api/btb/training/print";
const foodSafeEndpoint = "/api/manuals/training";
const shared = "70000000-0000-4000-8000-000000000001";
const draft = "70000000-0000-4000-8000-000000000002";
const local = "70000000-0000-4000-8000-000000000003";
const other = "70000000-0000-4000-8000-000000000004";

function topic(id: string, title: string, location_id: string | null = null, published = true) {
  return { id, title, location_id, published, category: "food_safety", est_minutes: 5, position: 0, revision: 1 };
}

function section(topic_id: string, position: number, heading: string) {
  return { id: randomUUID(), topic_id, position, heading, body: `${heading} instructions.` };
}

function library() {
  return {
    training_topics: [topic(shared, "Shared opening"), topic(draft, "Unpublished draft", null, false), topic(local, "Harbour induction", east), topic(other, "Other site induction", west)],
    training_sections: [section(shared, 2, "Second step"), section(shared, 1, "First step"), section(draft, 0, "Draft secret"), section(local, 0, "Harbour step"), section(other, 0, "Other site secret")],
  };
}

for (const application of ["btb", "foodsafe"] as const) {
  test(`${application} manuals print authorized published training through the server and recover from read failures`, async ({ page, fixture }) => {
    await fixture.configure({ tables: library() });
    await page.addInitScript(() => {
      window.print = () => {
        const root = document.documentElement;
        root.dataset.manualPrints = String(Number(root.dataset.manualPrints ?? "0") + 1);
      };
    });
    const browserTrainingReads: string[] = [];
    page.on("request", (request) => {
      if (/\/rest\/v1\/training_(topics|sections)/.test(request.url())) browserTrainingReads.push(request.url());
    });
    if (application === "btb") await signInBtb(page, "manager", "/between-the-buns/manuals");
    else await signInFoodSafe(page, "manager", "/admin/manuals");
    const print = page.getByRole("button", { name: /Print \/ Save PDF/ });
    await print.click();
    await expect(page.locator("html")).toHaveAttribute("data-manual-prints", "1");
    await expect(page.locator("#print-section h2")).toHaveText(application === "btb" ? ["Shared opening"] : ["Harbour induction", "Shared opening"]);
    await expect(page.locator("#print-section h3")).toHaveText(application === "btb" ? ["First step", "Second step"] : ["Harbour step", "First step", "Second step"]);
    await expect(page.locator("#print-section")).not.toContainText("secret");

    for (const table of ["training_topics", "training_sections"]) {
      await fixture.configure({ failures: [{ table, method: "GET", times: 1 }] });
      await print.click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be loaded");
      await expect(page.locator("#print-section")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("data-manual-prints", table === "training_topics" ? "1" : "2");
      await expect(print).toBeEnabled();
      await print.click();
      await expect(page.locator("html")).toHaveAttribute("data-manual-prints", table === "training_topics" ? "2" : "3");
    }
    expect(browserTrainingReads).toEqual([]);
  });
}

test("manuals endpoints keep FoodSafe and BTB sessions independent, including simultaneous sign-ins", async ({ page, request, fixture }) => {
  await fixture.configure({ tables: library() });
  for (const endpoint of [btbEndpoint, foodSafeEndpoint]) expect((await request.get(endpoint)).status()).toBe(401);
  await signInBtb(page, "staff", "/between-the-buns/manuals");
  expect((await page.request.get(foodSafeEndpoint)).status()).toBe(401);
  await signInFoodSafe(page, "manager", "/admin/manuals");
  const btb = await page.request.get(btbEndpoint);
  const foodSafe = await page.request.get(foodSafeEndpoint);
  await expect(btb).toBeOK();
  await expect(foodSafe).toBeOK();
  expect(btb.headers()["cache-control"]).toBe("private, no-store");
  expect(foodSafe.headers()["cache-control"]).toBe("private, no-store");
  expect((await btb.json()).training.map((item: TrainingManual) => item.id)).toEqual([shared]);
  expect((await foodSafe.json()).training.map((item: TrainingManual) => item.id)).toEqual([local, shared]);
  await page.context().clearCookies({ name: "btb_session" });
  expect((await page.request.get(btbEndpoint)).status()).toBe(401);
  await expect(await page.request.get(foodSafeEndpoint)).toBeOK();
  for (const table of ["training_topics", "training_sections"]) {
    expect((await request.get(`${fixtureUrl}/rest/v1/${table}`, { headers: { apikey: "browser-test-anon-key" } })).status()).toBe(403);
  }
});

test("manuals enforce BTB role and page access while FoodSafe enforces its own management roles", async ({ page, request, fixture }) => {
  for (const role of ["staff", "supervisor", "manager", "corporate", "admin"] as const) {
    await apiSignIn(request, `${role}@foodsafe.demo`);
    expect((await request.get(btbEndpoint)).status(), role).toBe(role === "admin" ? 403 : 200);
  }
  await apiSignIn(request);
  for (const page of ["manuals", "training-guide"]) {
    await fixture.configure({ tables: { role_page_access: [{ role: "manager", page, allowed: false }] } });
    expect((await request.get(btbEndpoint)).status(), page).toBe(403);
  }
  for (const role of ["staff", "designer"] as const) {
    await signInFoodSafe(page, role);
    expect((await page.request.get(foodSafeEndpoint)).status(), role).toBe(403);
  }
});

test("FoodSafe training scope follows verified home sites, memberships and group-wide roles", async ({ page, fixture }) => {
  await fixture.configure({ tables: library() });
  for (const role of ["manager", "owner", "multi_location_owner", "corporate"] as const) {
    await signInFoodSafe(page, role, "/admin/manuals");
    const response = await page.request.get(`${foodSafeEndpoint}?location_id=${west}`);
    await expect(response).toBeOK();
    expect((await response.json()).training.map((item: TrainingManual) => item.id), role).toEqual(role === "manager" ? [local, shared] : [local, other, shared]);
  }
  await signInFoodSafe(page, "manager", "/admin/manuals");
  await expect(page.getByRole("heading", { name: "Print Manuals", exact: true })).toBeVisible();
  const { tables } = await fixture.state();
  // A home site remains authorized without membership; no assignment grants only shared topics.
  await fixture.configure({ tables: { location_members: [] } });
  expect((await (await page.request.get(foodSafeEndpoint)).json()).training.map((item: TrainingManual) => item.id)).toEqual([local, shared]);
  await fixture.configure({ tables: { profiles: tables.profiles.map((profile) => ({ ...profile, location_id: null })) } });
  expect((await (await page.request.get(foodSafeEndpoint)).json()).training.map((item: TrainingManual) => item.id)).toEqual([shared]);
  for (const table of ["profiles", "location_members"]) {
    const match: Record<string, string> = table === "profiles" ? { select: "role,location_id,trial_ends_at" } : { order: "location_id.asc" };
    await fixture.configure({ failures: [{ table, method: "GET", match, times: 1 }] });
    expect((await page.request.get(foodSafeEndpoint)).status(), table).toBe(503);
  }
  await fixture.configure({ tables: { profiles: tables.profiles.map((profile) => ({ ...profile, trial_ends_at: "2020-01-01T00:00:00Z" })) } });
  expect((await page.request.get(foodSafeEndpoint)).status()).toBe(403);
});

test("training manuals include every ordered section beyond the old thousand-row limit", async ({ request, fixture }) => {
  const sections = Array.from({ length: 1001 }, (_, index) => section(shared, index, `Step ${index + 1}`)).reverse();
  await fixture.configure({ tables: { training_topics: [topic(shared, "Complete guide")], training_sections: sections } });
  await apiSignIn(request);
  const response = await request.get(btbEndpoint);
  await expect(response).toBeOK();
  const { training } = await response.json();
  expect(training[0].sections).toHaveLength(1001);
  expect(training[0].sections[0].heading).toBe("Step 1");
  expect(training[0].sections.at(-1).body).toBe("Step 1001 instructions.");
});

test("a failed stored PDF read blocks incomplete manuals printing and reports the file", async ({ page, fixture }) => {
  await fixture.configure({ tables: { ...library(), print_manuals: [{ id: "manual1", title: "Operations handbook", file_name: "operations.pdf", file_size: 1200, category: "operations", created_at: "2026-01-01", file_url: "data:application/pdf;base64," }] } });
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printed = "true"; }; });
  await signInBtb(page, "manager", "/between-the-buns/manuals");
  await expect(page.getByRole("heading", { name: "Operations handbook" })).toBeVisible();
  await fixture.configure({ failures: [{ table: "print_manuals", method: "GET", match: { select: "file_url" }, times: 1 }] });
  await page.getByRole("button", { name: /Print \/ Save PDF/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("“Operations handbook” could not be loaded");
  await expect(page.locator("#print-section")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-printed");
});
