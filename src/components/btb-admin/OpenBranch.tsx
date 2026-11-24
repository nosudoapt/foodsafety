"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { jsonRequest } from "@/components/btb/Feedback";
import { fetchJson } from "@/lib/fetch-json";

/** Console → branch entry.
 *
 *  Entering a branch workspace is an explicit, server-validated act: the switch
 *  endpoint re-checks the console's assignment and rotates the signed session to
 *  that branch, then we cross over with a fresh document so the proxy and the
 *  page boundary both see the new branch. Nothing is inferred from the URL. */
export default function OpenBranch({ locationId, slug, name }: { locationId: string; slug: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/auth/location", jsonRequest({ locationId }));
      window.location.assign(`/btb/${slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this store.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button accent="red" variant="ghost" onClick={open} disabled={busy}>
        {busy ? "Opening…" : `Open ${name} workspace`}
      </Button>
      {error && <p className="ui-notice ui-notice--error" role="alert">{error}</p>}
    </>
  );
}
