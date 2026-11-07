import { BtbApiError, readBody } from "@/lib/btb-api";
import { isUuid } from "@/lib/btb-team";
import { platformRoute, platformRpc } from "@/lib/btb-platform-route";

const EMAILS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function emailList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new BtbApiError(`${label} must be a list of email addresses.`);
  const rows = value.map((row) => String(row).trim().toLowerCase()).filter(Boolean);
  if (rows.length > 20) throw new BtbApiError(`Keep ${label} to 20 addresses or fewer.`);
  if (rows.some((row) => !EMAILS.test(row))) throw new BtbApiError(`Check the ${label} addresses.`);
  return [...new Set(rows)];
}

function text(value: unknown, label: string, max: number, pattern?: RegExp, hint?: string): string {
  if (typeof value !== "string") throw new BtbApiError(`Enter ${label}.`);
  const trimmed = value.trim();
  if (pattern && !pattern.test(trimmed)) throw new BtbApiError(hint ?? `Check ${label}.`);
  if (trimmed.length > max) throw new BtbApiError(`Shorten ${label}.`);
  return trimmed;
}

/**
 * Corporate location settings. Version checked in SQL, so two people editing
 * the same location cannot silently overwrite each other; a location rename or
 * address change never edits an unrelated location because the id is required.
 */
export const POST = platformRoute(["POST"], async ({ db, employeeId, sessionVersion }, request) => {
  const body = await readBody(request, 32_000);
  const form = body.form;
  if (form == null || typeof form !== "object" || Array.isArray(form)) throw new BtbApiError("Send the settings form.");
  const data = form as Record<string, unknown>;
  const location = data.id;
  if (location != null && location !== "" && !isUuid(String(location))) throw new BtbApiError("Choose a location.");

  const emails = [
    ["manager_emails", "manager emails"],
    ["owner_emails", "owner emails"],
    ["additional_emails", "additional emails"],
    ["compliance_emails", "compliance emails"],
  ] as const;
  const normalized: Record<string, unknown> = {
    ...data,
    name: text(data.name, "the location name", 120),
    address: typeof data.address === "string" ? data.address.trim().slice(0, 300) : "",
  };
  for (const [key, label] of emails) normalized[key] = emailList(data[key] ?? [], label);
  normalized.timezone = text(data.timezone, "the timezone", 60, /^[A-Za-z]+\/[A-Za-z0-9_+/-]+$/, "Choose an IANA timezone such as America/Edmonton.");
  normalized.business_day_start = text(data.business_day_start || "04:00", "the business day start", 5, TIME);
  normalized.report_time = text(data.report_time, "the report time", 5, TIME);
  const daySource = Array.isArray(data.reminder_days) ? data.reminder_days.map(Number) : [60, 30];
  const days = [...new Set(daySource.filter((day) => Number.isInteger(day) && day >= 1 && day <= 365))].sort((a, b) => b - a);
  if (!days.length) throw new BtbApiError("Choose at least one reminder day.");
  normalized.reminder_days = days;

  return platformRpc(db, "btb_platform_settings", {
    p_actor: employeeId,
    p_session: sessionVersion,
    p_location: location === "" ? null : location,
    p_version: Number(data.version ?? 0),
    p_data: normalized,
  }, "The location settings could not be saved.");
});
