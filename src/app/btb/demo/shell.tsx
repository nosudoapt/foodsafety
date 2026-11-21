"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, LogOut, Search } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";
import { BtbPageBoundary } from "@/components/BtbFeatureGate";
import ActivityTracker from "@/components/ActivityTracker";
import { BtbWorkspaceProvider, useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { searchBtbCards } from "@/lib/btb-dashboard";
import { btbCardForPath } from "@/lib/btb-page-access";
import { BTB_ROLE_LABELS } from "@/lib/btb-roles";
import { fetchJson } from "@/lib/fetch-json";
import { announceBtbSessionChange, clearBtbPublicCapabilities } from "@/lib/btb-public-fetch";
import "@/app/btb-operations.css";

// The sign-in and set-password screens live at /btb/login, outside this
// layout, so they render their own full-page shell. Everything under
// /btb/demo gets the workspace chrome.
export default function BtbWorkspaceLayout({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <BtbWorkspaceProvider><BtbActivityTracker /><BtbShell slug={slug}>{children}</BtbShell></BtbWorkspaceProvider>;
}

function BtbActivityTracker() {
  const { identity, access, loading } = useBtbWorkspace();
  return <ActivityTracker workspace="btb" enabled={!loading && !!identity && !!access} identityKey={`${identity?.employeeId ?? "shared"}:${identity?.role ?? ""}:${identity?.sessionVersion ?? ""}`} />;
}

function BtbShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const rawPathname = usePathname();
  // Middleware rewrites /btb/<slug>/... to this folder. Depending on whether
  // Next exposes the visible URL or the rewritten one, normalise both back to
  // the card paths the navigation catalogue uses.
  const base = `/btb/${slug}`;
  const pathname = rawPathname === base ? "/btb/demo"
    : rawPathname.startsWith(`${base}/`) ? `/btb/demo${rawPathname.slice(base.length)}`
      : rawPathname;
  const router = useRouter();
  const { identity, rows, pageGrants, loading } = useBtbWorkspace();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const current = btbCardForPath(pathname);
  const matches = identity && query.trim() !== "" ? searchBtbCards(identity.role, rows, query, pageGrants).filter(card => card.feature !== "platform" || identity.employeeId).slice(0, 6) : [];

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    clearBtbPublicCapabilities();
    setError("");
    try {
      await fetchJson("/api/btb/logout", { method: "POST" });
      announceBtbSessionChange();
      // Cross the authentication boundary with a fresh document. Refreshing
      // the old protected route races its server redirect and retains RSC data.
      window.location.replace("/btb/login");
    } catch {
      setError("Could not sign out. Please try again.");
    } finally { setSigningOut(false); }
  };

  return <div className="workspace-ui btb-shell" data-btb-slug={slug}>
    <a href="#btb-main" className="workspace-skip">Skip to content</a>
    <header className="btb-header">
      <div className="btb-header__inner">
        <Link href="/btb/demo" className="btb-header__brand" aria-label="Between the Buns overview"><BtbWordmark className="text-lg sm:text-xl" /><span>Team workspace · powered by Pholo</span></Link>
        <div className="btb-header__actions">
          {identity && <Link href="/btb/demo/account" className="btb-identity" aria-label={`My account: ${identity.name}`}><span>{identity.name}</span><span className="ui-badge ui-tone--purple">{BTB_ROLE_LABELS[identity.role]}</span></Link>}
          <button className="btb-header__signout" onClick={signOut} disabled={signingOut} aria-label={signingOut ? "Signing out" : "Sign out"}><LogOut size={17} aria-hidden="true" /><span>{signingOut ? "Signing out…" : "Sign out"}</span></button>
        </div>
      </div>
      <nav className="btb-subnav" aria-label="BTB workspace">
        <Link href="/btb/demo" aria-current={pathname === "/btb/demo" ? "page" : undefined}>{current || pathname.endsWith("/account") ? <ArrowLeft size={15} aria-hidden="true" /> : <span className="btb-subnav__dot" aria-hidden="true" />}Overview</Link>
        {pathname.endsWith("/account") && <span className="btb-subnav__current">My account</span>}
        {current && <span className="btb-subnav__current">{current.title}</span>}
        <div className="btb-search">
          <label className="btb-search__field">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Search BTB pages</span>
            <input
              type="search"
              placeholder="Search tools…"
              autoComplete="off"
              disabled={loading || !identity}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { window.setTimeout(() => setSearchOpen(false), 150); }}
              aria-haspopup="listbox"
            />
          </label>
          {searchOpen && query.trim() !== "" && (
            matches.length
              ? <ul className="btb-search__results" role="listbox" aria-label="Search BTB tools">
                  {matches.map((card) => (
                    <li key={card.href} role="option" aria-selected={card.href === pathname}>
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setSearchOpen(false); router.push(card.href); }}>
                        <strong>{card.title}</strong>
                        <span>{card.desc}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              : <p className="btb-search__results btb-search__empty" aria-live="polite">No tools match “{query}”.</p>
          )}
        </div>
      </nav>
    </header>
    {error && <div className="ui-notice ui-notice--error" role="alert">{error}</div>}
    <main id="btb-main" className="btb-content" tabIndex={-1}><BtbPageBoundary>{children}</BtbPageBoundary></main>
    <footer className="workspace-footer"><span>Between the Buns · A little clarity, every day.</span><Link href="/btb/demo">Workspace overview <ArrowUpRight size={12} aria-hidden="true" /></Link></footer>
  </div>;
}
