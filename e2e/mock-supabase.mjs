import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { btbDatabaseState, btbPostgrest, configureBtbDatabase, isBtbDatabaseTable, resetBtbDatabase } from "./btb-postgrest.mjs";

// Test-only PostgREST/Auth fixture. Binds loopback, stores everything in memory,
// and never forwards a request to an external service.
const roles = ["staff", "manager", "owner", "multi_location_owner", "corporate", "designer"];
const userId = (role) => `10000000-0000-4000-8000-${String(roles.indexOf(role) + 1).padStart(12, "0")}`;
const east = "20000000-0000-4000-8000-000000000001";
const west = "20000000-0000-4000-8000-000000000002";
const bun = "30000000-0000-4000-8000-000000000001";
const cheese = "30000000-0000-4000-8000-000000000002";
const btbUploader = "10000000-0000-4000-8000-000000000099";
const monthAt = (offset) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
// BTB uses the Saskatchewan workday even when the test browser runs in UTC.
const btbToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Regina", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function user(role) {
  return { id: userId(role), aud: "authenticated", role: "authenticated", email: `${role}@workspace.test`, email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: `Alex ${role}`, restaurant_name: "The Test Kitchen" }, identities: [] };
}

function session(role) {
  const profile = user(role);
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: profile.id, aud: "authenticated", role: "authenticated", email: profile.email, iat: expires - 3600, exp: expires })}.fixture-signature`;
  return { access_token: token, refresh_token: `refresh-${role}`, token_type: "bearer", expires_in: 3600, expires_at: expires, user: profile };
}

function seed() {
  const time = `${today()}T10:00:00Z`;
  const btbDay = btbToday();
  const scope = { restaurant_name: "The Test Kitchen", location_id: east, user_id: userId("manager"), created_at: time };
  const btb = { restaurant_name: "Between the Buns", created_at: time };
  const personal = { restaurant_name: "The Test Kitchen", created_at: time };
  const document = { doc_type: "other", expiry_date: null, notes: "Shared with the restaurant team.", file_size: 1200, file_url: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nBrowser test document").toString("base64")}` };
  const campaign = { description: "Seasonal artwork for the next release.", month: Number(monthAt(0).slice(5)), year: Number(monthAt(0).slice(0, 4)), file_size: null, file_name: null, file_url: null, category: "poster", size: '24"×36" Poster', person_name: "Alex", status: "planned" };
  const opening = [{ id: "o1", text: "Open Sign: Turn on the open sign at opening time", completed: true, section: "Front" }, { id: "o2", text: "Check the opening equipment", completed: true, section: "Kitchen" }];
  return {
    profiles: [...roles.map((role) => ({ id: userId(role), role, full_name: `Alex ${role.replaceAll("_", " ")}`, restaurant_name: "The Test Kitchen", email: `${role}@workspace.test`, location_id: east, trial_ends_at: null })), { id: btbUploader, role: "manager", full_name: "BTB archive uploader", restaurant_name: "Between the Buns", email: "archive@workspace.test", location_id: null }],
    locations: [{ id: east, name: "Harbour Kitchen", address: "14 Harbour Road", created_at: "2026-01-01" }, { id: west, name: "Market Street", address: "22 Market Street", created_at: "2026-01-02" }],
    location_members: roles.flatMap((role) => (role === "owner" ? [east, west] : [east]).map((location_id) => ({ user_id: userId(role), location_id }))),
    daily_checks: roles.filter((role) => role !== "designer").map((role) => ({ ...personal, id: `check-${role}`, user_id: userId(role), check_type: "opening", completed: true, completed_at: time, notes: "Opening checks completed.", checklist_items: opening })),
    cleaning_records: [{ ...scope, id: "clean1", user_id: userId("staff"), completed: true, completed_at: time }],
    temperature_records: [
      { ...scope, id: "temp1", user_id: userId("staff"), food_item: "Cold display", temperature: 9, unit: "C", is_safe: false, recorded_at: time },
      { ...scope, id: "temp2", equipment_name: "Walk-in fridge", temperature: 42, unit: "F", is_safe: false, recorded_at: time },
      { ...scope, id: "temp3", location_id: west, equipment_name: "Market freezer", temperature: -12, unit: "C", is_safe: false, recorded_at: time },
    ],
    corrective_actions: [{ ...scope, id: "action1", issue_description: "Check the fridge seal", resolved: false }, { ...scope, id: "action2", location_id: west, issue_description: "Replace freezer gasket", resolved: false }],
    training_records: [{ ...scope, id: "training1", user_id: userId("staff"), expiry_date: today(), training_type: "Food safety" }],
    compliance_documents: [{ ...personal, location_id: east, id: "compliance1", name: "Food premises licence", doc_type: "business_license", expiry_date: today(), file_name: null, notes: "Annual licence renewal." }, { ...personal, id: "compliance2", location_id: west, name: "Fire inspection", doc_type: "other", expiry_date: today(), notes: "Book the annual inspection.", file_name: null }, { ...btb, location_id: null, id: "60000000-0000-4000-8000-000000000001", name: "BTB food premises licence", doc_type: "business_license", expiry_date: btbDay, file_name: null, notes: "Company renewal." }],
    business_documents: [{ ...personal, ...document, user_id: userId("manager"), uploaded_by: userId("manager"), id: "70000000-0000-4000-8000-000000000001", name: "Kitchen opening procedure", file_name: "opening-procedure.pdf" }, { ...personal, ...document, user_id: userId("manager"), uploaded_by: userId("manager"), id: "70000000-0000-4000-8000-000000000002", name: "Supplier agreement", file_name: "supplier-agreement.pdf" }, { ...btb, ...document, user_id: btbUploader, uploaded_by: btbUploader, id: "70000000-0000-4000-8000-000000000003", name: "BTB service standards", file_name: "btb-service-standards.pdf" }],
    staff_licenses: [{ ...scope, id: "licence1", staff_name: "Alex", expiry_date: today() }, { ...btb, id: "btb-licence1", staff_name: "Sam", expiry_date: btbDay }],
    corporate_inspections: [{ ...scope, id: "inspection1", inspection_date: today() }, { ...btb, id: "btb-inspection1", inspection_date: btbDay }],
    inhouse_inspections: [],
    marketing_promotions: [{ ...scope, ...campaign, id: "71000000-0000-4000-8000-000000000001", title: "Autumn specials", status: "active", file_url: document.file_url, file_name: "autumn-specials.pdf", file_size: 1200 }, { ...scope, ...campaign, id: "71000000-0000-4000-8000-000000000002", title: "Winter menu launch", month: Number(monthAt(1).slice(5)), year: Number(monthAt(1).slice(0, 4)) }, { ...btb, ...campaign, user_id: btbUploader, location_id: null, id: "71000000-0000-4000-8000-000000000003", title: "Burger special", status: "active" }],
    social_media_calendar: [{ ...personal, user_id: userId("designer"), id: "72000000-0000-4000-8000-000000000001", post_date: today(), day: (new Date(`${today()}T12:00:00Z`).getUTCDay() + 6) % 7, channel: "Instagram", caption: "Seasonal menu" }],
    corporate_dates: [{ id: "date1", title: "GST Return", category: "tax", due_date: today(), recurrence: "quarterly", notes: "Review the period before filing.", created_by: null, location_id: null, created_at: time }, { id: "date2", title: "FoodSafe site filing", category: "other", due_date: today(), recurrence: "none", notes: "Location-specific entry", created_by: null, location_id: east, created_at: time }],
    btb_checklists: [{ ...btb, id: "btb-check1", check_date: btbDay, completed: true }, { ...btb, id: "btb-check2", check_date: btbDay, completed: false }],
    prep_counts: [{ ...btb, id: "prep1", count_date: btbDay }, { ...btb, id: "prep2", count_date: btbDay }],
    cleaning_logs: [{ ...btb, id: "btb-clean1", done_date: btbDay }],
    order_sheets: [{ ...btb, id: "order1", order_date: btbDay }],
    btb_order_sheets: [{ restaurant_name: "Between the Buns", id: "60000000-0000-4000-8000-000000000002", order_date: btbDay, lines: [{ item_name: "White Bun - Not sliced", par: 12, on_hand: 3 }], saved_by_name: "Manager (shared workspace)" }],
    role_page_access: [],
    inventory_items: [{ id: bun, name: "Sesame buns", unit: "ea", category: "Bakery", unit_cost: 2.5, position: 1, location_id: null }, { id: cheese, name: "Cheddar", unit: "kg", category: "Dairy", unit_cost: 4, position: 2, location_id: null }],
    inventory_counts: [
      { id: "count1", item_id: bun, count_month: monthAt(-1), qty: 10 }, { id: "count2", item_id: cheese, count_month: monthAt(-1), qty: 5 },
      { id: "count3", item_id: bun, count_month: monthAt(-2), qty: 20 }, { id: "count4", item_id: cheese, count_month: monthAt(-2), qty: 5 },
      { id: "count5", item_id: bun, count_month: monthAt(0), qty: 4 },
    ],
    inventory_purchases: [{ id: "purchase1", count_month: monthAt(-1), purchase_date: `${monthAt(-1)}-03`, description: "Weekly stock delivery", type: "gfs", supplier: "GFS", reference: "INV-001", amount: 100, created_at: time }],
    inventory_month_summary: [{ id: "summary1", count_month: monthAt(-1), sales: 500 }],
    inventory_month_snapshots: [{ count_month: monthAt(-2), status: "finalized", opening_value: 80, closing_value: 70, purchases: 100, sales: 500, cogs: 110, food_cost_pct: 22, version: 1, finalized_at: time }],
    inventory_audit_log: [],
  };
}

// Match the checked-in operational schemas closely enough to catch missing
// uploader IDs, invalid fields and incorrect browser queries during UX tests.
const schemas = {
  business_documents: { columns: "id,user_id,restaurant_name,doc_type,name,file_name,file_url,file_size,uploaded_by,expiry_date,notes,created_at,updated_at", required: "user_id,restaurant_name,doc_type,file_name,file_url,uploaded_by" },
  marketing_promotions: { columns: "id,user_id,restaurant_name,title,description,file_name,file_url,file_size,month,year,status,category,size,person_name,location_id,created_at,updated_at", required: "user_id,restaurant_name,title,month,year" },
  social_media_calendar: { columns: "id,user_id,restaurant_name,day,channel,caption,post_date,created_at", required: "user_id,restaurant_name,day,channel,caption" },
  daily_checks: { columns: "id,user_id,restaurant_name,check_type,checklist_items,completed,completed_at,notes,created_at", required: "user_id,restaurant_name,check_type,checklist_items" },
  compliance_documents: { columns: "id,restaurant_name,doc_type,name,file_name,file_url,issue_date,expiry_date,notes,uploaded_by,location_id,created_at", required: "restaurant_name,doc_type,name" },
  corporate_dates: { columns: "id,location_id,title,category,due_date,recurrence,notes,created_by,created_at", required: "title,category,due_date,recurrence" },
};

function schemaError(table, fields, entries = []) {
  const schema = schemas[table];
  if (!schema) return null;
  const allowed = schema.columns.split(",");
  const unknown = [...fields, ...entries.flatMap(Object.keys)].find((field) => !allowed.includes(field));
  if (unknown) return { code: "42703", message: `column ${table}.${unknown} does not exist` };
  for (const entry of entries) {
    const missing = schema.required.split(",").find((column) => entry[column] == null);
    if (missing) return { code: "23502", message: `null value in column ${missing} violates not-null constraint` };
    for (const column of ["user_id", "uploaded_by"]) {
      if (entry[column] && !tables.profiles.some((profile) => profile.id === entry[column])) return { code: "23503", message: `Unknown profile in ${column}` };
    }
    if (table === "marketing_promotions" && (!Number.isInteger(entry.month) || entry.month < 1 || entry.month > 12 || !["planned", "active", "completed"].includes(entry.status))) return { code: "23514", message: "Invalid promotion month or status" };
    if (table === "social_media_calendar" && (!Number.isInteger(entry.day) || entry.day < 0 || entry.day > 6)) return { code: "23514", message: "Invalid planner day" };
    if (table === "daily_checks" && (!["opening", "closing"].includes(entry.check_type) || !Array.isArray(entry.checklist_items))) return { code: "23514", message: "Invalid checklist" };
  }
  return null;
}

let tables = seed();
let failures = [];
let requestLog = [];
let passwords = new Map(roles.map((role) => [role, "BrowserTest!234"]));
let emailFailures = [];
let emailDeliveries = new Map();
let emailRequests = [];
await resetBtbDatabase(tables);

function matches(row, params) {
  return [...params].every(([column, expression]) => {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(column)) return true;
    const split = expression.indexOf(".");
    const op = expression.slice(0, split);
    const value = expression.slice(split + 1);
    const actual = row[column];
    if (op === "not") return value === "is.null" ? actual != null : true;
    if (op === "is") return value === "null" ? actual == null : String(actual) === value;
    if (op === "in") return value.slice(1, -1).split(",").map((item) => item.replace(/^"|"$/g, "")).includes(String(actual));
    if (op === "eq") return String(actual) === value;
    if (op === "neq") return String(actual) !== value;
    if (actual == null) return false;
    if (op === "gte") return String(actual) >= value;
    if (op === "gt") return String(actual) > value;
    if (op === "lte") return String(actual) <= value;
    if (op === "lt") return String(actual) < value;
    return true;
  });
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  res.end(body == null ? "" : JSON.stringify(body));
}

async function handleRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5101");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (req.method === "OPTIONS") return send(res, 204, null);
  const url = new URL(req.url, "http://127.0.0.1:5102");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = null;
  try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null; }
  catch { return send(res, 400, { message: "Invalid JSON" }); }
  if (url.pathname === "/__test/health") return send(res, 200, { ok: true });
  if (url.pathname === "/__test/reset" && req.method === "POST") {
    tables = { ...seed(), ...body?.tables };
    await resetBtbDatabase(tables);
    failures = body?.failures ?? [];
    requestLog = [];
    passwords = new Map(roles.map((role) => [role, "BrowserTest!234"]));
    emailFailures = body?.emailFailures ?? [];
    emailDeliveries = new Map();
    emailRequests = [];
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__test/configure" && req.method === "POST") {
    tables = { ...tables, ...body?.tables };
    await configureBtbDatabase(body?.tables ?? {});
    if (body?.failures) failures = body.failures;
    if (body?.emailFailures) emailFailures = body.emailFailures;
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__test/state") return send(res, 200, { tables: { ...tables, ...await btbDatabaseState() }, requests: requestLog, emailDeliveries: [...emailDeliveries.values()], emailRequests });
  if (url.pathname === "/__test/send-email") {
    if (req.headers.authorization !== "Bearer browser-test-resend-key") return send(res, 401, { message: "Invalid test sender" });
    const key = req.headers["idempotency-key"];
    emailRequests.push({ key, body });
    const previous = emailDeliveries.get(key);
    if (previous) return JSON.stringify(previous.body) === JSON.stringify(body) ? send(res, 200, { id: previous.id }) : send(res, 409, { message: "Idempotency payload mismatch" });
    const failure = emailFailures.shift();
    if (failure === "reject") return send(res, 503, { message: "Test provider temporarily unavailable" });
    const id = randomUUID();
    emailDeliveries.set(key, { id, key, body });
    return failure === "accepted-then-500" ? send(res, 500, { message: "Accepted but response lost" }) : send(res, 200, { id });
  }
  requestLog.push({ path: url.pathname, method: req.method, query: Object.fromEntries(url.searchParams), body });

  if (url.pathname.startsWith("/auth/v1/")) {
    if (url.pathname.endsWith("/token")) {
      const grant = url.searchParams.get("grant_type");
      const role = grant === "pkce" ? String(body?.auth_code).split(":")[1] || "owner" : grant === "refresh_token" ? String(body?.refresh_token).replace("refresh-", "") : String(body?.email).split("@")[0];
      if (!roles.includes(role) || (grant === "password" && body?.password !== passwords.get(role)) || (grant === "pkce" && !String(body?.auth_code).startsWith("valid:"))) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
      return send(res, 200, session(role));
    }
    if (url.pathname.endsWith("/user")) {
      let id = "";
      try { id = JSON.parse(Buffer.from(req.headers.authorization?.split(".")[1] ?? "", "base64url").toString()).sub; } catch { /* Missing/invalid fixture token. */ }
      const role = roles.find((item) => userId(item) === id);
      if (role && req.method === "PUT" && body?.password) passwords.set(role, body.password);
      return role ? send(res, 200, user(role)) : send(res, 401, { msg: "Invalid session" });
    }
    if (url.pathname.endsWith("/signup")) return send(res, 200, { ...user("owner"), email: body?.email, email_confirmed_at: null, user_metadata: body?.data, confirmation_sent_at: new Date().toISOString() });
    if (url.pathname.endsWith("/recover")) return send(res, 200, {});
    if (url.pathname.endsWith("/logout")) return send(res, 204, null);
    return send(res, 404, { message: "Unknown auth fixture" });
  }

  if (!url.pathname.startsWith("/rest/v1/")) return send(res, 404, { message: "Unknown fixture route" });
  const table = url.pathname.split("/").pop();
  const fail = failures.find((item) => item.table === table && (!item.method || item.method === req.method) && item.times !== 0 && Object.entries(item.match ?? {}).every(([key, value]) => url.searchParams.get(key) === value));
  if (fail) {
    if (fail.times > 0) fail.times--;
    return send(res, fail.status ?? 400, { message: fail.message ?? "Fixture source unavailable", code: "FIXTURE_ERROR" });
  }
  if (isBtbDatabaseTable(table) || url.pathname.startsWith("/rest/v1/rpc/btb_")) {
    const result = await btbPostgrest(table, req.method, url.searchParams, body, req.headers, url.pathname.includes("/rpc/"));
    return send(res, result.status, result.body, result.headers);
  }
  tables[table] ??= [];
  let rows = tables[table].filter((row) => matches(row, url.searchParams));
  const selected = url.searchParams.get("select");
  const fields = [...url.searchParams.keys()].filter((key) => !["select", "order", "limit", "offset", "on_conflict", "or", "and"].includes(key));
  if (selected && selected !== "*" && !selected.includes("(")) fields.push(...selected.split(",").map((field) => field.trim()));
  const entries = req.method === "POST" ? (Array.isArray(body) ? body : [body]) : req.method === "PATCH" ? rows.map((row) => ({ ...row, ...body })) : [];
  const invalid = schemaError(table, fields, entries);
  if (invalid) return send(res, 400, invalid);
  if (req.method === "POST") {
    const keys = (url.searchParams.get("on_conflict") ?? "id").split(",");
    rows = (Array.isArray(body) ? body : [body]).map((entry) => {
      const old = req.headers.prefer?.includes("resolution=merge-duplicates") ? tables[table].find((row) => keys.every((key) => row[key] !== undefined && row[key] === entry[key])) : undefined;
      if (old) { Object.assign(old, entry); return old; }
      const created = { id: randomUUID(), created_at: new Date().toISOString(), ...entry };
      tables[table].push(created);
      return created;
    });
  } else if (req.method === "PATCH") {
    rows.forEach((row) => Object.assign(row, body));
  } else if (req.method === "DELETE") {
    tables[table] = tables[table].filter((row) => !rows.includes(row));
    if (table === "inventory_items") tables.inventory_counts = tables.inventory_counts.filter((row) => !rows.some((item) => item.id === row.item_id));
  }
  const count = rows.length;
  const order = url.searchParams.get("order");
  if (order) rows = [...rows].sort((a, b) => {
    for (const part of order.split(",")) {
      const [column, direction] = part.split(".");
      const difference = typeof a[column] === "number" ? a[column] - b[column] : String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
      if (difference) return difference * (direction === "desc" ? -1 : 1);
    }
    return 0;
  });
  const offset = Number(url.searchParams.get("offset") ?? 0);
  rows = rows.slice(offset);
  const limit = url.searchParams.get("limit");
  if (limit !== null) rows = rows.slice(0, Number(limit));
  const projection = url.searchParams.get("select");
  if (projection && projection !== "*" && !projection.includes("(")) rows = rows.map((row) => Object.fromEntries(projection.split(",").map((key) => [key.trim(), row[key.trim()] ?? null])));
  if (req.method === "HEAD") return send(res, 200, null, { "Content-Range": `*/${count}` });
  if (!["GET", "HEAD"].includes(req.method) && !req.headers.prefer?.includes("return=representation")) return send(res, req.method === "DELETE" ? 204 : 201, null);
  if (req.headers.accept?.includes("application/vnd.pgrst.object+json")) {
    return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "Cannot coerce the result to a single JSON object", details: `The result contains ${rows.length} rows` });
  }
  return send(res, 200, rows, { "Content-Range": `0-${Math.max(0, count - 1)}/${count}` });
}

createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    if (res.headersSent) res.destroy(error);
    else send(res, 500, { code: error.code ?? "FIXTURE_ERROR", message: error.message });
  });
}).listen(5102, "127.0.0.1", () => console.log("Local Supabase fixture ready on 127.0.0.1:5102"));
