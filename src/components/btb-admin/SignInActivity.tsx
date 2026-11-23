"use client";

import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import type { BtbAdminLoginActivity } from "@/lib/btb-admin";

const when = (value: string) => new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
const OUTCOMES: Record<string, { label: string; accent: "green" | "red" | "amber" | "slate" }> = {
  success: { label: "Signed in", accent: "green" },
  bad_password: { label: "Wrong password", accent: "amber" },
  no_account: { label: "Unknown email", accent: "amber" },
  disabled: { label: "Account not active", accent: "amber" },
  blocked: { label: "Blocked (too many tries)", accent: "red" },
  ip_blocked: { label: "Blocked (network)", accent: "red" },
  shared_refused: { label: "Shared account refused", accent: "slate" },
  branch_refused: { label: "Wrong branch", accent: "slate" },
};

/** Every sign-in attempt, refusals included — the answer to "who is hammering
 *  the login" without needing a paid log plan. */
export default function SignInActivity() {
  const [revision, setRevision] = useState(0);
  const { data, loading, error, reload } = useBtbData<BtbAdminLoginActivity>(`/api/btb/admin/login-activity?r=${revision}`);
  return <section className="ui-card btb-console__panel" aria-labelledby="overview-signin-heading">
    <div className="btb-console__toolbar">
      <h2 id="overview-signin-heading">Sign-in activity</h2>
      <Button accent="red" variant="ghost" disabled={loading} onClick={() => { setRevision((value) => value + 1); reload(); }}><RefreshCcw size={16} aria-hidden="true" />Refresh</Button>
    </div>
    <p className="btb-console__hint">Last 40 attempts across the team workspace and this console, with the network they came from. Only failed passwords count toward a lockout, and a correct password always clears it. Emails are partly masked.</p>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && !error && <>
      <div className="btb-console__metrics">
        <div className="btb-console__metric"><span className="btb-console__metric-head">Signed in · 24h</span><strong>{data.successes24h}</strong></div>
        <div className="btb-console__metric"><span className="btb-console__metric-head">Refused · 24h</span><strong>{data.failures24h}</strong></div>
        <div className="btb-console__metric"><span className="btb-console__metric-head">Blocked · 24h</span><strong>{data.blocked24h}</strong></div>
      </div>
      {data.events.length === 0 ? <p className="btb-console__hint">No sign-in attempts recorded yet.</p> :
        <div className="btb-console__scroll" role="region" aria-label="Sign-in attempts" tabIndex={0}>
          <table className="btb-console__events">
            <thead><tr><th scope="col">When</th><th scope="col">Account</th><th scope="col">Where</th><th scope="col">Result</th><th scope="col">Network</th></tr></thead>
            <tbody>{data.events.map((event, index) => {
              const outcome = OUTCOMES[event.outcome] ?? { label: event.outcome.replaceAll("_", " "), accent: "slate" as const };
              return <tr key={index}>
                <td>{when(event.created_at)}</td><td>{event.email}</td>
                <td>{event.scope === "console" ? "Console" : "Team workspace"}</td>
                <td><Badge accent={outcome.accent}>{outcome.label}</Badge></td><td>{event.ip ?? "—"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    </>}
  </section>;
}
