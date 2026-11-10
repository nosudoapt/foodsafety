"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, ChevronRight, Command, LogOut, Menu, Search, SearchX, Settings, X } from "lucide-react";
import "@/app/admin.css";
import { DayDotDial } from "@/components/marketing/dot-theme";
import { NavIcon } from "@/components/admin/NavIcon";
import { activeWorkspaceItem, searchWorkspace, workspaceNavForRole } from "@/lib/workspace-nav";
import { roleLabel } from "@/lib/roles";
import { canAccess } from "@/lib/route-guards";

export interface AdminProfile {
  role: string;
  full_name: string;
  restaurant_name: string;
  email: string;
}

function subscribeToMobile(callback: () => void) {
  const media = window.matchMedia("(max-width: 1024px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export default function AdminShell({ profile, children }: { profile: AdminProfile | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [railOpen, setRailOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const railRef = useRef<HTMLElement>(null);
  const railButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mobile = useSyncExternalStore(subscribeToMobile, () => window.matchMedia("(max-width: 1024px)").matches, () => true);
  const role = profile?.role;
  const groups = useMemo(() => workspaceNavForRole(role), [role]);
  const current = activeWorkspaceItem(pathname, role);
  const results = useMemo(() => searchWorkspace(query, role), [query, role]);
  const filteredGroups = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase())),
  })).filter((group) => group.items.length > 0);

  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setRailOpen(false);
    setPaletteOpen(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setRailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!railOpen || !mobile) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    railRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const trigger = railButtonRef.current;
    return () => {
      document.body.style.overflow = originalOverflow;
      trigger?.focus();
    };
  }, [railOpen, mobile]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (paletteOpen && dialog && !dialog.open) dialog.showModal();
    if (!paletteOpen && dialog?.open) dialog.close();
  }, [paletteOpen]);

  useEffect(() => {
    if (paletteOpen) dialogRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, paletteOpen]);

  useEffect(() => {
    document.title = `${current?.label ?? "Workspace"} · FoodSafe`;
  }, [current?.label]);

  const go = (href: string) => {
    setPaletteOpen(false);
    setQuery("");
    setCursor(0);
    router.push(href);
  };

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError("");
    try {
      const { supabase } = await import("@/lib/supabase");
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/auth/sign-in");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="ax2 workspace-ui">
      <a href="#workspace-main" className="workspace-skip">Skip to content</a>
      {railOpen && mobile && <div className="scrim scrim--rail" onClick={() => setRailOpen(false)} aria-hidden="true" />}

      <aside
        ref={railRef}
        id="workspace-navigation"
        className="rail"
        data-open={railOpen}
        aria-label="Workspace navigation"
        role={mobile && railOpen ? "dialog" : undefined}
        aria-modal={mobile && railOpen ? true : undefined}
        inert={mobile && !railOpen}
        onKeyDown={(event) => {
          if (!mobile || !railOpen || event.key !== "Tab") return;
          const elements = railRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input');
          if (!elements?.length) return;
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}
      >
        <div className="rail__head">
          <div className="rail__brandrow">
            <Link href="/dashboard" className="railbrand">
              <DayDotDial size={34} interactive={false} />
              <span><span className="railbrand__word">FoodSafe</span><span className="railbrand__site">The everyday, under control.</span></span>
            </Link>
            {mobile && <button className="rail__close" onClick={() => setRailOpen(false)} aria-label="Close navigation"><X size={18} /></button>}
          </div>
          <div className="rail__identity">
            <span className="rail__identity-dot" aria-hidden="true" />
            <span>{profile ? roleLabel(profile.role) : "Your workspace"}<small>{profile?.restaurant_name || "FoodSafe workspace"}</small></span>
          </div>
        </div>

        <div className="rail__search">
          <Search size={15} aria-hidden="true" />
          <input className="rail__input" type="search" placeholder="Find a tool…" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter navigation" />
        </div>
        <nav className="rail__nav" aria-label="Pages">
          {filteredGroups.length === 0 && <p className="rail__empty">No tools match “{filter}”. <button onClick={() => setFilter("")}>Clear search</button></p>}
          {filteredGroups.map((group) => (
            <div className="rail__group" key={group.label}>
              <span className="rail__grouplabel">{group.label}</span>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="raillink" aria-current={current?.href === item.href ? "page" : undefined} onClick={() => setRailOpen(false)}>
                  <NavIcon name={item.icon} size={18} /><span>{item.label}</span>
                  {item.href === "/between-the-buns" && <ArrowUpRight size={13} className="rail__external" aria-hidden="true" />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="rail__foot">
          <div className="account account--static">
            <span className="account__avatar" aria-hidden="true">{(profile?.full_name || "F").charAt(0).toUpperCase()}</span>
            <span className="account__text"><span className="account__name">{profile?.full_name || "Your team"}</span><span className="account__role">{profile ? roleLabel(profile.role) : ""}</span></span>
            {role && canAccess("/settings", role) && <Link href="/settings" className="rail__close" aria-label="Account settings"><Settings size={17} /></Link>}
            <button className="rail__close" onClick={signOut} disabled={signingOut} aria-label={signingOut ? "Signing out" : "Sign out"}><LogOut size={17} /></button>
          </div>
          {signOutError && <p className="rail__empty" role="alert">{signOutError}</p>}
        </div>
      </aside>

      <div className="main" inert={mobile && railOpen}>
        <header className="topbar" data-stuck="true">
          <button ref={railButtonRef} type="button" className="iconbtn railbtn" onClick={() => setRailOpen(true)} aria-label="Open navigation" aria-expanded={railOpen} aria-controls="workspace-navigation"><Menu size={20} /></button>
          <nav className="crumb" aria-label="Breadcrumb">
            <Link href="/dashboard">Workspace</Link><ChevronRight size={13} aria-hidden="true" /><span className="crumb__here">{current?.label || "Overview"}</span>
          </nav>
          <div className="topbar__right">
            <button type="button" className="cmdk-btn" onClick={() => setPaletteOpen(true)} aria-label="Search pages"><Search size={16} aria-hidden="true" /><span>Search anything</span><kbd>⌘ K</kbd></button>
            <span className="topbar__avatar" title={profile?.full_name}>{(profile?.full_name || "F").charAt(0).toUpperCase()}</span>
          </div>
        </header>
        <main id="workspace-main" className="canvas" tabIndex={-1}>{children}</main>
        <footer className="workspace-footer"><span>FoodSafe · A little clarity, every day.</span><Link href="/">About FoodSafe <ArrowUpRight size={12} aria-hidden="true" /></Link></footer>
      </div>

      <dialog ref={dialogRef} className="palette" aria-label="Search pages" onCancel={() => setPaletteOpen(false)} onClose={() => setPaletteOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
        <div className="palette__inputrow">
          <Command size={18} aria-hidden="true" />
          <input
            className="palette__input" autoFocus role="combobox" aria-expanded={paletteOpen} aria-autocomplete="list" aria-controls="palette-results"
            value={query} onChange={(event) => { setQuery(event.target.value); setCursor(0); }}
            placeholder="Find a page, task or record…" aria-label="Search pages"
            aria-activedescendant={results[cursor] ? `palette-result-${cursor}` : undefined}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(value + 1, Math.max(0, results.length - 1))); }
              if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(value - 1, 0)); }
              if (event.key === "Enter" && results[cursor]) { event.preventDefault(); go(results[cursor].href); }
            }}
          />
          <button type="button" className="iconbtn" onClick={() => setPaletteOpen(false)} aria-label="Close search"><X size={18} /></button>
        </div>
        <div className="palette__list" id="palette-results" role="listbox" aria-label="Matching pages">
          {results.length === 0 ? <p className="palette__empty"><SearchX size={24} aria-hidden="true" />No pages match “{query}”. Try “checks” or “marketing”.</p> : results.map((item, index) => (
            <button key={item.href} id={`palette-result-${index}`} role="option" tabIndex={-1} aria-selected={index === cursor} data-active={index === cursor} className="palette__item" onMouseEnter={() => setCursor(index)} onClick={() => go(item.href)}>
              <NavIcon name={item.icon} size={18} />{item.label}<ChevronRight size={14} className="palette__arrow" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="palette__foot"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>esc</kbd> to close</span></div>
      </dialog>
    </div>
  );
}
