import type { BtbRole } from "./btb-roles";
export { BTB_RESTAURANT } from "./btb-roles";
export const EMPLOYEE_ROLES = ["staff", "supervisor", "manager", "designer", "corporate", "owner"] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export interface BtbEmployee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  role: EmployeeRole;
  active: boolean;
  login_enabled: boolean;
  version: number;
  created_at: string;
}

export type TeamMember = Pick<BtbEmployee, "id" | "name" | "position" | "role" | "active">;
export interface BtbIdentity {
  role: BtbRole;
  name: string;
  email: string;
  employeeId: string | null;
  sessionVersion?: number;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
export const isEmployeeRole = (value: unknown): value is EmployeeRole => EMPLOYEE_ROLES.includes(value as EmployeeRole);
export const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 2_147_483_647;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Operational day in Saskatchewan, independent of a tablet's timezone. */
export function btbToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Regina", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function employeeEditableBy(actor: BtbRole, employeeRole: EmployeeRole): boolean {
  return (actor === "manager" && ["staff", "supervisor", "manager"].includes(employeeRole)) || (actor === "supervisor" && employeeRole === "staff");
}

export function attributionName(identity: BtbIdentity): string {
  return identity.employeeId ? identity.name : `${identity.role.charAt(0).toUpperCase()}${identity.role.slice(1)} (shared workspace)`;
}

export function validateEmployee(input: Record<string, unknown>): string | null {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100) return "Enter an employee name (up to 100 characters).";
  if (!isEmail(input.email)) return "Enter a valid employee email address.";
  if (typeof input.phone !== "string" || !/^[+\d\s().-]{7,30}$/.test(input.phone) || input.phone.replace(/\D/g, "").length < 7) return "Enter a valid phone number.";
  if (!isEmployeeRole(input.role)) return "Choose a staff, supervisor or manager role.";
  if (typeof input.position !== "string" || input.position.length > 100) return "Keep the position under 100 characters.";
  if (typeof input.active !== "boolean") return "Choose whether the employee is active.";
  return null;
}
