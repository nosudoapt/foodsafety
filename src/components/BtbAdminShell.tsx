"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, Building2, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import BtbWordmark from "./BtbWordmark";
import { fetchJson } from "@/lib/fetch-json";
import type { BtbAdminIdentity } from "@/lib/btb-admin";

export default function BtbAdminShell({ admin, children }: { admin: BtbAdminIdentity; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return; setBusy(true); setError("");
    try { await fetchJson("/api/auth/logout", { method: "POST" }); window.location.replace("/auth/sign-in"); }
    catch { setError("Could not sign out of the console. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="workspace-ui btb-console">
    <a href="#btb-console-main" className="workspace-skip">Skip to content</a>
    <header className="btb-console__header"><Link href="/btb/admin" className="btb-console__brand" aria-label="Between the Buns console"><BtbWordmark className="text-xl" /><span>Group console · powered by Pholo</span></Link><div className="ui-actions"><span className="btb-console__identity">{admin.name}<span className="ui-badge"><ShieldCheck size={13} aria-hidden="true" />Super admin</span></span><button className="ui-button ui-button--ghost" onClick={signOut} disabled={busy}><LogOut size={16} aria-hidden="true" />{busy ? "Signing out…" : "Console sign out"}</button></div></header>
    <div className="btb-console__body"><aside className="btb-console__sidebar"><p className="btb-console__eyebrow">Administration</p><nav aria-label="BTB console"><Link href="/btb/admin" aria-current={pathname === "/btb/admin" ? "page" : undefined}><LayoutDashboard size={18} aria-hidden="true" />Overview</Link><Link href="/btb/admin/locations" aria-current={pathname.startsWith("/btb/admin/locations") ? "page" : undefined}><Building2 size={18} aria-hidden="true" />Locations & people</Link></nav><div className="btb-console__separation"><p>Independent of the team workspace.</p><Link href="/btb/demo">Open the demo <ArrowUpRight size={14} aria-hidden="true" /></Link></div></aside><main id="btb-console-main" className="btb-console__main" tabIndex={-1}>{error && <div className="ui-notice ui-notice--error" role="alert">{error}</div>}{children}</main></div>
    <footer className="btb-console__footer">Between the Buns · A little clarity, across the group.</footer>
  </div>;
}
