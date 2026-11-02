"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

/** A response belongs to its URL and request generation, never the next form. */
export function useBtbData<T>(url: string | null) {
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const key = `${url ?? ""}:${revision}`;
  const [state, setState] = useState<{ url: string | null; key: string; data: T | null; error: string }>({ url: null, key: "", data: null, error: "" });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const requestGeneration = ++generation.current;
    void fetchJson<T>(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }).then((data) => {
      if (!controller.signal.aborted && requestGeneration === generation.current) setState({ url, key, data, error: "" });
    }).catch((cause) => {
      if (!controller.signal.aborted && requestGeneration === generation.current) setState((previous) => ({ url, key, data: previous.url === url ? previous.data : null, error: cause instanceof Error ? cause.message : "The records could not be loaded." }));
    });
    return () => controller.abort();
  }, [url, key]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const update = useCallback((apply: (data: T) => T) => {
    generation.current++;
    setState((previous) => previous.url === url && previous.data ? { ...previous, key, data: apply(previous.data), error: "" } : previous);
  }, [key, url]);
  // A same-URL refresh keeps forms mounted, including in-memory drafts when
  // browser storage is unavailable. A different URL never shows the old record.
  return { data: state.url === url ? state.data : null, error: state.key === key ? state.error : "", loading: !!url && state.key !== key, reload, update };
}
