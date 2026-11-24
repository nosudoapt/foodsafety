// Pure request policy, shared by the server client and executable security tests.
// The catalog supplies compatibility information, never authorization.
import { BtbApiError } from "./api-errors";
import type { WorkspaceAuthContext, WorkspaceClaims } from "./workspace-auth-types";

export interface WorkspaceTable { name: string; columns: string[]; uuidTenant: boolean }
export interface WorkspaceDatabaseScope { claims: WorkspaceClaims; principal: WorkspaceAuthContext; tables: WorkspaceTable[]; employeeIds: string[]; consoleLocationIds: string[] }

const REGISTERS = new Set([
  "allergen_records", "app_activity", "branding_requests", "business_documents", "cash_outs", "cleaning_logs", "cleaning_records",
  "compliance_documents", "corporate_dates", "corporate_inspections", "corrective_actions", "daily_checks", "delivery_records",
  "emergency_contacts", "equipment", "handbook_documents", "handbook_signatures", "inhouse_inspections", "login_vault",
  "marketing_promotions", "new_restaurant_tasks", "operational_protocols", "order_sheets", "pest_control", "prep_counts", "print_manuals",
  "social_media_calendar", "staff_licenses", "staff_members", "staff_shifts", "temperature_records", "training_records", "training_topics", "training_sections",
  "inventory_items", "inventory_counts", "inventory_purchases", "inventory_purchase_lines", "inventory_month_summary", "inventory_month_snapshots", "inventory_audit_log",
  "btb_ai_usage", "btb_bank_accounts", "btb_bank_allocations", "btb_bank_statements", "btb_bank_transactions", "btb_check_revisions", "btb_checklists",
  "btb_clock_attempts", "btb_clock_devices", "btb_compliance_versions", "btb_design_versions", "btb_document_imports", "btb_edit_log", "btb_email_jobs",
  "btb_events", "btb_franchise_tasks", "btb_inventory_invoices", "btb_licence_email_log", "btb_location_settings", "btb_notification_settings", "btb_notifications",
  "btb_operation_templates", "btb_order_revisions", "btb_order_sheets", "btb_par_weeks", "btb_prep_assignments", "btb_prep_comments", "btb_prep_drafts",
  "btb_prep_events", "btb_prep_par_levels", "btb_prep_submissions", "btb_promotion_comments", "btb_sanitizer_logs", "btb_sanitizer_settings", "btb_schedule_runs",
  "btb_shift_checks", "btb_shift_templates", "btb_shifts", "btb_staff_licences", "btb_task_assignments", "btb_temperature_standards", "btb_time_corrections",
  "btb_time_entries", "btb_training_records", "btb_training_reviews", "workspace_location_role_access",
]);
const READ_ONLY = new Set(["locations", "location_members", "btb_location_access", "btb_employees", "role_page_access", "btb_page_permissions", "btb_design_formats", "btb_social_platforms"]);
const REFERENCE_REGISTERS = new Set(["btb_design_formats", "btb_social_platforms", "btb_page_permissions"]);
const UUID_ACTOR_RPCS = new Set([
  "btb_admin_locations", "btb_admin_monitoring", "btb_admin_people", "btb_admin_create_location", "btb_admin_update_location",
  "btb_admin_add_person", "btb_admin_issue_invite", "btb_admin_remove_person", "btb_admin_block_person", "btb_admin_reset_password",
  "btb_employee_add_person", "btb_employee_issue_invite", "btb_ai_settings_get", "btb_ai_settings_put",
  "btb_platform_bootstrap", "btb_platform_overview", "btb_platform_read", "btb_platform_notification_read", "btb_platform_user", "btb_platform_settings",
  "btb_platform_compliance", "btb_platform_finance", "btb_platform_finance_read", "btb_platform_inventory_finance", "btb_platform_file_get", "btb_platform_file_put",
  "btb_platform_import", "btb_platform_marketing", "btb_platform_resend", "btb_platform_save_check", "btb_platform_save_reading", "btb_platform_schedule",
  "btb_platform_time", "btb_platform_time_read",
]);
const PERSONAL_RPCS = new Set(["btb_save_shift_check_scoped", "btb_save_order_scoped", "btb_save_training_record"]);
const LEGACY_RPCS = new Set(["btb_save_employee", "btb_save_shift_scoped", "btb_save_shift_check_scoped", "btb_save_order_scoped", "btb_save_temperature_sheet_scoped", "btb_save_training_topic", "btb_save_training_record", "btb_review_training", "btb_claim_licence_email"]);
const RPCS = new Set([...UUID_ACTOR_RPCS, ...LEGACY_RPCS, "workspace_btb_page_grants", "btb_insert_temp_record"]);

const deny = (message = "This request is not permitted in the current workspace."): never => { throw new BtbApiError(message, 403); };
const readMethod = (method: string) => method === "GET" || method === "HEAD";
function assertBinding(value: unknown, expected: unknown): void { if (value !== expected) deny(); }

/** A location argument may name the session's own branch, or — for a console —
 *  any branch of its estate. Its session is pinned to one branch, but a console
 *  manages them all, so equality with that id would lock it out of every other
 *  one. Employees are unaffected: their set is empty. */
function assertLocation(value: unknown, scope: WorkspaceDatabaseScope): void {
  if (value === scope.claims.locationId) return;
  if (scope.claims.principalType === "console" && typeof value === "string" && scope.consoleLocationIds.includes(value)) return;
  deny("This location is not the current workspace.");
}

/** Append a separate AND predicate. Caller filters, OR groups, aliased selects,
 * and null-location filters cannot replace the server's scope. Embedded reads
 * are rejected: a scoped root is not proof that its joined rows are in scope. */
export function scopeTableRequest(url: URL, method: string, body: unknown, table: WorkspaceTable, scope: WorkspaceDatabaseScope): unknown {
  const { claims, principal } = scope;
  if (!["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(method)) deny();
  if (!REGISTERS.has(table.name) && !READ_ONLY.has(table.name) && table.name !== "profiles") deny();
  if (READ_ONLY.has(table.name) && !readMethod(method)) deny("Use the authorized workspace action to change assignments or access.");
  for (const [key, value] of url.searchParams) {
    if (key === "select" && /[()!]/.test(value)) deny("Embedded register reads are not supported.");
    if (key.includes(".") || key === "columns" && /[^a-z0-9_,"\s]/i.test(value)) deny();
  }
  const bindings: Record<string, string> = {};
  if (table.columns.includes("location_id")) bindings.location_id = claims.locationId;
  if (table.uuidTenant) bindings.tenant_id = claims.tenantId;
  if (table.columns.includes("restaurant_name") && !["profiles", "btb_employees"].includes(table.name)) bindings.restaurant_name = principal.tenantName;
  if (table.name === "locations") bindings.id = claims.locationId;
  if (table.name === "profiles") {
    if (claims.principalType !== "supabase") deny();
    bindings.id = principal.credentialId;
    if (!readMethod(method) && method !== "PATCH") deny();
    if (body && (typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["full_name"].includes(key)))) deny("Profile privileges cannot be changed from this form.");
  }
  if (table.name === "location_members") {
    if (claims.principalType !== "supabase") deny();
    bindings.user_id = principal.credentialId;
  }
  if (table.name === "app_activity") bindings.actor_id = principal.credentialId;
  if (table.name === "role_page_access") bindings.role = claims.role;
  if (table.name === "btb_employees") {
    if (claims.principalType !== "employee" && claims.principalType !== "console") deny();
    // Empty membership means FALSE, never an empty .in() that can be dropped.
    url.searchParams.append("id", `in.(${scope.employeeIds.length ? scope.employeeIds.join(",") : "00000000-0000-0000-0000-000000000000"})`);
    bindings.tenant_id = claims.tenantId;
  }
  if (table.name === "login_vault" && !["owner", "multi_location_owner", "corporate"].includes(claims.role)) deny();
  if (!Object.keys(bindings).length && !REFERENCE_REGISTERS.has(table.name)) deny("This register has no verified workspace scope.");
  for (const [column, value] of Object.entries(bindings)) url.searchParams.append(column, `eq.${value}`);
  if (readMethod(method) || method === "DELETE" || body === undefined) return body;
  const rows = Array.isArray(body) ? body : [body];
  const stamped = rows.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new BtbApiError("Send valid records.");
    const row = { ...item } as Record<string, unknown>;
    for (const [column, value] of Object.entries(bindings)) {
      if (column in row) assertBinding(row[column], value);
      // Scope cannot be supplied through a partial columns= list either.
      row[column] = value;
    }
    if (claims.principalType === "supabase" && "user_id" in row) assertBinding(row.user_id, principal.credentialId);
    return row;
  });
  url.searchParams.delete("columns");
  return Array.isArray(body) ? stamped : stamped[0];
}

/** Explicit RPC allowlist. Credential lookup, session creation, global jobs,
 * bearer-token issuance and arbitrary SQL helpers are NEVER application RPCs. */
export function scopeRpcRequest(name: string, method: string, body: unknown, scope: WorkspaceDatabaseScope): Record<string, unknown> {
  if (!RPCS.has(name) || method !== "POST" || !body || typeof body !== "object" || Array.isArray(body)) deny();
  const { claims, principal } = scope;
  const args = { ...(body as Record<string, unknown>) };
  if (name === "btb_insert_temp_record") {
    if (claims.principalType !== "supabase") deny();
    return args; // SQL derives and checks the author, tenant, current location and role.
  }
  if (claims.tenantSlug !== "between-the-buns" || !["employee", "console"].includes(claims.principalType)) deny();
  if (name.startsWith("btb_admin_") ? claims.principalType !== "console" : claims.principalType !== "employee") deny();
  for (const key of ["p_location", "p_location_id"]) if (key in args) assertLocation(args[key], scope);
  if (UUID_ACTOR_RPCS.has(name)) {
    if ("p_actor" in args) assertBinding(args.p_actor, principal.credentialId);
    if ("p_session" in args) assertBinding(args.p_session, principal.sourceVersion);
    args.p_actor = principal.credentialId;
    args.p_session = principal.sourceVersion;
  } else if ("p_actor" in args) {
    assertBinding(args.p_actor, principal.name);
    args.p_actor = principal.name;
  }
  if (PERSONAL_RPCS.has(name)) assertBinding(args.p_employee_id, principal.credentialId);
  if (name === "btb_review_training") assertBinding(args.p_reviewer, principal.credentialId);
  if (name === "workspace_btb_page_grants") assertBinding(args.p_employee, principal.credentialId);
  if (name === "btb_save_shift_scoped" && !scope.employeeIds.includes(String(args.p_employee_id))) deny();
  // The original settings/notifications reader used to omit this scope.
  if (name === "btb_platform_read") args.p_location = claims.locationId;
  return args;
}
