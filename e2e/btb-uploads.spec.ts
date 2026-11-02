import { randomUUID } from "node:crypto";
import { test, expect, capture, east, fixtureUrl, signInBtb, signInEmployee, signInFoodSafe } from "./fixtures";
import { apiSignIn, appOrigin, createEmployee } from "./btb-helpers";

const uploader = "10000000-0000-4000-8000-000000000099";
const pdf = Buffer.from("%PDF-1.4\nBTB upload verification");
const file = { name: "btb-procedure.pdf", url: `data:application/pdf;base64,${pdf.toString("base64")}` };
const campaign = { title: "BTB campaign", description: "A company campaign", month: 11, year: 2026, category: "poster", size: '24"×36" Poster', person_name: "Morgan", location_id: null };
const social = { caption: "BTB social plan", day: 0, channel: "Instagram", post_date: null };
const tables = ["business_documents", "marketing_promotions", "social_media_calendar"];

test("personal BTB document uploads retain failed drafts and use the dedicated profile alongside FoodSafe", async ({ page, request, fixture }, info) => {
  await apiSignIn(request);
  const manager = await createEmployee(request, { name: "Morgan Uploader", role: "manager" });
  await signInFoodSafe(page, "owner");
  const direct: string[] = [];
  page.on("request", (request) => { if (tables.some((table) => request.url().includes(`/rest/v1/${table}`))) direct.push(request.url()); });
  await signInEmployee(page, manager.email!, "/between-the-buns/documents");
  await expect(page.getByRole("article", { name: "BTB service standards" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Kitchen opening procedure" })).toHaveCount(0);
  await page.getByRole("button", { name: "Upload document", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upload document" });
  await expect(dialog.getByLabel("Document name")).toBeFocused();
  await dialog.getByLabel("Document name").fill("BTB opening handover");
  await dialog.getByLabel("Notes (optional)").fill("Ready for the opening manager.");
  await dialog.getByLabel("File", { exact: true }).setInputFiles({ name: file.name, mimeType: "application/pdf", buffer: pdf });
  await fixture.configure({ failures: [{ table: "business_documents", method: "POST", times: 1 }] });
  await dialog.getByRole("button", { name: "Upload document", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("wasn’t uploaded");
  await expect(dialog.getByLabel("Document name")).toHaveValue("BTB opening handover");
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "btb-uploader-retained-draft-mobile");
  await dialog.getByRole("button", { name: "Upload document", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = page.getByRole("article", { name: "BTB opening handover" });
  await expect(saved).toContainText("Added by Morgan Uploader");
  const row = (await fixture.state()).tables.business_documents.find((item) => item.name === "BTB opening handover");
  expect(row).toMatchObject({ user_id: uploader, uploaded_by: uploader, restaurant_name: "Between the Buns", btb_created_by: manager.id, btb_created_by_name: manager.name, file_size: pdf.byteLength, expiry_date: null });
  const download = page.waitForEvent("download");
  await saved.getByRole("button", { name: "Download file" }).click();
  expect((await download).suggestedFilename()).toBe(file.name);
  await page.reload();
  await expect(saved).toBeVisible();
  await capture(page, info, "btb-document-uploader-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, info, "btb-document-uploader-desktop");
  page.on("dialog", (confirmation) => confirmation.accept());
  await fixture.configure({ failures: [{ table: "business_documents", method: "DELETE", times: 1 }] });
  await saved.getByRole("button", { name: "Delete BTB opening handover" }).click();
  await expect(page.locator(".document-workspace").getByRole("alert")).toContainText("wasn’t deleted");
  await expect(saved).toBeVisible();
  await saved.getByRole("button", { name: "Delete BTB opening handover" }).click();
  await expect(saved).toHaveCount(0);
  expect(direct).toEqual([]);
  await page.goto("/admin/documents");
  await expect(page.getByRole("article", { name: "Kitchen opening procedure" })).toBeVisible();
  await expect(page.getByRole("article", { name: "BTB service standards" })).toHaveCount(0);
});

test("corporate can create artwork and dated posts through BTB with recoverable saves and mutations", async ({ page, fixture }, info) => {
  await signInFoodSafe(page, "designer");
  await signInBtb(page, "corporate", "/between-the-buns/marketing");
  await page.getByRole("button", { name: "Add Promotion", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Promotion" });
  await dialog.getByLabel("Title", { exact: true }).fill("BTB winter artwork");
  await dialog.getByLabel("Person Name").fill("Corporate studio");
  await dialog.getByLabel("Poster / Design File").setInputFiles({ name: "winter.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(dialog.getByLabel("Select Location").locator("option")).toHaveCount(1);
  await fixture.configure({ failures: [{ table: "marketing_promotions", method: "POST", times: 1 }] });
  await dialog.getByRole("button", { name: "Save promotion" }).click();
  await expect(dialog.getByRole("alert")).toContainText("wasn’t saved");
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("BTB winter artwork");
  await dialog.getByRole("button", { name: "Save promotion" }).click();
  await expect(dialog).toHaveCount(0);
  const saved = page.getByRole("article", { name: "BTB winter artwork" });
  await expect(saved).toContainText("Added by Corporate (shared workspace)");
  const download = page.waitForEvent("download");
  await saved.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("winter.pdf");
  await fixture.configure({ failures: [{ table: "marketing_promotions", method: "PATCH", times: 1 }] });
  await saved.getByRole("button", { name: "Mark BTB winter artwork active" }).click();
  await expect(page.locator(".marketing-board").getByRole("alert")).toContainText("wasn’t changed");
  await saved.getByRole("button", { name: "Mark BTB winter artwork active" }).click();
  await expect(saved.getByRole("button", { name: "Mark BTB winter artwork completed" })).toBeVisible();
  const planner = page.getByRole("region", { name: "Social content planner" });
  await planner.getByLabel("Caption", { exact: true }).fill("BTB winter menu is ready");
  await planner.getByLabel("Date (optional)").fill("2030-11-05");
  await fixture.configure({ failures: [{ table: "social_media_calendar", method: "POST", times: 1 }] });
  await planner.getByRole("button", { name: "Add post", exact: true }).click();
  await expect(planner.getByRole("alert")).toContainText("wasn’t saved");
  await expect(planner.getByLabel("Caption", { exact: true })).toHaveValue("BTB winter menu is ready");
  await planner.getByRole("button", { name: "Add post", exact: true }).click();
  await expect(planner.getByText("BTB winter menu is ready", { exact: true })).toBeVisible();
  await capture(page, info, "btb-marketing-uploader-desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await capture(page, info, "btb-marketing-uploader-mobile");
  const state = await fixture.state();
  expect(state.tables.marketing_promotions.find((row) => row.title === "BTB winter artwork")).toMatchObject({ user_id: uploader, restaurant_name: "Between the Buns", location_id: null, status: "active", file_name: "winter.pdf", file_size: pdf.byteLength, btb_created_by: null, btb_created_by_name: "Corporate (shared workspace)" });
  expect(state.tables.social_media_calendar.find((row) => row.caption === "BTB winter menu is ready")).toMatchObject({ user_id: uploader, restaurant_name: "Between the Buns", post_date: "2030-11-05", day: 1, btb_created_by_name: "Corporate (shared workspace)" });
  await fixture.configure({ failures: [{ table: "social_media_calendar", method: "DELETE", times: 1 }] });
  await planner.getByRole("button", { name: "Remove post: BTB winter menu is ready" }).click();
  await expect(planner.getByRole("alert")).toContainText("wasn’t removed");
  await planner.getByRole("button", { name: "Remove post: BTB winter menu is ready" }).click();
  await expect(planner.getByText("BTB winter menu is ready", { exact: true })).toHaveCount(0);
  page.on("dialog", (confirmation) => confirmation.accept());
  await saved.getByRole("button", { name: "Delete BTB winter artwork" }).click();
  await expect(saved).toHaveCount(0);
});

test("uploader APIs enforce independent sessions, role/page permissions and same-origin mutations", async ({ page, request, fixture }) => {
  for (const url of ["/api/btb/documents", "/api/btb/marketing", "/api/btb/social-posts"]) expect((await request.post(url, { data: {} })).status()).toBe(401);
  await signInFoodSafe(page, "owner");
  expect((await page.request.post("/api/btb/documents", { data: { name: "FoodSafe cannot impersonate BTB", file } })).status()).toBe(401);
  for (const role of ["staff", "supervisor", "corporate", "admin"]) {
    await apiSignIn(request, `${role}@foodsafe.demo`);
    expect((await request.post("/api/btb/documents", { data: {} })).status(), `${role} document create`).toBe(403);
    expect((await request.delete("/api/btb/documents", { data: {} })).status(), `${role} document delete`).toBe(403);
    const read = await request.get("/api/btb/documents");
    expect(read.status()).toBe(["supervisor", "corporate"].includes(role) ? 200 : 403);
    if (role !== "corporate") {
      expect((await request.get("/api/btb/marketing")).status()).toBe(403);
      expect((await request.post("/api/btb/marketing", { data: campaign })).status()).toBe(403);
      expect((await request.post("/api/btb/social-posts", { data: social })).status()).toBe(403);
    }
  }
  await apiSignIn(request);
  for (const url of ["/api/btb/documents", "/api/btb/marketing", "/api/btb/social-posts"]) {
    expect((await request.post(url, { headers: { Origin: "https://outside.example" }, data: {} })).status()).toBe(403);
  }
  await fixture.configure({ tables: { role_page_access: [{ role: "manager", page: "documents", allowed: false }, { role: "manager", page: "marketing", allowed: false }] } });
  for (const url of ["/api/btb/documents", "/api/btb/marketing", "/api/btb/social-posts"]) expect((await request.post(url, { data: {} })).status()).toBe(403);
  expect((await request.get("/api/btb/documents")).status()).toBe(403);
  expect((await request.get("/api/btb/marketing")).status()).toBe(403);
  const anon = await request.get(`${fixtureUrl}/rest/v1/business_documents?select=id`, { headers: { apikey: "browser-test-anon-key" } });
  expect(anon.status()).toBe(403);
});

test("uploader scope and identity are server-owned and foreign records cannot be mutated or downloaded", async ({ request, fixture }) => {
  await apiSignIn(request);
  const before = await fixture.state();
  const foreignDocument = before.tables.business_documents.find((row) => row.restaurant_name !== "Between the Buns")!;
  const foreignPromotion = before.tables.marketing_promotions.find((row) => row.restaurant_name !== "Between the Buns")!;
  const foreignPost = before.tables.social_media_calendar[0];
  const response = await request.post("/api/btb/documents", { headers: { Origin: appOrigin }, data: { name: "Scoped document", file, file_size: 999999, user_id: foreignDocument.user_id, uploaded_by: foreignDocument.user_id, restaurant_name: "Another restaurant", btb_created_by: randomUUID(), btb_created_by_name: "Forged actor", expiry_date: "2030-01-01", doc_type: "insurance" } });
  await expect(response).toBeOK();
  expect((await fixture.state()).tables.business_documents.find((row) => row.name === "Scoped document")).toMatchObject({ user_id: uploader, uploaded_by: uploader, restaurant_name: "Between the Buns", btb_created_by: null, btb_created_by_name: "Manager (shared workspace)", file_size: pdf.byteLength, expiry_date: null, doc_type: "other" });
  const documents = await request.get("/api/btb/documents?restaurant_name=Another%20restaurant");
  expect((await documents.json()).documents).toHaveLength(2);
  expect(await documents.text()).not.toContain("file_url");
  expect((await request.get(`/api/btb/documents?download=${foreignDocument.id}`)).status()).toBe(404);
  expect((await request.delete("/api/btb/documents", { data: { id: foreignDocument.id } })).status()).toBe(404);
  expect((await request.get(`/api/btb/marketing?download=${foreignPromotion.id}`)).status()).toBe(404);
  expect((await request.patch("/api/btb/marketing", { data: { id: foreignPromotion.id, status: "completed", previous_status: "active" } })).status()).toBe(409);
  expect((await request.delete("/api/btb/marketing", { data: { id: foreignPromotion.id } })).status()).toBe(404);
  expect((await request.delete("/api/btb/social-posts", { data: { id: foreignPost.id } })).status()).toBe(404);
  expect((await request.post("/api/btb/marketing", { data: { ...campaign, location_id: east } })).status()).toBe(400);
  const created = await request.post("/api/btb/marketing", { data: { ...campaign, user_id: foreignPromotion.user_id, restaurant_name: "Another restaurant" } });
  await expect(created).toBeOK();
  const id = (await created.json()).promotion.id;
  await expect(await request.patch("/api/btb/marketing", { data: { id, status: "active", previous_status: "planned" } })).toBeOK();
  expect((await request.patch("/api/btb/marketing", { data: { id, status: "completed", previous_status: "planned" } })).status()).toBe(409);
  const after = await fixture.state();
  expect(after.tables.marketing_promotions.find((row) => row.id === id)).toMatchObject({ user_id: uploader, restaurant_name: "Between the Buns", status: "active", file_url: null });
  expect(after.tables.business_documents.find((row) => row.id === foreignDocument.id)).toEqual(foreignDocument);
  expect(after.tables.marketing_promotions.find((row) => row.id === foreignPromotion.id)).toEqual(foreignPromotion);
  expect(after.tables.social_media_calendar.find((row) => row.id === foreignPost.id)).toEqual(foreignPost);
});

test("uploader connection failures retain browsing and recover after the profile is reconnected", async ({ page, fixture }) => {
  await fixture.configure({ failures: [{ table: "profiles", method: "GET", match: { id: `eq.${uploader}` }, times: 1 }] });
  await signInBtb(page, "manager", "/between-the-buns/documents");
  await expect(page.getByRole("article", { name: "BTB service standards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload document", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry uploader connection" }).click();
  await expect(page.getByRole("button", { name: "Upload document", exact: true })).toBeEnabled();
  const profiles = (await fixture.state()).tables.profiles;
  await fixture.configure({ tables: { profiles: profiles.map((profile) => profile.id === uploader ? { ...profile, restaurant_name: "Wrong restaurant" } : profile) } });
  await page.getByRole("button", { name: "Upload document", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upload document" });
  await dialog.getByLabel("Document name").fill("Retain while reconnecting");
  await dialog.getByLabel("File", { exact: true }).setInputFiles({ name: file.name, mimeType: "application/pdf", buffer: pdf });
  await dialog.getByRole("button", { name: "Upload document", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("configured BTB uploader profile is unavailable");
  await expect(dialog.getByLabel("Document name")).toHaveValue("Retain while reconnecting");
  await fixture.configure({ tables: { profiles } });
  await dialog.getByRole("button", { name: "Upload document", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Retain while reconnecting" })).toBeVisible();
  await fixture.configure({ failures: [{ table: "profiles", method: "GET", match: { id: `eq.${uploader}` }, times: 1 }] });
  await page.goto("/between-the-buns/marketing");
  await expect(page.getByRole("article", { name: "Burger special" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Promotion", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Caption", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry uploader connection" }).click();
  await expect(page.getByRole("button", { name: "Add Promotion", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Caption", { exact: true })).toBeEnabled();
});

test("upload validation rejects malformed files, oversized bodies and invalid campaign or social fields", async ({ request, fixture }) => {
  await apiSignIn(request);
  const initial = (await fixture.state()).tables.business_documents.length;
  for (const bad of [{ name: "malicious.html", url: "data:text/html;base64,YQ==" }, { ...file, url: "https://outside.example/file.pdf" }, { ...file, url: "data:application/pdf;base64,AB==" }, { ...file, name: "../file.pdf" }]) {
    expect((await request.post("/api/btb/documents", { data: { name: "Rejected", file: bad } })).status()).toBe(400);
  }
  const oversized = `data:application/pdf;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64")}`;
  expect((await request.post("/api/btb/documents", { data: { name: "Rejected", file: { ...file, url: oversized } } })).status()).toBe(413);
  expect((await request.post("/api/btb/documents", { data: "x".repeat(4_300_001) })).status()).toBe(413);
  for (const invalid of [{ month: 13 }, { year: "2026" }, { category: "invalid" }, { title: " " }, { person_name: "x".repeat(101) }]) {
    expect((await request.post("/api/btb/marketing", { data: { ...campaign, ...invalid } })).status()).toBe(400);
  }
  for (const invalid of [{ post_date: "2030-02-30" }, { day: 7 }, { channel: "Unknown" }, { caption: " " }]) {
    expect((await request.post("/api/btb/social-posts", { data: { ...social, ...invalid } })).status()).toBe(400);
  }
  expect((await fixture.state()).tables.business_documents).toHaveLength(initial);
  const dated = await request.post("/api/btb/social-posts", { data: { ...social, day: 6, post_date: "2030-11-05", user_id: randomUUID() } });
  await expect(dated).toBeOK();
  expect((await dated.json()).post.day).toBe(1);
});

test("document and marketing registers include every page without returning file payloads", async ({ request, fixture }) => {
  await apiSignIn(request);
  const state = await fixture.state();
  const doc = state.tables.business_documents.find((row) => row.restaurant_name === "Between the Buns")!;
  const promo = state.tables.marketing_promotions.find((row) => row.restaurant_name === "Between the Buns")!;
  const count = 1003;
  await fixture.configure({ tables: {
    business_documents: Array.from({ length: count }, (_, index) => ({ ...doc, id: randomUUID(), name: `SOP ${index}` })),
    marketing_promotions: Array.from({ length: count }, (_, index) => ({ ...promo, id: randomUUID(), title: `Campaign ${index}` })),
    social_media_calendar: Array.from({ length: count }, (_, index) => ({ ...social, id: randomUUID(), caption: `Post ${index}`, user_id: uploader, restaurant_name: "Between the Buns" })),
  } });
  const documents = await request.get("/api/btb/documents");
  await expect(documents).toBeOK();
  expect((await documents.json()).documents).toHaveLength(count);
  const marketing = await request.get("/api/btb/marketing");
  await expect(marketing).toBeOK();
  const body = await marketing.json();
  expect(body.promotions).toHaveLength(count);
  expect(body.posts).toHaveLength(count);
  expect(await documents.text()).not.toContain("file_url");
  expect(await marketing.text()).not.toContain("file_url");
});
