#!/usr/bin/env node
// Migration runner: applies supabase/*.sql in manifest order, records what ran
// in the `_migrations` table, and refuses to double-apply an edited file.
//
//   npm run db:migrate            apply everything pending
//   npm run db:migrate:dry        show the plan, change nothing
//   npm run db:migrate:status     applied / pending table
//   npm run db:migrate:step -- 16 apply up to step 16
//
// Needs SUPABASE_DB_URL (Superuser connection string, NOT the anon key) in
// .env.local — see .env.example. SQL files are executed as one statement
// batch, so a failure rolls the whole file back.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  lineNumberFor,
  parseArgs,
  plan,
  readEnvFile,
  renderTable,
  sha256,
  statusRows,
  validateManifest,
} from "./migrate-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "supabase", "migrations.json");
const SQL_DIR = path.join(ROOT, "supabase");

const color = (code, text) =>
  process.stdout.isTTY && !process.env.NO_COLOR ? `\u001b[${code}m${text}\u001b[0m` : String(text);
const bold = (t) => color("1", t);
const dim = (t) => color("2", t);
const green = (t) => color("32", t);
const red = (t) => color("31", t);
const yellow = (t) => color("33", t);
const cyan = (t) => color("36", t);

const USAGE = `
${bold("supabase migration runner")}

  node scripts/migrate.mjs [flags]

  --dry-run          print the plan, don't touch the database
  --status           applied / pending table
  --step <N>         only steps up to and including N
  --baseline <N>     mark steps 1..N as applied without executing them
                     (adopt an existing database; next run applies N+1..)
  --force            re-run steps even if they're recorded as applied
  --allow-prod       required to apply when NODE_ENV=production
  -h, --help         this text

  ${dim("npm run db:migrate            apply everything pending")}
  ${dim("npm run db:migrate:dry        preview")}
  ${dim("npm run db:migrate:status     what's applied")}
  ${dim("npm run db:migrate:step -- 16 apply up to step 16")}
`;

function fail(message, hint) {
  console.error(`\n${red("❌")} ${message}`);
  if (hint) console.error(dim(hint));
  process.exit(1);
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) fail(`Missing manifest: ${MANIFEST_PATH}`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (err) {
    fail(`supabase/migrations.json is not valid JSON: ${err.message}`);
  }
  const { steps, errors } = validateManifest(manifest, SQL_DIR);
  if (errors.length) {
    console.error(`\n${red("❌")} manifest problems:`);
    for (const e of errors) console.error(`   • ${e}`);
    process.exit(1);
  }
  // Checksums are taken from the files on disk right now.
  return steps.map((s) => ({
    ...s,
    checksum: sha256(fs.readFileSync(path.join(SQL_DIR, s.file), "utf8")),
  }));
}

async function openDb(url) {
  const sql = postgres(url, {
    onnotice: () => {},
    connect_timeout: 15,
    idle_timeout: 20,
    max: 1,
  });
  // Round-trip now so a bad URL fails before we print a plan that lies.
  await sql`select 1`;
  return sql;
}

async function ensureMigrationsTable(sql) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      step INTEGER NOT NULL,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      duration_ms INTEGER
    )
  `);
}

async function loadApplied(sql) {
  try {
    const rows = await sql`
      select step, filename, checksum, applied_at, duration_ms
      from _migrations
      order by step
    `;
    return new Map(rows.map((r) => [r.filename, r]));
  } catch (err) {
    // 42P01 = relation "_migrations" does not exist → nothing applied yet.
    // Any other failure must surface: guessing "nothing applied" would re-run
    // every step against a database we can't actually read.
    if (err?.code === "42P01" || String(err?.message ?? "").includes("_migrations")) return new Map();
    throw err;
  }
}

async function applyEntry(sql, entry) {
  const file = path.join(SQL_DIR, entry.file);
  const text = fs.readFileSync(file, "utf8");
  const started = Date.now();
  // One string, no parameters → Postgres simple-query protocol → the whole
  // file runs as a single implicit transaction and rolls back on any error.
  await sql.unsafe(text);
  const duration = Date.now() - started;
  await sql`
    insert into _migrations (step, filename, checksum, duration_ms)
    values (${entry.step}, ${entry.file}, ${entry.checksum}, ${duration})
    on conflict (filename)
    do update set step = excluded.step,
                  checksum = excluded.checksum,
                  applied_at = now(),
                  duration_ms = excluded.duration_ms
  `;
  return duration;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail(err.message, "node scripts/migrate.mjs --help");
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }

  // .env.local (Next's file) + .env, without a dotenv dependency.
  for (const name of [".env.local", ".env"]) {
    const values = readEnvFile(path.join(ROOT, name));
    for (const [k, v] of Object.entries(values)) if (process.env[k] === undefined) process.env[k] = v;
  }

  const steps = loadManifest();
  const url = process.env.SUPABASE_DB_URL;

  if (!url) {
    // --dry-run works offline (everything reads as pending); anything that
    // touches the database refuses loudly instead of half-working.
    if (args.dryRun) {
      // Preview works offline: everything shows as pending (unverified).
      printPlan(plan({ steps, applied: new Map(), force: args.force, maxStep: args.step }), steps);
      console.log(dim("\nNo SUPABASE_DB_URL set — showing every step as pending (status unverified)."));
      return;
    }
    fail(
      "SUPABASE_DB_URL is not set.",
      "Copy it from Supabase Dashboard → Project Settings → Database → Connection String → URI\n" +
        "   and put it in .env.local (see .env.example).",
    );
  }

  if (!args.dryRun && !args.status && process.env.NODE_ENV === "production" && !args.allowProd) {
    fail(
      "NODE_ENV=production — refusing to apply migrations without --allow-prod.",
      "Run from a dev machine, or re-run with --allow-prod if you really mean it.",
    );
  }

  let sql = null;
  const cleanup = async (code) => {
    if (sql) {
      try {
        await sql.end({ timeout: 5 });
      } catch {
        /* connection already gone */
      }
    }
    process.exit(code);
  };
  process.on("SIGINT", () => {
    console.log(`\n${yellow("⚠️")} interrupted — any in-flight file rolls back with its transaction.`);
    cleanup(130);
  });

  sql = await openDb(url).catch((err) => fail(`Can't connect to Postgres: ${err.message}`));

  if (args.status) {
    await ensureMigrationsTable(sql).catch(() => {});
    const applied = await loadApplied(sql);
    const rows = statusRows(steps, applied);
    const icon = (s) => (s === "applied" ? green("✅ applied") : yellow("⏸️  pending"));
    console.log(
      renderTable(
        ["STEP", "STATUS", "APPLIED AT", "DURATION", "FILE"],
        rows.map((r) => [r.step, icon(r.applied), r.appliedAt, r.duration, r.file]),
      ),
    );
    const pending = rows.filter((r) => r.applied === "pending");
    console.log(
      pending.length
        ? `\n${pending.length} pending → ${bold("npm run db:migrate")}`
        : `\n${green("All steps applied.")}`,
    );
    await cleanup(0);
    return;
  }

  await ensureMigrationsTable(sql);

  if (args.baseline !== null) {
    const targets = steps.filter((s) => s.step <= args.baseline);
    if (targets.length === 0) {
      console.error(`\n${red("❌")} --baseline ${args.baseline} matches no manifest step.`);
      await cleanup(1);
      return;
    }
    const already = await loadApplied(sql);
    let recorded = 0;
    for (const s of targets) {
      if (already.has(s.file)) continue;
      await sql`
        insert into _migrations (step, filename, checksum, duration_ms)
        values (${s.step}, ${s.file}, ${s.checksum}, 0)
        on conflict (filename) do nothing
      `;
      recorded++;
    }
    console.log(
      `${green("📌")} baseline: steps ${targets[0].step}–${targets[targets.length - 1].step} ` +
        `marked applied (${recorded} new, ${targets.length - recorded} already recorded) — nothing executed.`,
    );
    const next = steps.filter((s) => s.step > args.baseline);
    if (next.length) console.log(dim(`   next pending: step ${next[0].step} (${next[0].file})`));
    await cleanup(0);
    return;
  }

  const applied = await loadApplied(sql);
  const entries = plan({ steps, applied, force: args.force, maxStep: args.step });

  if (args.dryRun) {
    printPlan(entries, steps);
    await cleanup(0);
    return;
  }

  const toRun = entries.filter((e) => e.action === "apply");
  const problems = entries.filter((e) => e.action === "error");
  if (problems.length) {
    for (const p of problems) console.log(`${red("❌")} step ${p.step}: ${p.file} — ${dim(p.reason)}`);
    if (!args.force) {
      console.error(`\n${red("❌")} refusing to continue past an edited migration.`);
      console.error(dim("   Restore the original file, or re-run with --force."));
      await cleanup(1);
      return;
    }
  }
  if (toRun.length === 0) {
    console.log(`${green("✅")} nothing to do — ${bold(String(steps.length))} steps are already applied.`);
    await cleanup(0);
    return;
  }

  console.log(
    dim(`Running ${toRun.length} of ${steps.length} step(s)${args.step ? ` (up to --step=${args.step})` : ""}…\n`),
  );

  for (const entry of entries) {
    if (entry.action === "skip") {
      console.log(`${dim("⏭️ ")} ${dim(`step ${entry.step}: ${entry.file} (already applied)`)}`);
      continue;
    }
    if (entry.action === "defer") continue;
    if (entry.action === "error") {
      console.log(`${red("❌")} step ${entry.step}: ${entry.file} — ${dim(entry.reason)}`);
      continue;
    }
    console.log(`${cyan("→")}  ${bold(entry.file)} ${dim(`(step ${entry.step})`)}`);
    try {
      const ms = await applyEntry(sql, entry);
      console.log(`${green("✅")} step ${entry.step}: ${entry.file} ${dim(`(${ms}ms)`)}`);
    } catch (err) {
      const line = lineNumberFor(fs.readFileSync(path.join(SQL_DIR, entry.file), "utf8"), err.position);
      console.log(`${red("❌")} step ${entry.step}: ${entry.file}${line ? ` around line ${line}` : ""}`);
      console.log(`   ${red(err.message)}`);
      if (err.hint) console.log(`   ${dim(`hint: ${err.hint}`)}`);
      console.log(dim("   the file's transaction was rolled back; fix it and re-run."));
      await cleanup(1);
    }
  }

  console.log(`\n${green("✅")} done — ${bold(String(toRun.length))} step(s) applied.`);
  await cleanup(0);
}

function printPlan(entries, steps) {
  const mark = (a) =>
    a === "apply"
      ? green("▶  will apply")
      : a === "skip"
        ? dim("⏭️  skipped")
        : a === "error"
          ? red("❌  blocked")
          : yellow("⏸️  deferred");
  console.log(
    renderTable(
      ["STEP", "PLAN", "FILE", "WHY"],
      entries.map((e) => [e.step, mark(e.action), e.file, e.reason]),
    ),
  );
  const counts = entries.reduce((acc, e) => ((acc[e.action] = (acc[e.action] ?? 0) + 1), acc), {});
  console.log(
    `\n${bold(String(counts.apply ?? 0))} to apply · ${counts.skip ?? 0} already applied · ${
      counts.defer ?? 0
    } deferred · ${counts.error ?? 0} blocked ${dim(`(${steps.length} steps total)`)}`,
  );
}

main().catch(async (err) => {
  console.error(`\n${red("❌")} ${err?.message ?? err}`);
  process.exit(1);
});
