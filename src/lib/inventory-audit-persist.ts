// Atomicity-free persistence for the two-request snapshot + audit write.
//
// WHY THIS EXISTS: finalize and reopen each perform TWO dependent writes over
// PostgREST — (1) the snapshot/status row, then (2) an append-only audit row.
// PostgREST gives no multi-statement transaction, so these are independent
// requests. The original code `await`ed the audit insert and ignored its error,
// so a finalize could return ok:true while writing NO audit row — silent
// snapshot/audit inconsistency.
//
// WHY NOT CLAIM ATOMICITY: PostgREST still sends these as two independent
// requests. The routes now use a server-only service-role client, so a future
// service-role-only RPC can make the pair truly atomic; this prototype keeps
// the smaller compensating-write design. Failure is LOUD, rollback is checked,
// and tests cover both audit failure and rollback failure.
//
// Contract of persistWithAudit:
//   * the audit write's error IS checked;
//   * ok:true is returned ONLY when the audit row was written;
//   * if the audit write fails after the snapshot was written, a compensating
//     rollback runs so the DB is never left with an unaudited snapshot;
//   * if the rollback ALSO fails, a distinct unrecovered outcome is returned so
//     the operator gets a reliable, explicit recovery signal.

/** A month-end snapshot row as the DB returns it. Loose on extra columns. */
export interface SnapshotRow {
  count_month: string;
  opening_value: number;
  closing_value: number;
  purchases: number;
  sales: number | null;
  cogs: number | null;
  food_cost_pct: number | null;
  status: string;
  finalized_by: string | null;
  finalized_at?: string;
  reopened_by?: string | null;
  reopened_at?: string | null;
  reopen_reason?: string | null;
  version?: number;
  created_at?: string;
  [key: string]: unknown;
}

/** Minimal shape of a supabase-js write result we depend on. */
export interface WriteResult {
  error: { message: string } | null;
}

export interface PersistOutcome<T> {
  ok: boolean;
  /** Which write failed, for a precise HTTP error message. */
  stage?: "snapshot" | "audit" | "rollback";
  snapshot?: T;
  /**
   * True when the DB was left consistent — either fully written (ok) or fully
   * rolled back. False only when the audit write AND the rollback both failed,
   * which needs a human.
   */
  recovered: boolean;
  message?: string;
}

export interface PersistOps<T> {
  /** Write the snapshot/status row; resolve with the persisted row. */
  writeSnapshot(): Promise<{ data: T | null; error: { message: string } | null }>;
  /** Append the audit row for the persisted snapshot; surface any error. */
  writeAudit(written: T): Promise<WriteResult>;
  /** Undo writeSnapshot so a failed audit write leaves no orphan snapshot. */
  rollback(written: T): Promise<WriteResult>;
  /** Human label used in error messages, e.g. "finalization" / "reopen". */
  actionLabel: string;
}

/**
 * Perform snapshot-write + audit-write, checking the audit error and
 * compensating on failure. NOT atomic (independent requests) — by design, and
 * documented as such. See the module header for why an RPC is unsafe here today.
 */
export async function persistWithAudit<T>(
  month: string,
  ops: PersistOps<T>,
): Promise<PersistOutcome<T>> {
  // 1. Snapshot/status write. On failure nothing (else) was persisted, so there
  //    is no audit inconsistency to clean up.
  const { data: written, error: writeErr } = await ops.writeSnapshot();
  if (writeErr || !written) {
    return {
      ok: false,
      stage: "snapshot",
      recovered: true,
      message: writeErr?.message ?? `${ops.actionLabel} failed: could not write snapshot`,
    };
  }

  // 2. Audit write — the error is checked. This is the fix: the old code
  //    returned ok:true here no matter what.
  const { error: auditErr } = await ops.writeAudit(written);
  if (!auditErr) {
    return { ok: true, snapshot: written, recovered: true };
  }

  // 3. Audit failed after the snapshot was written. Compensate so we never
  //    leave a finalized/reopened snapshot with no audit trail.
  const { error: rollbackErr } = await ops.rollback(written);
  if (!rollbackErr) {
    return {
      ok: false,
      stage: "audit",
      snapshot: written,
      recovered: true,
      message: `${ops.actionLabel} rolled back: audit log write failed (${auditErr.message})`,
    };
  }

  // 4. Worst case: snapshot written, audit failed, rollback failed.
  return {
    ok: false,
    stage: "rollback",
    snapshot: written,
    recovered: false,
    message:
      `CRITICAL: ${ops.actionLabel} wrote the ${month} snapshot but the audit log write ` +
      `AND the rollback both failed. The snapshot may be inconsistent with the audit ` +
      `trail — inspect inventory_month_snapshots and inventory_audit_log for ${month} ` +
      `before retrying.`,
  };
}

/**
 * The mutable accounting + history columns restored by a rollback. Deliberately
 * excludes the immutable key (count_month) and created_at so a rollback can
 * never re-key or back-date a row.
 */
export function snapshotRestoreFields(row: SnapshotRow): Record<string, unknown> {
  return {
    opening_value: row.opening_value,
    closing_value: row.closing_value,
    purchases: row.purchases,
    sales: row.sales,
    cogs: row.cogs,
    food_cost_pct: row.food_cost_pct,
    status: row.status,
    finalized_by: row.finalized_by,
    finalized_at: row.finalized_at ?? null,
    reopened_by: row.reopened_by ?? null,
    reopened_at: row.reopened_at ?? null,
    reopen_reason: row.reopen_reason ?? null,
    version: row.version ?? 1,
  };
}
