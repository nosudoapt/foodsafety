"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { btbCanView, btbCanEdit, type BtbFeature } from "@/lib/btb-access";
import { btbCardForPath, btbPageAllowed } from "@/lib/btb-page-access";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import type { BtbRole } from "@/lib/btb-roles";

/** Covers direct navigation too, including read-only recipe/reference pages. */
export function BtbPageBoundary({ children }: { children: React.ReactNode }) {
  const { identity, loading, rows, error, accessError, reload } = useBtbWorkspace();
  const card = btbCardForPath(usePathname());
  if (loading) return <div className="workspace-loading btb-loading" role="status"><span className="ui-loader" aria-hidden="true" /><p>Opening your workspace…</p></div>;
  if (error || (!rows && identity?.role !== "admin")) return <div className="ui-empty btb-loading"><CircleAlert size={30} /><h1>Let’s reconnect your workspace.</h1><p role="alert">{error || accessError}</p><button className="ui-button" onClick={reload}>Try again</button></div>;
  if (!identity || (card && !btbPageAllowed(card, identity.role, rows))) return <div className="ui-empty btb-loading"><LockKeyhole size={30} /><h1>This page isn’t in your workspace.</h1><p>Your overview shows the tools available to your role.</p><Link className="ui-button ui-button--ghost" href="/between-the-buns">Back to overview</Link></div>;
  return <>{children}</>;
}

export default function BtbFeatureGate({ feature, wide = false, children }: {
  feature: BtbFeature;
  wide?: boolean;
  children: (readOnly: boolean, role: BtbRole) => React.ReactNode;
}) {
  const { identity, rows } = useBtbWorkspace();
  const card = btbCardForPath(usePathname());
  if (!identity || !btbCanView(feature, identity.role) || (card && !btbPageAllowed(card, identity.role, rows))) return null;
  return <div className={wide ? "btb-page btb-page--wide" : "btb-page"}>{children(!btbCanEdit(feature, identity.role), identity.role)}</div>;
}
