import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, signInFoodSafe } from "./fixtures";
import type * as Queue from "../src/lib/offline-queue";

declare global {
  interface Window {
    offlineTest: typeof Queue;
    offlineSendCount: number;
    offlineSendStarted: boolean;
    releaseOfflineSend: () => void;
    offlineDrain: Promise<Queue.DrainResult>;
  }
}

async function installQueue(page: Page) {
  await page.goto("/auth/sign-in");
  const code = readFileSync(join(process.cwd(), ".test-dist/src/lib/offline-queue.js"), "utf8");
  await page.evaluate((source) => {
    const exports = {}; new Function("exports", source)(exports);
    window.offlineTest = exports as typeof Queue; window.offlineSendCount = 0;
  }, code);
}

async function retained(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("foodsafe-offline");
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ id: string; attempts: number; sequence?: number; replayKey?: string; state?: string; label: string; payload: Record<string, unknown> }[]>((resolve, reject) => {
        const request = db.transaction("ops").objectStore("ops").getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
}

test("OFF-02: a real temperature form retains exhausted gateway failures across page close and offers export/retry", async ({ page, context, fixture }) => {
  await signInFoodSafe(page, "manager", "/temperatures");
  await fixture.configure({ failures: [{ table: "btb_insert_temp_record", method: "POST", status: 503, times: -1 }] });
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
  await fixture.configure({ failures: [{ table: "btb_insert_temp_record", method: "POST", status: 503, times: -1 }] });
  const code = readFileSync(join(process.cwd(), ".test-dist/src/lib/offline-queue.js"), "utf8");
  await page.evaluate(async (source) => {
    const exports = {} as typeof import("../src/lib/offline-queue"); new Function("exports", source)(exports);
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

test("OFF-03 / OFF-04 / OFF-05: distinct Chromium tabs serialize mutations and drains without losing in-flight captures", async ({ page, context }) => {
  const tab = await context.newPage(); await installQueue(page); await installQueue(tab);
  await Promise.all([page.evaluate(async () => {
    const q = window.offlineTest, store = q.idbStore();
    await Promise.all(Array.from({ length: 20 }, (_, i) => q.enqueue(store, { ...q.newOp("temp_record", `Tab A ${i}`, { i }), id: `tab-a-${i}` })));
  }), tab.evaluate(async () => {
    const q = window.offlineTest, store = q.idbStore();
    await Promise.all(Array.from({ length: 20 }, (_, i) => q.enqueue(store, { ...q.newOp("temp_record", `Tab B ${i}`, { i }), id: `tab-b-${i}` })));
  })]);
  expect(await retained(page)).toHaveLength(40);
  const counts = await Promise.all([page.evaluate(async () => {
    const q = window.offlineTest; await q.drain(q.idbStore(), async () => { window.offlineSendCount++; }); return window.offlineSendCount;
  }), tab.evaluate(async () => {
    const q = window.offlineTest; await q.drain(q.idbStore(), async () => { window.offlineSendCount++; }); return window.offlineSendCount;
  })]);
  expect(counts.reduce((sum, value) => sum + value, 0)).toBe(40); expect(await retained(page)).toHaveLength(0);
  await page.evaluate(async () => {
    const q = window.offlineTest, store = q.idbStore(); await q.enqueue(store, { ...q.newOp("temp_record", "In flight", {}), id: "in-flight" });
    window.offlineDrain = q.drain(store, async () => {
      window.offlineSendStarted = true; await new Promise<void>(resolve => { window.releaseOfflineSend = resolve; });
    });
  });
  await expect.poll(() => page.evaluate(() => window.offlineSendStarted)).toBe(true);
  await tab.evaluate(async () => { const q = window.offlineTest; await q.enqueue(q.idbStore(), { ...q.newOp("temp_record", "Captured during send", {}), id: "during-send" }); });
  await page.evaluate(async () => { window.releaseOfflineSend(); await window.offlineDrain; });
  expect((await retained(tab)).map(op => op.id)).toEqual(["during-send"]);
});

test("OFF-06: a lost acknowledgement after commit replays the same key without duplicating the reading", async ({ page, fixture }) => {
  await signInFoodSafe(page, "manager", "/temperatures");
  // The write commits on the server, but the acknowledgement never reaches the
  // tablet — the exact moment a naive queue would double-write the reading.
  await fixture.configure({ failures: [{ table: "btb_insert_temp_record", method: "POST", times: 1, afterCommit: true, status: 500, message: "Saved, but the response was lost (test fixture)" }] });
  await page.getByRole("button", { name: "Add Record" }).click();
  await page.getByPlaceholder("e.g. Fridge 1, Oven, Hot holding unit").fill("OFF-06 captured cooler");
  await page.locator("form select").nth(1).selectOption("Fridge - Dairy");
  await page.getByPlaceholder("e.g. 4.5").fill("2");
  await page.getByRole("button", { name: "Save Record", exact: true }).click();
  await expect.poll(async () => (await fixture.state()).tables.temperature_records.filter((row) => row.equipment_name === "OFF-06 captured cooler").length).toBe(1);
  await expect(page.getByRole("region", { name: "Offline records" })).toContainText("1 record stored on this device");
  const pending = await retained(page);
  expect(String(pending[0].replayKey)).toMatch(/^[0-9a-f]{64}$/);

  // Reload: the drain retries the exact same key. The receipt acknowledges the
  // original commit, so no second reading is written and none is duplicated.
  await page.reload();
  await expect.poll(async () => (await retained(page)).length).toBe(0);
  await expect(page.getByRole("region", { name: "Offline records" })).toHaveCount(0);
  const tables = (await fixture.state()).tables;
  expect(tables.temperature_records.filter((row) => row.equipment_name === "OFF-06 captured cooler")).toHaveLength(1);
  expect(tables.btb_offline_receipts).toHaveLength(1);
  expect(String(tables.btb_offline_receipts[0].kind)).toBe("temp_record");
});

test("OFF-08: IndexedDB upgrade retains legacy payloads and the logical counter survives empty-queue reload and clock rollback", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.evaluate(async () => {
    const request = indexedDB.open("foodsafe-offline", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("ops", { keyPath: "id" });
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("ops", "readwrite"), store = tx.objectStore("ops");
    store.put({ id: "legacy-a", kind: "temp_record", attempts: 0, created_at: "2099-01-01", label: "Legacy A", payload: { temperature: 2 } });
    store.put({ id: "legacy-b", kind: "temp_record", attempts: 0, created_at: "1990-01-01", label: "Legacy B", payload: { temperature: 3 } });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  await installQueue(page);
  const upgraded = await page.evaluate(async () => window.offlineTest.idbStore().read());
  expect(upgraded.map(op => op.payload)).toEqual([{ temperature: 2 }, { temperature: 3 }]);
  expect(upgraded.map(op => op.created_at)).toEqual(["2099-01-01", "1990-01-01"]);
  expect(upgraded.map(op => op.sequence)).toEqual([1, 2]);
  const first = await page.evaluate(async () => {
    const q = window.offlineTest, store = q.idbStore(); await q.drain(store, async () => {});
    await q.enqueue(store, q.newOp("temp_record", "Before empty reload", {}));
    const sequence = (await store.read())[0].sequence!; await q.drain(store, async () => {}); return sequence;
  });
  await installQueue(page);
  const next = await page.evaluate(async () => {
    const q = window.offlineTest, store = q.idbStore();
    await q.enqueue(store, { ...q.newOp("temp_record", "First capture", {}, new Date("2099-01-01")), id: "logical-first" });
    await q.enqueue(store, { ...q.newOp("temp_record", "Clock rollback", {}, new Date("1990-01-01")), id: "logical-second" });
    const minimum = Math.min(...(await store.read()).map(op => op.sequence!)), order: string[] = [];
    await q.drain(store, async op => { order.push(op.id); }); return { minimum, order };
  });
  expect(next.minimum).toBeGreaterThan(first); expect(next.order).toEqual(["logical-first", "logical-second"]);
});
