"use client";

import type { OfflineOp } from "@/lib/offline-queue";

/** Retained failures are evidence, not a successful database save. */
export default function OfflineQueueNotice({ ops, syncing, onRetry }: {
  ops: readonly OfflineOp[];
  syncing: boolean;
  onRetry: () => void;
}) {
  if (!ops.length) return null;
  const attention = ops.filter((op) => op.state === "dead_letter").length;
  const exportRecords = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, operations: ops }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "foodsafe-retained-records.json"; link.click();
    URL.revokeObjectURL(url);
  };
  return <section aria-label="Offline records" className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-900">
    <p role="status">{ops.length} record{ops.length === 1 ? "" : "s"} stored on this device, not yet confirmed in the database. Pending records retry when the connection returns.</p>
    {attention > 0 && <p role="alert" className="mt-2 font-semibold">{attention} need{attention === 1 ? "s" : ""} attention after repeated failure or queue overflow. Nothing has been discarded. Retry these records to resume ordered sync, or export them before clearing this device.</p>}
    <details className="mt-2"><summary className="min-h-11 flex items-center cursor-pointer">View retained records</summary>
      <ul className="list-disc pl-5 space-y-1">{ops.map((op) => <li key={op.id}>{op.label} — {op.state === "dead_letter" ? "needs attention" : "waiting to sync"}</li>)}</ul>
    </details>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" className="ui-button ui-button--ghost min-h-11" disabled={syncing} onClick={onRetry}>{syncing ? "Syncing retained records…" : "Retry retained records"}</button>
      <button type="button" className="ui-button ui-button--ghost min-h-11" onClick={exportRecords}>Export retained records</button>
    </div>
  </section>;
}
