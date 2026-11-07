#!/usr/bin/env node
// Set the credential for an EXISTING Between The Buns employee and verify the
// exact login path the app uses (scrypt, 64 bytes, 16-hex salt).
//
//   node scripts/set-btb-password.mjs --email you@example.com --role owner
//
// Prompts for the password (never echoes it), never prints it, and can only
// update btb_employee_credentials - not employees or business data.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { promisify } from "node:util";
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
  throw new Error("SUPABASE_DB_URL is missing from .env.local");
}

// Keep byte-for-byte in step with src/lib/btb-passwords.ts.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password.slice(0, 128), salt, 64);
  return `scrypt:${salt}:${Buffer.from(key).toString("hex")}`;
}

async function verify(password, encoded) {
  const parts = String(encoded ?? "").split(":");
  const valid = parts.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  const salt = valid ? parts[1] : "00000000000000000000000000000000";
  const expected = Buffer.from(valid ? parts[2] : "0".repeat(128), "hex");
  const actual = await scrypt(password.slice(0, 128), salt, 64);
  if (!valid) return false;
  let same = actual.length === expected.length;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return same && diff === 0;
}

const args = argsOf(process.argv.slice(2));
const email = String(args.email ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Pass a valid --email.");

const sql = postgres(dbUrl(), { prepare: false, ssl: "require", max: 1 });
const noise = [0, 1];
for (const index of noise) index;
try {
  const [employee] = await sql`SELECT id, name, role, active, login_enabled FROM btb_employees WHERE restaurant_name = 'Between the Buns' AND email = ${email}`;
  if (!employee) throw new Error(`No employee with ${email}. Run bootstrap-btb-hq.mjs --create instead.`);
  if (!employee.active) throw new Error("That employee is inactive.");
  let password = "";
  if (process.stdin.isTTY) {
    const { stdout } = process;
    stdout.write(`Password for ${employee.name} <${email}>: `);
    process.stdin.setRawMode(true);
    password = await new Promise((resolve) => {
      const onData = (buffer) => {
        const text = String(buffer);
        if (text.includes("\r") || text.includes("\n")) { process.stdin.setRawMode(false); process.stdin.off("data", onData); stdout.write("\n"); resolve(password); }
        else if (text === "\u0003") process.exit(1);
        else password += text;
      };
      process.stdin.on("data", onData);
    });
    process.stdin.pause();
  } else {
    password = (await new Promise((resolve) => { let data = ""; process.stdin.on("data", (chunk) => { data += chunk; }); process.stdin.on("end", () => resolve(data)); })).split("\n")[0];
  }
  password = password.trim();
  if (password.length < 10 || password.length > 128) throw new Error("Password must be 10-128 characters.");
  const hash = await hashPassword(password);
  if (!(await verify(password, hash))) throw new Error("Hash verification failed; nothing written.");
  await sql`INSERT INTO btb_employee_credentials (employee_id, password_hash, session_version) VALUES (${employee.id}, ${hash}, 1)
    ON CONFLICT (employee_id) DO UPDATE SET password_hash = excluded.password_hash, session_version = btb_employee_credentials.session_version + 1, updated_at = now()`;
  console.log(`Credential set for ${employee.name} <${email}>. Sign-in is enabled now.`);
} finally {
  await sql.end();
}
