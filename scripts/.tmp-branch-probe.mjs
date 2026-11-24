import fs from "node:fs";
import path from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const val = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const service = val("SUPABASE_SERVICE_ROLE_KEY");
const sql = postgres(val("SUPABASE_DB_URL"), { max: 1, onnotice: () => {} });
const BASE = process.env.PROBE_BASE ?? "https://foodsafety-sigma.vercel.app";
const exp = Math.floor(Date.now() / 1000) + 900;

const [admin] = await sql`select id, tenant_id, session_version from public.btb_super_admins where active`;
const [cp] = await sql`select id, session_version from public.workspace_principals where credential_id=${admin.id} and principal_type='console'`;
const [c] = await sql`select public.workspace_auth_context(${cp.id}::uuid) as c`;
const drum = c.c.locations.find((l) => l.slug === "drumheller");
const calgary = c.c.locations.find((l) => l.slug === "calgary") ?? c.c.locations[0];
console.log("estate:", c.c.locations.map((l) => l.slug).join(", "));

const sign = (cl) => {
  const key = createHmac("sha256", service).update("foodsafe-unified-session-signing:v1").digest();
  const payload = Buffer.from(JSON.stringify(cl)).toString("base64url");
  return `workspace_session=w1.${payload}.${createHmac("sha256", key).update(`workspace-session:v1:${payload}`).digest("base64url")}`;
};
const sid = randomUUID();
await sql`select public.workspace_create_session(${sid}::uuid, ${cp.id}::uuid, ${cp.session_version}::int,
  ${admin.tenant_id}::uuid, ${calgary.id}::uuid, 'admin', to_timestamp(${exp}))`;
const cookie = sign({ sub: cp.id, principalType: "console", tenantId: admin.tenant_id, tenantSlug: "between-the-buns",
  locationId: calgary.id, allowedLocationIds: c.c.locations.map((l) => l.id).sort(), role: "admin",
  permittedView: "/btb/admin", version: cp.session_version, exp, sid });

const switched = await fetch(`${BASE}/api/auth/location`, {
  method: "POST", headers: { cookie, origin: BASE, "content-type": "application/json" },
  body: JSON.stringify({ locationId: drum.id }),
});
const raw = switched.headers.getSetCookie?.() ?? [switched.headers.get("set-cookie") ?? ""];
const next = raw.map((line) => line.split(";")[0]).filter((pair) => pair.startsWith("workspace_session=")).join("; ");
console.log(`switch to drumheller: ${switched.status} | new cookie: ${!!next}`);

for (const p of ["/btb/drumheller", "/btb/drumheller/prep-list", "/btb/demo", "/btb/demo/prep-list"]) {
  const res = await fetch(`${BASE}${p}`, { headers: { cookie: next || cookie }, redirect: "manual" });
  const html = await res.text();
  const slug = /data-btb-slug="([a-z0-9-]+)"/.exec(html)?.[1] ?? "-";
  console.log(`${p} → ${res.status} ${res.headers.get("location") ?? ""} | shell slug=${slug} | redirect payload=${/NEXT_REDIRECT|__next_redirect/.test(html)} | console chrome=${html.includes("Console sign out")}`);
}
await sql`update public.workspace_auth_sessions set revoked_at=now() where id=${sid}`;
await sql.end();
