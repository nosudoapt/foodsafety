"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, LogOut } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";
import { BtbPageBoundary } from "@/components/BtbFeatureGate";
import { BtbWorkspaceProvider, useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { accessibleBtbCards, btbCardForPath } from "@/lib/btb-page-access";
import { BTB_ROLE_LABELS } from "@/lib/btb-roles";
import { fetchJson } from "@/lib/fetch-json";
import "@/app/btb-operations.css";

export default function BetweenTheBunsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/between-the-buns/login") return <>{children}</>;
  return <BtbWorkspaceProvider><BtbShell>{children}</BtbShell></BtbWorkspaceProvider>;
}

function BtbShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { identity, rows, loading } = useBtbWorkspace();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const current = btbCardForPath(pathname);
  const cards = identity ? accessibleBtbCards(identity.role, rows) : [];

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await fetchJson("/api/btb/logout", { method: "POST" });
      router.replace("/between-the-buns/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally { setSigningOut(false); }
  };

  return <div className="workspace-ui btb-shell">
    <a href="#btb-main" className="workspace-skip">Skip to content</a>
    <header className="btb-header">
      <div className="btb-header__inner">
        <Link href="/between-the-buns" className="btb-header__brand" aria-label="Between the Buns overview"><BtbWordmark className="text-lg sm:text-xl" /><span>Team workspace · powered by FoodSafe</span></Link>
        <div className="btb-header__actions">
          {identity && <Link href="/between-the-buns/account" className="btb-identity" aria-label={`My account: ${identity.name}`}><span>{identity.name}</span><span className="ui-badge ui-tone--purple">{BTB_ROLE_LABELS[identity.role]}</span></Link>}
          <button className="btb-header__signout" onClick={signOut} disabled={signingOut} aria-label={signingOut ? "Signing out" : "Sign out"}><LogOut size={17} aria-hidden="true" /><span>{signingOut ? "Signing out…" : "Sign out"}</span></button>
        </div>
      </div>
      <nav className="btb-subnav" aria-label="BTB workspace">
        <Link href="/between-the-buns" aria-current={pathname === "/between-the-buns" ? "page" : undefined}>{current || pathname.endsWith("/account") ? <ArrowLeft size={15} aria-hidden="true" /> : <span className="btb-subnav__dot" aria-hidden="true" />}Overview</Link>
        {pathname.endsWith("/account") && <span className="btb-subnav__current">My account</span>}
        {current && <span className="btb-subnav__current">{current.title}</span>}
        <label className="btb-jump"><span className="sr-only">Jump to a BTB tool</span><select disabled={loading || !cards.length} value={current?.href ?? ""} onChange={(event) => { if (event.target.value) router.push(event.target.value); }}><option value="">Jump to a tool…</option>{cards.map((card) => <option key={card.href} value={card.href}>{card.title}</option>)}</select></label>
      </nav>
    </header>
    {error && <div className="ui-notice ui-notice--error" role="alert">{error}</div>}
    <main id="btb-main" className="btb-content" tabIndex={-1}><BtbPageBoundary>{children}</BtbPageBoundary></main>
    <footer className="workspace-footer"><span>Between the Buns · A little clarity, every day.</span><Link href="/between-the-buns">Workspace overview <ArrowUpRight size={12} aria-hidden="true" /></Link></footer>
  </div>;
}
