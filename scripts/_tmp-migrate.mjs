import fs from "node:fs";
import postgres from "postgres";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const dbLine = env.split(/\r?\n/).find((l) => l.startsWith("SUPABASE_DB_URL="));
if (!dbLine) throw new Error("SUPABASE_DB_URL missing");
const url = dbLine.slice("SUPABASE_DB_URL=".length).trim().replace(/^["']|["']$/g, "");

const FILES = [
  "schema-btb-platform-foundation.sql",
  "schema-btb-platform-operations.sql",
  "schema-btb-platform-inventory.sql",
  "schema-btb-platform-marketing.sql",
  "schema-btb-platform-automation.sql",
  "schema-btb-platform-api.sql",
];

const TOUCHED = [
  "locations", "profiles", "btb_employees", "btb_employee_credentials", "btb_shift_checks",
  "temperature_records", "equipment", "marketing_promotions", "social_media_calendar",
  "compliance_documents", "inventory_items", "inventory_counts", "inventory_purchases",
  "inventory_month_summary", "inventory_month_snapshots", "inventory_audit_log",
  "btb_location_settings", "btb_location_access", "btb_events", "btb_file_objects",
  "btb_notifications", "btb_email_jobs", "btb_operation_templates", "btb_sanitizer_settings",
  "btb_sanitizer_logs", "btb_document_imports", "inventory_purchase_lines",
  "btb_design_formats", "btb_design_versions", "btb_promotion_comments", "btb_social_platforms",
  "btb_compliance_versions",
];

const mode = process.argv[2] ?? "preflight";
const sql = postgres(url, { max: 1, connect_timeout: 30, ssl: "require", prepare: false });

const readRelease = (filewheel) =>
  fs.readFileSync(new URL(`../supabase/${filewheel}`, import.meta.url), "utf8");

const unwrap = (text) =>
  text
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return t !== "BEGIN;" && t !== "COMMIT;" && !t.startsWith("NOTIFY pgrst");
    })
    .join("\n");

async function counts() {
  const out = {};
  for (const t of TOUCHED) {
    try {
      const r = await sql.unsafe(`select count(*)::int as n from "${t}"`);
      out[t] = r[0].n;
    } catch {
      out[t] = null;
    }
  }
  return out;
}

try {
  if (mode === "preflight") {
    const v = await sql`select version() as v`;
    console.log("VERSION:", v[0].v.split(",")[0]);
    const g = await sql`select gen_random_uuid() as id`;
    console.log("gen_random_uuid:", !!g[0].id);
    const tz = await sql`select count(*)::int as n from pg_timezone_names where name = 'America/Edmonton'`;
    console.log("tz data:", tz[0].n > 0);
    console.log("COUNTS:", JSON.stringify(await counts()));
  } else if (mode === "rehearse") {
    await sql.unsafe("BEGIN");
    for (const [i, f] of FILES.entries()) {
      try {
        await sql.unsafe(unwrap(readRelease(f)));
        console.log(`  ${i + 1}/6 ${f} OK`);
      } catch (error) {
        console.log(`  ${i + 1}/6 ${f} FAILED: ${error.code} ${error.message}`);
        if (error.detail) console.log("      detail:", String(error.detail).slice(0, 300));
        throw error;
      }
    }
    await sql.unsafe("ROLLBACK");
    console.log("REHEARSAL OK - rolled back, nothing persisted");
  } else if (mode === "apply") {
    for (const [i, f] of FILES.entries()) {
      const started = Date.now();
      try {
        await sql.unsafe(readRelease(f));
        console.log(`  ${i + 1}/6 APPLIED ${f} ${Date.now() - started}ms`);
      } catch (error) {
        console.log(`  ${i + 1}/6 FAILED ${f}: ${error.code} ${error.message}`);
        if (error.detail) console.log("      detail:", String(error.detail).slice(0, 300));
        if (error.hint) console.log("      hint:", String(error.hint).slice(0, 300));
        process.exitCode = 1;
        break;
      }
    }
  } else if (mode === "verify") {
    const funcs = await sql`
      select proname from pg_proc
      where pronamespace = 'public'::regnamespace and proname like 'btb_platform_%'
      order by 1`;
    console.log("btb_platform_* funcs:", funcs.length);
    console.log(funcs.map((f) => "  " + f.proname).join("\n"));

    const tables = await sql`
      select table_name from information_schema.tables
      where table_schema='public' and table_name = any(${TOUCHED}) order by 1`;
    const present = new Set(tables.map((t) => t.table_name));
    console.log("MISSING TABLES:", TOUCHED.filter((t) => !present.has(t)).join(", ") || "(none)");

    const leaks = await sql`
      select p.proname from pg_proc p
      where p.pronamespace='public'::regnamespace and p.proname like 'btb_platform_%'
        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`;
    console.log("FUNCS EXECUTABLE BY BROWSER ROLES:", leaks.length ? JSON.stringify(leaks) : "(none)");

    const tbl = await sql`
      select c.relname, has_table_privilege('anon', c.oid, 'SELECT') as anon_sel
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname = any(${TOUCHED}) and c.relkind='r'`;
    const bad = tbl.filter((t) => t.anon_sel);
    console.log("PUBLIC TABLES READABLE BY anon:", bad.length ? JSON.stringify(bad) : "(none)");
  }
} catch (error) {
  console.log("FATAL", error.code ?? "", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
