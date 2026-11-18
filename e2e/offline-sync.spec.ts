import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, signInFoodSafe } from "./fixtures";

async function retained(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("foodsafe-offline");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ id: string; attempts: number; state?: string; label: string; payload: Record<string, unknown> }[]>((resolve, reject) => {
        const request = db.transaction("ops").objectStore("ops").getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

test("OFF-02: a real temperature form retains exhausted gateway failures across page close and offers export/retry", async ({ page, context, fixture }) => {
  await signInFoodSafe(page, "manager", "/temperatures");
  await fixture.configure({ failures: [{ table: "temperature_records", method: "POST", status: 503, times: -1 }] });
  await page.getByRole("button", { name: "Add Record" }).click();
  await page.getByPlaceholder("e.g. Fridge 1, Oven, Hot holding unit").fill("OFF-02 retained cooler");
  await page.locator("form select").nth(1).selectOption("Fridge - Dairy");
  await page.getByPlaceholder("e.g. 4.5").fill("2");
  await page.getByRole("button", { name: "Save Record", exact: true }).click();
  await expect(page.getByRole("region", { name: "Offline records" })).toContainText("1 record stored on this device");
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => (await retained(page))[0]?.attempts).toBe(attempt);
  }
  const before = (await retained(page))[0]; expect(before.state).toBe("dead_letter");
  await expect(page.getByRole("region", { name: "Offline records" }).getByRole("alert")).toContainText("Nothing has been discarded");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export retained records" }).click();
  const path = await (await download).path(); expect(path).not.toBeNull();
  expect(JSON.parse(readFileSync(path!, "utf8")).operations[0].payload).toEqual(before.payload);
  await page.close(); const reloaded = await context.newPage(); await reloaded.goto("/temperatures");
  await expect(reloaded.getByRole("region", { name: "Offline records" }).getByRole("alert")).toContainText("Nothing has been discarded");
  expect((await retained(reloaded))[0].id).toBe(before.id);
  await fixture.configure({ failures: [] });
  await reloaded.getByRole("button", { name: "Retry retained records" }).click();
  await expect.poll(async () => (await retained(reloaded)).length).toBe(0);
  expect((await fixture.state()).tables.temperature_records.filter(row => row.equipment_name === "OFF-02 retained cooler")).toHaveLength(1);
});

test("OFF-01: real IndexedDB overflow remains visible and every captured payload is exportable", async ({ page, fixture }) => {
  await signInFoodSafe(page, "manager", "/temperatures");
  await fixture.configure({ failures: [{ table: "temperature_records", method: "POST", status: 503, times: -1 }] });
  const code = readFileSync(join(process.cwd(), ".test-dist/src/lib/offline-queue.js"), "utf8");
  await page.evaluate(async (source) => {
    const exports: Record<string, Function> = {}; new Function("exports", source)(exports);
    const store = exports.idbStore();
    for (let index = 0; index < 51; index++) await exports.enqueue(store, exports.newOp("temp_record", `Overflow capture ${index}`, { temperature: index }));
  }, code);
  await page.reload();
  await expect(page.getByRole("region", { name: "Offline records" })).toContainText("51 records stored on this device");
  const ops = await retained(page); expect(ops).toHaveLength(51);
  expect(ops.filter(op => op.state === "dead_letter")).toHaveLength(1);
  await page.getByText("View retained records", { exact: true }).click();
  const notice = page.getByRole("region", { name: "Offline records" });
  await expect(notice).toContainText("Overflow capture 0"); await expect(notice).toContainText("Overflow capture 50");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export retained records" }).click();
  const path = await (await download).path(); expect(path).not.toBeNull();
  expect(JSON.parse(readFileSync(path!, "utf8")).operations).toHaveLength(51);
});
