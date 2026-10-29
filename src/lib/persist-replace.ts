// Non-atomic row replacement with a compensating restore.
//
// The month-end page replaces a month's rows with DELETE-old → INSERT-new over
// PostgREST (two independent requests — there is no multi-request transaction).
// The ORIGINAL page code deleted first and, if the insert then failed, the
// previous counts/sales were silently LOST while the UI showed an error. This
// helper makes that failure mode recoverable:
//
//   1. BACKUP  — read the current rows. Failure aborts BEFORE any delete.
//   2. DELETE  — remove the old rows. Failure aborts (nothing lost).
//   3. INSERT  — write the new rows. On failure, RESTORE re-inserts the backup
//               so the previous state comes back.
//
// This is NOT atomic and does not claim to be (independent HTTP requests).
// If the restore ALSO fails, the result is explicitly unrecovered so the
// caller surfaces a loud, specific error naming the data that needs manual
// recovery — never a silent loss.

export interface ReplaceResult {
  ok: boolean;
  /** Which step failed, for precise error messages. */
  stage?: "backup" | "delete" | "insert" | "restore";
  /** True when the DB is consistent: fully replaced or fully restored. */
  recovered: boolean;
  inserted: number;
  message?: string;
}

export interface ReplaceOps<T> {
  /** Read the rows about to be replaced (the rollback copy). */
  backup(): Promise<{ rows: T[] | null; error: { message: string } | null }>;
  /** Delete the old rows. */
  del(): Promise<{ error: { message: string } | null }>;
  /** Insert the new rows; resolve with how many were written. */
  ins(): Promise<{ inserted: number; error: { message: string } | null }>;
  /** Re-insert the backup rows after a failed insert. */
  restore(rows: T[]): Promise<{ error: { message: string } | null }>;
  /** Human label used in messages, e.g. "count sheet save". */
  label: string;
}

export async function replaceRows<T>(ops: ReplaceOps<T>): Promise<ReplaceResult> {
  // 1. Backup first — if we can't read the old rows we must not delete them.
  const { rows: oldRows, error: backupErr } = await ops.backup();
  if (backupErr || !oldRows) {
    return {
      ok: false,
      stage: "backup",
      recovered: true,
      inserted: 0,
      message: `${ops.label} aborted before deleting anything: couldn't back up existing rows (${backupErr?.message ?? "no data"})`,
    };
  }

  // 2. Delete old rows.
  const { error: delErr } = await ops.del();
  if (delErr) {
    return {
      ok: false,
      stage: "delete",
      recovered: true,
      inserted: 0,
      message: `${ops.label} failed while replacing existing rows (${delErr.message}) — previous rows are still in place`,
    };
  }

  // 3. Insert new rows.
  const { inserted, error: insErr } = await ops.ins();
  if (!insErr) return { ok: true, recovered: true, inserted };

  // 3b. Insert failed after the delete — restore the backup so nothing is lost.
  if (oldRows.length === 0) {
    // Nothing existed before, so there is nothing to lose or restore.
    return {
      ok: false,
      stage: "insert",
      recovered: true,
      inserted: 0,
      message: `${ops.label} failed: ${insErr.message}`,
    };
  }

  const { error: restoreErr } = await ops.restore(oldRows);
  if (!restoreErr) {
    return {
      ok: false,
      stage: "insert",
      recovered: true,
      inserted: 0,
      message: `${ops.label} failed (${insErr.message}) — the previous rows were restored`,
    };
  }

  return {
    ok: false,
    stage: "restore",
    recovered: false,
    inserted: 0,
    message:
      `CRITICAL: ${ops.label} failed (${insErr.message}) AND restoring the previous rows also failed ` +
      `(${restoreErr.message}). The previous rows were deleted and the new ones were not written — ` +
      `re-enter this month's data before finalizing.`,
  };
}
