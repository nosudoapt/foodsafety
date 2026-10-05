// Tests for the SQL migration runner's pure logic. No database is touched —
// everything here runs against the manifest and fixtures on disk.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  lineNumberFor,
  parseArgs,
  plan,
  readEnvFile,
  renderTable,
  sha256,
  statusRows,
  validateManifest,
} from "../scripts/migrate-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_DIR = path.join(ROOT, "supabase");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(SQL_DIR, "migrations.json"), "utf8"));

const step = (over = {}) => ({
  step: 1,
  file: "schema.sql",
  description: "demo",
  checksum: "aaa",
  alwaysRun: false,
  ...over,
});

test("checksums are stable, CRLF-safe and content-sensitive", () => {
  assert.match(sha256("select 1;"), /^[0-9a-f]{64}$/);
  assert.equal(sha256("select 1;"), sha256("select 1;"), "same content → same hash");
  assert.equal(sha256("a\r\nb"), sha256("a\nb"), "Windows checkout must not look like an edit");
  assert.notEqual(sha256("select 1;"), sha256("select  1;"), "an edit is an edit");
});

test("flags parse in both spellings and typos are fatal", () => {
  assert.deepEqual(parseArgs([]), {
    dryRun: false,
    status: false,
    force: false,
    allowProd: false,
    help: false,
    step: null,
    baseline: null,
  });
  assert.equal(parseArgs(["--dry-run"]).dryRun, true);
  assert.equal(parseArgs(["--step=16"]).step, 16);
  assert.equal(parseArgs(["--step", "16"]).step, 16);
  assert.equal(parseArgs(["--baseline", "15"]).baseline, 15);
  assert.equal(parseArgs(["--baseline=15", "--step=22"]).baseline, 15);
  assert.equal(parseArgs(["--baseline=15", "--step=22"]).step, 22);
  assert.equal(parseArgs(["--status", "--force", "--allow-prod"]).status, true);
  assert.equal(parseArgs(["-h"]).help, true);
  assert.throws(() => parseArgs(["--dry-runn"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--step", "abc"]), /positive integer/);
  assert.throws(() => parseArgs(["--step", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--baseline", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--baseline"]), /needs a number/);
  assert.throws(() => parseArgs(["--step"]), /needs a number/);
});

test("the real manifest is valid: files exist, steps unique and ascending", () => {
  const { steps, errors } = validateManifest(MANIFEST, SQL_DIR);
  assert.deepEqual(errors, [], errors.join("; "));
  assert.ok(steps.length >= 23, `expected the full history, got ${steps.length}`);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].step > steps[i - 1].step, `step ${steps[i].step} out of order`);
  }
  assert.equal(new Set(steps.map((s) => s.file)).size, steps.length, "no file twice");
  for (const s of steps) {
    assert.ok(fs.existsSync(path.join(SQL_DIR, s.file)), `${s.file} missing from supabase/`);
  }
});

test("manifest steps match the numbers published in supabase/README.md", () => {
  const readme = new Map();
  for (const line of fs.readFileSync(path.join(SQL_DIR, "README.md"), "utf8").split("\n")) {
    const m = /^\| (\d+) \| `([^`]+)` \|/.exec(line);
    if (m) readme.set(Number(m[1]), m[2]);
  }
  assert.ok(readme.size >= 22, "README table not found");

  const { steps } = validateManifest(MANIFEST, SQL_DIR);
  for (const s of steps) {
    if (s.file === "seed-demo.sql") continue; // seeded file, not in the README table
    assert.equal(readme.get(s.step), s.file, `step ${s.step} disagrees with README`);
  }
  // Every numbered README row is actually runnable from the manifest.
  for (const [stepNo, file] of readme) {
    const entry = steps.find((s) => s.step === stepNo);
    assert.ok(entry, `README step ${stepNo} (${file}) has no manifest entry`);
    assert.equal(entry.file, file);
  }
});

test("plan: new runs, unchanged skips, edited-after-apply blocks", () => {
  const steps = [step({ step: 1, file: "a.sql", checksum: "v1" })];

  const fresh = plan({ steps, applied: new Map() });
  assert.equal(fresh[0].action, "apply");
  assert.equal(fresh[0].reason, "not applied yet");

  const same = plan({ steps, applied: new Map([["a.sql", { checksum: "v1" }]]) });
  assert.equal(same[0].action, "skip");

  const edited = plan({ steps, applied: new Map([["a.sql", { checksum: "v0" }]]) });
  assert.equal(edited[0].action, "error");
  assert.match(edited[0].reason, /changed after it was applied/);

  const forced = plan({ steps, applied: new Map([["a.sql", { checksum: "v0" }]]), force: true });
  assert.equal(forced[0].action, "apply", "--force is the escape hatch");
});

test("plan: alwaysRun re-executes, --step defers the tail", () => {
  const steps = [
    step({ step: 1, file: "a.sql", checksum: "v1" }),
    step({ step: 2, file: "seed.sql", checksum: "v1", alwaysRun: true }),
    step({ step: 3, file: "b.sql", checksum: "v1" }),
  ];
  const applied = new Map([
    ["a.sql", { checksum: "v1" }],
    ["seed.sql", { checksum: "v1" }],
    ["b.sql", { checksum: "v1" }],
  ]);

  const result = plan({ steps, applied });
  assert.deepEqual(
    result.map((r) => [r.file, r.action]),
    [
      ["a.sql", "skip"],
      ["seed.sql", "apply"],
      ["b.sql", "skip"],
    ],
    "alwaysRun beats 'already applied'",
  );
  assert.equal(result[1].reason, "alwaysRun");

  const capped = plan({ steps, applied: new Map(), maxStep: 2 });
  assert.deepEqual(
    capped.map((r) => r.action),
    ["apply", "apply", "defer"],
    "--step 2 stops before step 3",
  );
  assert.match(capped[2].reason, /--step=2/);
});

test("error positions translate to file line numbers", () => {
  const sql = "select 1;\nselect 2;\nselect bad from t;";
  assert.equal(lineNumberFor(sql, 1), 1);
  assert.equal(lineNumberFor(sql, sql.indexOf("bad") + 1), 3);
  assert.equal(lineNumberFor(sql, null), null, "no position → no line");
  assert.equal(lineNumberFor(sql, "not-a-number"), null);
});

test(".env.local loader handles comments, quotes and export", () => {
  const file = path.join(os.tmpdir(), `foodsafety-env-${process.pid}.txt`);
  fs.writeFileSync(
    file,
    ["# comment", "", "PLAIN=value", "export EXPORTED=yes", 'QUOTED="with spaces"', "EMPTY=", "NOEQUALS", "=orphan"].join(
      "\n",
    ),
  );
  const env = readEnvFile(file);
  fs.unlinkSync(file);
  assert.deepEqual(env, { PLAIN: "value", EXPORTED: "yes", QUOTED: "with spaces", EMPTY: "" });
  assert.deepEqual(readEnvFile(path.join(os.tmpdir(), "does-not-exist-xyz")), {}, "missing file is empty");
});

test("status rows and tables render what --status prints", () => {
  const steps = [step({ step: 1, file: "a.sql" }), step({ step: 2, file: "b.sql" })];
  const applied = new Map([["a.sql", { checksum: "x", applied_at: "2026-10-05T10:23:00.000Z", duration_ms: 12 }]]);
  const rows = statusRows(steps, applied);
  assert.equal(rows[0].applied, "applied");
  assert.equal(rows[0].duration, "12ms");
  assert.equal(rows[1].applied, "pending");
  assert.equal(rows[1].appliedAt, "—");

  const table = renderTable(["STEP", "FILE"], rows.map((r) => [r.step, r.file]));
  const lines = table.split("\n");
  assert.equal(lines.length, 4, "header + rule + 2 rows");
  assert.equal(lines[0].startsWith("STEP"), true);
  assert.equal(
    table,
    ["STEP  FILE", "----  -----", "1     a.sql", "2     b.sql"].join("\n"),
    "columns line up, trailing padding trimmed",
  );
});
