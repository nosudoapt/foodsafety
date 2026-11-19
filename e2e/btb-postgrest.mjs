import { btbDatabaseTables, btbUploadTables, createBtbDatabase, databaseRows, identifier, insertRows, rpc } from "../tests/helpers/btb-database.mjs";
import { initializePlatformDatabase } from "../tests/helpers/btb-platform-database.mjs";
import { initializeAdminDatabase } from "../tests/helpers/btb-admin-database.mjs";

const db = await createBtbDatabase({}, { temperatureStore: true });
await initializePlatformDatabase(db);
await initializeAdminDatabase(db);
const platformTables = [
  "btb_location_settings", "btb_location_access", "btb_events", "btb_file_objects", "btb_notifications", "btb_email_jobs",
  "btb_operation_templates", "btb_sanitizer_settings", "btb_sanitizer_logs", "btb_document_imports",
  "btb_design_formats", "btb_design_versions", "btb_promotion_comments", "btb_social_platforms", "btb_compliance_versions",
  "btb_ai_settings", "btb_ai_usage", "btb_invoices", "btb_stock_balances", "btb_stock_movements", "btb_supplier_prices",
  "btb_bank_accounts", "btb_bank_statements", "btb_bank_transactions", "btb_bank_allocations", "btb_gst_periods", "btb_finance_commands",
  "btb_time_entries", "btb_time_commands",
];
// Location settings/access must exist before location-scoped shifts, so seed
// those fixture tables last. Everything else keeps its existing order.
const databaseTables = [
  ...[...btbDatabaseTables, ...btbUploadTables, "equipment", "temperature_records", ...platformTables]
    .filter((table) => !["btb_location_settings", "btb_location_access", "btb_shifts"].includes(table)),
  "btb_location_settings", "btb_location_access", "btb_shifts",
  "btb_super_admins", "btb_admin_login_limits", "btb_superadmin_locations", "btb_location_page_access", "btb_invitations",
];
// Legacy inventory remains JavaScript-backed. Use explicit aliases for the
// location-platform SQL fixtures so synthetic legacy IDs never enter UUID FKs.
const inventoryTables = ["inventory_items", "inventory_counts", "inventory_purchases", "inventory_purchase_lines", "inventory_month_summary", "inventory_month_snapshots", "inventory_audit_log"];
const fixtureTables = new Map([...databaseTables.map((table) => [table, table]), ...inventoryTables.map((table) => [`platform_${table}`, table])]);
const names = new Set(databaseTables);
const primaryKeys = (table) => ({
  btb_employee_credentials: ["employee_id"], btb_notification_settings: ["restaurant_name"], btb_franchise_tasks: ["task_key"], btb_login_limits: ["key"],
  btb_location_settings: ["location_id"], btb_location_access: ["location_id", "employee_id"], btb_sanitizer_settings: ["location_id"],
  btb_admin_login_limits: ["key"], btb_superadmin_locations: ["location_id"], btb_location_page_access: ["location_id", "page"],
  btb_social_platforms: ["name"], btb_ai_settings: ["location_id"], btb_ai_usage: ["location_id", "day"], btb_stock_balances: ["item_id"],
  inventory_month_snapshots: ["count_month", "scope_key"],
})[table] ?? ["id"];

export function isBtbDatabaseTable(table) { return names.has(table); }

export async function resetBtbDatabase(tables) {
  await db.exec(`TRUNCATE ${[...databaseTables, "prep_counts", ...inventoryTables].map(identifier).join(",")}, temperature_record_events, compliance_documents, locations, profiles CASCADE`);
  await db.exec("INSERT INTO btb_notification_settings(restaurant_name) VALUES ('Between the Buns')");
  await configureBtbDatabase(tables);
}

export async function configureBtbDatabase(tables) {
  await db.transaction(async (tx) => {
    for (const location of tables.locations ?? []) await tx.query("INSERT INTO locations(id,name,address) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address", [location.id, location.name ?? "Test location", location.address ?? ""]);
    if (tables.profiles) {
      await tx.query("DELETE FROM profiles WHERE id::text NOT IN (SELECT jsonb_array_elements_text($1::jsonb))", [JSON.stringify(tables.profiles.map((profile) => profile.id))]);
      for (const profile of tables.profiles) await tx.query("INSERT INTO profiles(id,restaurant_name,role) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET restaurant_name=excluded.restaurant_name,role=excluded.role", [profile.id, profile.restaurant_name, profile.role]);
    }
    for (const [fixture, table] of fixtureTables) {
      if (!(fixture in tables)) continue;
      // Existing synthetic evidence must retain its fixture timestamp; actual
      // PostgREST writes below always run with the real timestamp/audit triggers.
      if (table === "temperature_records") await tx.exec("SET LOCAL session_replication_role='replica'");
      const rows = tables[fixture];
      const keys = primaryKeys(table);
      if (!rows.length) { await tx.exec(`DELETE FROM ${identifier(table)}`); if (table === "temperature_records") await tx.exec("SET LOCAL session_replication_role='origin'"); continue; }
      // Replace omitted rows before inserting: a different primary key may reuse
      // a unique date/email from the previous fixture. Keep retained IDs intact.
      await tx.query(`DELETE FROM ${identifier(table)} value WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements($1::jsonb) fixture WHERE ${keys.map((key) => `value.${identifier(key)}::text = fixture->>'${key}'`).join(" AND ")})`, [JSON.stringify(rows)]);
      for (const row of rows) {
        const columns = Object.keys(row).map(identifier);
        const updates = columns.filter((column) => !keys.map(identifier).includes(column)).map((column) => `${column}=excluded.${column}`);
        await tx.query(`INSERT INTO ${identifier(table)} (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::${identifier(table)}, $1::jsonb)
          ON CONFLICT (${keys.map(identifier)}) DO ${updates.length ? `UPDATE SET ${updates}` : "NOTHING"}`, [JSON.stringify(row)]);
      }
      if (table === "temperature_records") await tx.exec("SET LOCAL session_replication_role='origin'");
    }
    if (tables.compliance_documents) {
      await tx.exec("DELETE FROM compliance_documents");
      await insertRows(tx, "compliance_documents", tables.compliance_documents.filter((row) => row.restaurant_name === "Between the Buns"));
    }
    // The legacy prep sheet reads from the JavaScript fixture, but its atomic
    // save RPC operates on this SQL copy. Seed the copy so scoped saves keep
    // evidence from other sites/restaurants exactly as the real table would.
    if (tables.prep_counts) {
      await tx.exec("DELETE FROM prep_counts");
      await insertRows(tx, "prep_counts", tables.prep_counts);
    }
  });
}

export async function btbDatabaseState() {
  const pairs = await Promise.all([...fixtureTables].map(async ([fixture, table]) => [fixture, await databaseRows(db, table)]));
  return { ...Object.fromEntries(pairs), temperature_record_events: await databaseRows(db, "temperature_record_events") };
}

/**
 * The legacy prep sheet is still a JavaScript-backed table in this fixture,
 * but its atomic save RPC writes the SQL copy. Mirror that copy after a replay
 * so the next browser read (and /__test/state) sees the committed sheet.
 */
export async function sqlTableRows(table) {
  return databaseRows(db, table);
}

function where(params, values) {
  const clauses = [];
  const bind = (value) => { values.push(value); return `$${values.length}`; };
  for (const [column, expression] of params) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(column)) continue;
    if (column === "or") {
      const alternatives = expression.slice(1, -1).split(",").map((filter) => {
        const separator = filter.indexOf(".");
        return where(new URLSearchParams([[filter.slice(0, separator), filter.slice(separator + 1)]]), values).replace(/^ WHERE /, "");
      });
      clauses.push(`(${alternatives.join(" OR ")})`);
      continue;
    }
    const [op, ...rest] = expression.split(".");
    const value = rest.join(".");
    const col = identifier(column);
    if (op === "is" && value === "null") clauses.push(`${col} IS NULL`);
    else if (op === "not" && value === "is.null") clauses.push(`${col} IS NOT NULL`);
    else if (op === "in") clauses.push(`${col} IN (${value.slice(1, -1).split(",").map((item) => bind(item.replace(/^"|"$/g, ""))).join(",")})`);
    else {
      const operator = { eq: "=", neq: "<>", is: "=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
      if (!operator) throw new Error(`Unsupported fixture filter ${op}`);
      clauses.push(`${col} ${operator} ${bind(value)}`);
    }
  }
  return clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
}

export async function btbPostgrest(table, method, params, body, headers, isRpc) {
  try {
    const server = headers.apikey === "browser-test-service-key";
    // Browser RPC calls are authorized inside the SECURITY DEFINER functions
    // themselves (tenant scoping, actor binding), so they bypass the table gate.
    if (!server && !isRpc && !btbUploadTables.includes(table) && table !== "temperature_records") return { status: 403, body: { code: "42501", message: "Permission denied" } };
    if (isRpc) {
      return await db.transaction(async (tx) => {
        // Mirror the table path: server API key runs as service_role, a browser
        // session runs as authenticated with its claim, everything else is anon.
        const subject = (!server && headers.authorization?.endsWith(".fixture-signature"))
          ? (() => { try { return JSON.parse(Buffer.from(headers.authorization.split(".")[1], "base64url").toString()).sub ?? ""; } catch { return ""; } })()
          : "";
        await tx.exec(`SET LOCAL ROLE ${server ? "service_role" : subject ? "authenticated" : "anon"}`);
        if (subject) await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [subject]);
        const rows = await rpc(tx, table, body);
        const shape = await tx.query("SELECT proretset FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1", [table]);
        // Scalar JSONB/boolean RPCs are not SETOF rows. Keep legacy SETOF RPCs
        // as arrays, including the existing temperature sheet persistence RPC.
        return { status: 200, body: shape.rows[0]?.proretset ? rows : rows[0] ?? null };
      });
    }
    if (!names.has(table)) return { status: 404, body: { code: "42P01", message: "Unknown fixture table" } };
    let subject = "";
    if (!server && headers.authorization?.endsWith(".fixture-signature")) {
      try { subject = JSON.parse(Buffer.from(headers.authorization.split(".")[1], "base64url").toString()).sub ?? ""; } catch { /* Anonymous fixture request. */ }
    }
    return await db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${server ? "service_role" : subject ? "authenticated" : "anon"}`);
    if (subject) await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [subject]);
    const values = [];
    let result;
    if (method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      const saved = [];
      for (const row of rows) {
        const columns = Object.keys(row).map(identifier).join(",");
        const keys = params.get("on_conflict")?.split(",") ?? primaryKeys(table);
        const updates = Object.keys(row).filter(key => !keys.includes(key)).map(key => `${identifier(key)}=excluded.${identifier(key)}`);
        const conflict = headers.prefer?.includes("resolution=merge-duplicates")
          ? ` ON CONFLICT (${keys.map(identifier)}) DO ${updates.length ? `UPDATE SET ${updates}` : "NOTHING"}` : "";
        const created = await tx.query(`WITH saved AS (INSERT INTO ${identifier(table)} (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::${identifier(table)}, $1::jsonb)${conflict} RETURNING *) SELECT to_jsonb(saved) AS row FROM saved`, [JSON.stringify(row)]);
        saved.push(...created.rows);
      }
      result = { rows: saved };
    } else if (method === "PATCH" || method === "DELETE") {
      if (method === "PATCH") values.push(JSON.stringify(body));
      const filter = where(params, values);
      const columns = Object.keys(body ?? {}).map(identifier).join(",");
      const operation = method === "PATCH" ? `UPDATE ${identifier(table)} SET (${columns}) = (SELECT ${columns} FROM jsonb_populate_record(NULL::${identifier(table)}, $1::jsonb))` : `DELETE FROM ${identifier(table)}`;
      result = await tx.query(`WITH saved AS (${operation}${filter} RETURNING *) SELECT to_jsonb(saved) AS row FROM saved`, values);
    } else {
      const filter = where(params, values);
      result = await tx.query(`SELECT to_jsonb(value) AS row FROM ${identifier(table)} value${filter}`, values);
    }
    let rows = result.rows.map((entry) => entry.row);
    const count = rows.length;
    const order = params.get("order")?.split(",").map((item) => item.split("."));
    if (order) rows.sort((a, b) => {
      for (const [column, direction] of order) {
        const difference = typeof a[column] === "number" ? a[column] - b[column] : String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
        if (difference) return difference * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? rows.length);
    rows = rows.slice(offset, offset + limit);
    const projection = params.get("select");
    if (projection && projection !== "*") {
      // Validate projected fields against PostgreSQL, including empty tables.
      await tx.query(`SELECT ${projection.split(",").map((column) => identifier(column.trim())).join(",")} FROM ${identifier(table)} LIMIT 0`);
      rows = rows.map((row) => Object.fromEntries(projection.split(",").map((column) => [column.trim(), row[column.trim()]])));
    }
    if (method === "HEAD") return { status: 200, body: null, headers: { "Content-Range": `*/${count}` } };
    if (!["GET", "HEAD"].includes(method) && !headers.prefer?.includes("return=representation")) return { status: method === "DELETE" ? 204 : 201, body: null };
    if (headers.accept?.includes("application/vnd.pgrst.object+json")) return rows.length === 1 ? { status: 200, body: rows[0] } : { status: 406, body: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object", details: `The result contains ${rows.length} rows` } };
    return { status: 200, body: rows, headers: { "Content-Range": `${offset}-${offset + rows.length - 1}/${count}` } };
    });
  } catch (error) {
    return { status: error.code === "42501" ? 403 : error.code === "40001" || error.code === "23505" ? 409 : 400, body: { code: error.code ?? "FIXTURE_ERROR", message: error.message } };
  }
}
