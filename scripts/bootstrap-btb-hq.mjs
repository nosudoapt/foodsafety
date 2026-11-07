#!/usr/bin/env node
// Create or repair a Between The Buns HQ sign-in (corporate or owner).
//
//   node scripts/bootstrap-btb-hq.mjs --email you@example.com --name "Your Name" \
//     --role owner --location <location-uuid>
//
// No password is ever invented: it prompts unless --password is passed. The
// email must already exist in btb_employees unless --create is given. The plan
// is printed and must be confirmed before anything is written. Only this
// person's employee, credential and location rows are touched.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { promisify } from "node:util";
import { stdin, stdout } from "node:process";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const scrypt = promisify(crypto.scrypt);

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  for (const file of [".env.local", ".env"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const match = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/);
      if (match) return match[1].replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password.slice(0, 128), salt, 64);
  return `scrypt:${salt}:${Buffer.from(key).toString("hex")}`;
}

const args = argsOf(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/bootstrap-btb-hq.mjs --email <email> --name <name> [--role owner|corporate] [--location <uuid>] [--password <secret>] [--create]");
  console.log("       node scripts/bootstrap-btb-hq.mjs --list    (show locations and employees)");
  process.exit(0);
}
const email = String(args.email ?? "").trim().toLowerCase();
const name = String(args.name ?? "").trim();
const role = String(args.role ?? "owner").trim();
const location = typeof args.location === "string" ? args.location : "";
const create = args.create === true;

const sql = postgres(dbUrl(), { prepare: false, ssl: "require", max: 1 });
if (args.list) {
  const places = await sql`SELECT s.location_id AS id, l.name, s.timezone, s.settings_confirmed FROM btb_location_settings s JOIN locations l ON l.id = s.location_id ORDER BY l.name`;
  console.table(places);
  const team = await sql`SELECT id, name, email, role, active, login_enabled FROM btb_employees ORDER BY name`;
  console.table(team);
  await sql.end();
  process.exit(0);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Pass a valid --email.");
if (!name) throw new Error("Pass the person's --name.");
if (role !== "owner" && role !== "corporate") throw new Error("Only --role owner or --role corporate is HQ access.");
const rl = readline.createInterface({ input: stdin, output: stdout });
try {
  const [existing] = await sql`SELECT id, name, role, active, login_enabled FROM btb_employees WHERE restaurant_name = 'Between the Buns' AND email = ${email}`;
  if (!existing && !create) throw new Error(`No employee with ${email}. Re-run with --create to add one, or correct the email.`);
  if (location) {
    const [place] = await sql`SELECT id, name FROM locations WHERE id = ${location}`;
    if (!place) throw new Error(`No location ${location}.`);
  }

  let password = typeof args.password === "string" ? args.password : "";
  if (!password) password = (await rl.question("Password for this person (12-128 chars, input is shown): ")).trim();
  if (password.length < 10 || password.length > 128) throw new Error("Password must be 10-128 characters.");

  console.log("\nPlan:");
  if (existing) console.log(`- Update employee ${existing.name} <${email}>: role ${existing.role} -> ${role}, active + login_enabled = true, reset password and session version.`);
  else console.log(`- Create employee <${email}> (${name}) with role ${role}.`);
  if (location) console.log(`- Grant this person access to location ${location}.`);
  console.log("- No other employee, credential or business row is modified.");

  const answer = (await rl.question("Type CONFIRM to apply: ")).trim();
  if (answer !== "CONFIRM") { console.log("Cancelled."); await sql.end(); process.exit(1); }

  const hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    const [saved] = existing
      ? await tx`UPDATE btb_employees SET name = ${name || existing.name}, role = ${role}, active = true, login_enabled = true WHERE id = ${existing.id} RETURNING id`
      : await tx`INSERT INTO btb_employees (restaurant_name, name, email, role, active, login_enabled) VALUES ('Between the Buns', ${name}, ${email}, ${role}, true, true) RETURNING id`;
    await tx`INSERT INTO btb_employee_credentials (employee_id, password_hash, session_version) VALUES (${saved.id}, ${hash}, 1)
      ON CONFLICT (employee_id) DO UPDATE SET password_hash = excluded.password_hash, session_version = btb_employee_credentials.session_version + 1, updated_at = now()`;
    if (location) await tx`INSERT INTO btb_location_access (location_id, employee_id) VALUES (${location}, ${saved.id}) ON CONFLICT DO NOTHING`;
  });
  console.log(`\nDone: ${email} may sign in at /between-the-buns/login with ${role} access.`);
} finally {
  rl.close();
  await sql.end();
}
