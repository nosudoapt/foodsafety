"use client";
// Manager-only PAR status for the order sheet. Read from the server (which also
// decides who may see it), light red until the week is confirmed and light green
// for 168 hours after. Confirming writes only the week marker — no order data.

import { useCallback, useEffect, useState } from "react";
import { jsonRequest } from "@/components/btb/Feedback";
import { btbToday } from "@/lib/btb-team";
import { fetchJson } from "@/lib/fetch-json";

interface Status { parSet: boolean; weekStart: string; canManagePar: boolean }

export default function OrderParChip() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await fetchJson<Status>(`/api/btb/orders?date=${btbToday()}`)); }
    catch { setStatus(null); }
  }, []);

  // One request on mount; the chip owns its own status and never triggers a
  // page reload.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (!status?.canManagePar) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await fetchJson("/api/btb/orders", jsonRequest({ action: "par-set" }));
      await load();
    } catch { /* the chip keeps its previous state; nothing else changes */ }
    finally { setBusy(false); }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void confirm()}
      title={`Week of ${status.weekStart}`}
      className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60 ${status.parSet ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`}
    >
      PAR levels: {status.parSet ? "set for this week" : "not set — tap to confirm"}
    </button>
  );
}
