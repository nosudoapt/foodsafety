import { btbDatabaseTables, btbUploadTables, createBtbDatabase, databaseRows, identifier, insertRows, rpc } from "../tests/helpers/btb-database.mjs";

const db = await createBtbDatabase();
const databaseTables = [...btbDatabaseTables, ...btbUploadTables];
const names = new Set(databaseTables);
const primaryKey = (table) => ({ btb_employee_credentials: "employee_id", btb_notification_settings: "restaurant_name", btb_franchise_tasks: "task_key", btb_login_limits: "key" })[table] ?? "id";

export function isBtbDatabaseTable(table) { return names.has(table); }

export async function resetBtbDatabase(tables) {
  await db.exec(`TRUNCATE ${databaseTables.map(identifier).join(",")}, compliance_documents, locations, profiles CASCADE`);
  await db.exec("INSERT INTO btb_notification_settings(restaurant_name) VALUES ('Between the Buns')");
  await configureBtbDatabase(tables);
}

export async function configureBtbDatabase(tables) {
  await db.transaction(async (tx) => {
    for (const location of tables.locations ?? []) await tx.query("INSERT INTO locations(id) VALUES ($1) ON CONFLICT DO NOTHING", [location.id]);
    if (tables.profiles) {
      await tx.query("DELETE FROM profiles WHERE id::text NOT IN (SELECT jsonb_array_elements_text($1::jsonb))", [JSON.stringify(tables.profiles.map((profile) => profile.id))]);
      for (const profile of tables.profiles) await tx.query("INSERT INTO profiles(id,restaurant_name,role) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET restaurant_name=excluded.restaurant_name,role=excluded.role", [profile.id, profile.restaurant_name, profile.role]);
    }
    for (const table of databaseTables.filter((table) => table in tables)) {
      const rows = tables[table];
      const key = primaryKey(table);
      if (!rows.length) { await tx.exec(`DELETE FROM ${identifier(table)}`); continue; }
      // Replace omitted rows before inserting: a different primary key may reuse
      // a unique date/email from the previous fixture. Keep retained IDs intact.
      await tx.query(`DELETE FROM ${identifier(table)} WHERE ${identifier(key)}::text NOT IN (SELECT jsonb_array_elements_text($1::jsonb))`, [JSON.stringify(rows.map((row) => row[key]))]);
      for (const row of rows) {
        const columns = Object.keys(row).map(identifier);
        const updates = columns.filter((column) => column !== identifier(key)).map((column) => `${column}=excluded.${column}`);
        await tx.query(`INSERT INTO ${identifier(table)} (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::${identifier(table)}, $1::jsonb)
          ON CONFLICT (${identifier(key)}) DO ${updates.length ? `UPDATE SET ${updates}` : "NOTHING"}`, [JSON.stringify(row)]);
      }
    }
    if (tables.compliance_documents) {
      await tx.exec("DELETE FROM compliance_documents");
      await insertRows(tx, "compliance_documents", tables.compliance_documents.filter((row) => row.restaurant_name === "Between the Buns"));
    }
  });
}

export async function btbDatabaseState() {
  const pairs = await Promise.all(databaseTables.map(async (table) => [table, await databaseRows(db, table)]));
  return Object.fromEntries(pairs);
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
    if (!server && !btbUploadTables.includes(table)) return { status: 403, body: { code: "42501", message: "Permission denied" } };
    if (isRpc) {
      const rows = await rpc(db, table, body);
      return { status: 200, body: table === "btb_consume_login_attempt" ? rows[0] : rows };
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
        const created = await tx.query(`WITH saved AS (INSERT INTO ${identifier(table)} (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::${identifier(table)}, $1::jsonb) RETURNING *) SELECT to_jsonb(saved) AS row FROM saved`, [JSON.stringify(row)]);
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
