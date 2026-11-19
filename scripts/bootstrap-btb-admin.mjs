#!/usr/bin/env node
// FIRST console admin only. Never seeds, resets or modifies employee accounts.
// User-run after the console migrations; this script is not part of deployment.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { Writable } from "node:stream";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import postgres from "postgres";
import { readEnvFile } from "./migrate-lib.mjs";
import { parseBootstrapArgs, bootstrapIdentity } from "./bootstrap-btb-admin-lib.mjs";

const args = parseBootstrapArgs(process.argv.slice(2));
if (args.help) {
  console.log('Usage: node scripts/bootstrap-btb-admin.mjs --email you@example.com --name "Your Name"');
  console.log("Creates the FIRST console admin. Prompts for a hidden password and CONFIRM; refuses to overwrite an existing admin.");
  console.log("Automation: --password-stdin --confirm (read password from standard input; never an argument).");
  process.exit(0);
}
const { email, name } = bootstrapIdentity(args);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_DB_URL || readEnvFile(path.join(root, ".env.local")).SUPABASE_DB_URL || readEnvFile(path.join(root, ".env")).SUPABASE_DB_URL;
if (!url) throw new Error("Set SUPABASE_DB_URL in your private environment. No database was contacted.");
if (!stdin.isTTY && !(args["password-stdin"] && args.confirm)) throw new Error("Use an interactive terminal, or explicitly pass --password-stdin --confirm.");

let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) stdout.write(chunk, encoding); done(); } });
const rl = args["password-stdin"] ? null : readline.createInterface({ input: stdin, output, terminal: !!stdin.isTTY });
const sql = postgres(url, { prepare: false, ssl: "require", max: 1, connect_timeout: 15 });
try {
  const [count] = await sql`SELECT count(*)::integer AS total FROM btb_super_admins`;
  if (count.total) throw new Error("A console admin already exists. No credentials will be overwritten.");
  let password;
  if (args["password-stdin"]) {
    const chunks = []; for await (const chunk of stdin) chunks.push(chunk);
    password = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf8").replace(/\r?\n$/, "");
  } else {
    stdout.write("Console password (10–128 characters; hidden): "); muted = true;
    password = await rl.question(""); muted = false; stdout.write("\n");
  }
  if (password.length < 10 || password.length > 128) throw new Error("Password must be 10–128 characters.");
  console.log(`Create the FIRST BTB console admin: ${name} <${email}>. No employee or shared credentials are changed.`);
  if (!args.confirm && (await rl.question("Type CONFIRM to create this admin: ")).trim() !== "CONFIRM") throw new Error("Cancelled. No changes made.");
  const salt = randomBytes(16).toString("hex");
  const key = await promisify(scryptCallback)(password, salt, 64);
  const hash = `scrypt:${salt}:${Buffer.from(key).toString("hex")}`;
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('btb-first-super-admin',0))`;
    const [current] = await tx`SELECT count(*)::integer AS total FROM btb_super_admins`;
    if (current.total) throw new Error("Another admin was created. No changes made.");
    await tx`INSERT INTO btb_super_admins(email,name,password_hash) VALUES(${email},${name},${hash})`;
  });
  console.log(`Created. Sign in at /btb/admin/login as ${email}. Keep your password private.`);
} finally { muted = false; rl?.close(); output.end(); await sql.end(); }
