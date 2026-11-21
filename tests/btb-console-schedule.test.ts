import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Console invitations share the btb_email_jobs outbox, which only
// /api/cron/btb-daily-reports drains. If that schedule disappears, invites sit
// at "pending" forever even though the console reports success.
test("the BTB email outbox is scheduled alongside licence reminders", () => {
  const config = JSON.parse(readFileSync(join(__dirname, "../..", "vercel.json"), "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };
  const paths = (config.crons ?? []).map((cron) => cron.path);
  assert.ok(paths.includes("/api/cron/btb-licence-reminders"), "licence reminders stay scheduled");
  assert.ok(paths.includes("/api/cron/btb-daily-reports"), "the outbox drain must be scheduled for invites");
  for (const cron of config.crons ?? []) assert.match(cron.schedule, /^\S+ \S+ \S+ \S+ \S+$/, cron.path);
});
