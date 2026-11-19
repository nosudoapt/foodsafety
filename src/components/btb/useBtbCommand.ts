"use client";

import { useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { jsonRequest, messageOf } from "./Feedback";

/** Retry an uncertain save with the SAME request ID and payload, never post twice. */
export function useBtbCommand(url: string, onSaved: () => void) {
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const run = async (body: Record<string, unknown>, success = "Saved."): Promise<boolean> => {
    if (running.current) return false;
    const signature = JSON.stringify(body);
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    running.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await fetchJson(url, jsonRequest({ ...body, request_id: pending.current.id }));
      pending.current = null; setNotice(success); onSaved(); return true;
    } catch (cause) { setError(messageOf(cause)); return false; }
    finally { running.current = false; setBusy(false); }
  };
  return { run, busy, error, notice };
}
