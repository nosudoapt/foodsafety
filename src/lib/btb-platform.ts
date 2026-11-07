// Shared, secret-free contracts and calendar rules for the location platform.
// Safe to import from client components: no secrets and no database client.
import type { BtbRole } from "./btb-roles";
import { isIsoDate, isUuid } from "./btb-team";

export type PlatformModule = "operations" | "inventory" | "marketing" | "compliance" | "reports" | "settings" | "notifications";

export interface PlatformLocation {
  id: string;
  name: string;
  timezone: string | null;
  business_day_start: string;
  settings_confirmed: boolean;
}
export interface PlatformIdentity { id: string; name: string; role: BtbRole }
export interface PlatformBootstrap { identity: PlatformIdentity; locations: PlatformLocation[] }

export const PLATFORM_MODULES: Record<PlatformModule, { title: string; roles: readonly BtbRole[] }> = {
  operations: { title: "Daily operations", roles: ["staff", "supervisor", "manager", "corporate", "owner"] },
  inventory: { title: "Inventory & food cost", roles: ["manager", "corporate", "owner"] },
  marketing: { title: "Design & promotions", roles: ["manager", "designer", "corporate", "owner"] },
  compliance: { title: "Compliance & expiry", roles: ["staff", "supervisor", "manager", "corporate", "owner"] },
  reports: { title: "Reports & delivery", roles: ["manager", "corporate", "owner"] },
  settings: { title: "Locations & settings", roles: ["corporate", "owner"] },
  notifications: { title: "Notifications", roles: ["staff", "supervisor", "manager", "designer", "corporate", "owner"] },
};

export function platformCan(role: BtbRole, module: PlatformModule): boolean {
  return PLATFORM_MODULES[module].roles.includes(role);
}

export const PLATFORM_SLUG = "platform";
export const PLATFORM_PATH = "/between-the-buns/platform";

/** Read models exposed by btb_platform_read (release 11). */
export const PLATFORM_READ_MODULES = ["operations", "inventory", "marketing", "compliance", "reports", "settings", "notifications"] as const;
export type PlatformReadModule = (typeof PLATFORM_READ_MODULES)[number];

export function isPlatformReadModule(value: unknown): value is PlatformReadModule {
  return typeof value === "string" && (PLATFORM_READ_MODULES as readonly string[]).includes(value);
}

/** Private file categories. Each one maps to a capability inside the SQL function. */
export const PLATFORM_FILE_PURPOSES = ["reference", "artwork", "evidence", "purchase", "sales", "compliance", "report"] as const;
export type PlatformFilePurpose = (typeof PLATFORM_FILE_PURPOSES)[number];

export function isPlatformFilePurpose(value: unknown): value is PlatformFilePurpose {
  return typeof value === "string" && (PLATFORM_FILE_PURPOSES as readonly string[]).includes(value);
}

export const PLATFORM_FILE_MIME = ["application/pdf", "image/png", "image/jpeg", "text/csv"] as const;
export type PlatformFileMime = (typeof PLATFORM_FILE_MIME)[number];

export function isPlatformFileMime(value: unknown): value is PlatformFileMime {
  return typeof value === "string" && (PLATFORM_FILE_MIME as readonly string[]).includes(value);
}

/** 3 MiB — matches the byte_size CHECK constraint in release 06. */
export const PLATFORM_FILE_MAX_BYTES = 3 * 1024 * 1024;
/** Base64 of a 3 MiB file is 4 MiB; leave headroom for the JSON envelope. */
export const PLATFORM_FILE_BODY_BYTES = 4_400_000;

/** The three scheduled Celsius checks. Sanitizer PPM is a separate log. */
export const READING_SLOTS = ["11:00", "16:00", "20:00"] as const;

export const CHECK_KINDS = ["opening", "closing", "cleaning"] as const;
export type PlatformCheckKind = (typeof CHECK_KINDS)[number];

export type PlatformParse<T> = { ok: true; value: T } | { ok: false; error: string };

export interface PlatformCheckChange {
  id: string;
  completed: boolean;
  value: string | null;
  notes: string | null;
  evidence_id: string | null;
}
export interface PlatformCheckCommand {
  date: string;
  kind: PlatformCheckKind;
  version: number;
  changes: PlatformCheckChange[];
  notes: string;
}

export interface PlatformReadingCommand {
  kind: "temperature" | "sanitizer";
  date: string;
  slot: string;
  value: number;
  version: number;
  notes: string;
  equipment_id: string | null;
}

const textWithin = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

/** Validate one opening/closing/cleaning save. Every limit is enforced server-side. */
export function parseCheckCommand(body: Record<string, unknown>): PlatformParse<PlatformCheckCommand> {
  if (!isIsoDate(body.date)) return { ok: false, error: "Choose a valid checklist date." };
  const kind = body.kind as PlatformCheckKind;
  if (!CHECK_KINDS.includes(kind)) return { ok: false, error: "Choose the opening, closing or cleaning checklist." };
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0) return { ok: false, error: "Reload the saved checklist before editing it." };
  if (body.notes != null && !textWithin(body.notes, 2000)) return { ok: false, error: "Keep handover notes under 2,000 characters." };
  if (!Array.isArray(body.changes) || body.changes.length === 0 || body.changes.length > 100) return { ok: false, error: "Tick at least one duty before saving." };
  const ids = new Set<string>();
  const changes: PlatformCheckChange[] = [];
  for (const raw of body.changes) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "One of these duty changes is invalid." };
    const change = raw as Record<string, unknown>;
    const id = typeof change.id === "string" ? change.id.trim() : "";
    if (!id || id.length > 100 || ids.has(id)) return { ok: false, error: "One of these duty changes is invalid." };
    ids.add(id);
    if (typeof change.completed !== "boolean") return { ok: false, error: "Choose whether each duty is complete." };
    if (change.value != null && !textWithin(change.value, 500)) return { ok: false, error: "Keep a duty value under 500 characters." };
    if (change.notes != null && !textWithin(change.notes, 1000)) return { ok: false, error: "Keep duty notes under 1,000 characters." };
    if (change.evidence_id != null && change.evidence_id !== "" && !isUuid(change.evidence_id)) return { ok: false, error: "That evidence attachment is not valid." };
    changes.push({
      id,
      completed: change.completed,
      value: typeof change.value === "string" ? change.value.trim() : null,
      notes: typeof change.notes === "string" ? change.notes.trim() : null,
      evidence_id: typeof change.evidence_id === "string" && change.evidence_id ? change.evidence_id : null,
    });
  }
  return {
    ok: true,
    value: {
      date: body.date,
      kind,
      version: Number(body.version),
      changes,
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
    },
  };
}

/** Celsius temperature and sanitizer PPM are distinct readings; kind is required. */
export function parseReadingCommand(body: Record<string, unknown>): PlatformParse<PlatformReadingCommand> {
  if (!isIsoDate(body.date)) return { ok: false, error: "Choose a valid reading date." };
  const slot = body.slot as (typeof READING_SLOTS)[number];
  if (!READING_SLOTS.includes(slot)) return { ok: false, error: "Choose the 11:00, 16:00 or 20:00 scheduled check." };
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0) return { ok: false, error: "Reload the saved reading before replacing it." };
  if (body.notes != null && !textWithin(body.notes, 2000)) return { ok: false, error: "Keep reading notes under 2,000 characters." };
  if (body.kind !== "temperature" && body.kind !== "sanitizer") return { ok: false, error: "Choose Celsius temperature or sanitizer PPM." };
  // Blank is never a zero-equivalent reading: a missing value stays missing.
  const raw = body.value;
  if (raw === "" || raw == null) return { ok: false, error: "Enter the reading before saving." };
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (body.kind === "temperature") {
    if (!isUuid(body.equipment_id)) return { ok: false, error: "Choose the equipment you checked." };
    if (!Number.isFinite(value) || value < -273.15 || value > 999.99) return { ok: false, error: "Enter a Celsius reading between -273.15 and 999.99." };
    return { ok: true, value: { kind: "temperature", date: body.date, slot, value, version: Number(body.version), notes, equipment_id: body.equipment_id } };
  }
  if (!Number.isFinite(value) || value < 0 || value > 99_999_999) return { ok: false, error: "Enter the sanitizer concentration in PPM." };
  return { ok: true, value: { kind: "sanitizer", date: body.date, slot, value, version: Number(body.version), notes, equipment_id: null } };
}
