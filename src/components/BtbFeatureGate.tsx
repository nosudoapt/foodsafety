"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { btbCanView, btbCanEdit, type BtbFeature } from "@/lib/btb-access";
import { btbCardForPath, btbPageAllowed } from "@/lib/btb-page-access";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import type { BtbRole } from "@/lib/btb-roles";
import { BTB_CARDS } from "@/lib/btb-hub";

/** Client refresh/navigation companion. Every leaf also has a server gate. */
export function BtbPageBoundary({ children }: { children: React.ReactNode }) {
  const { identity, loading, rows, pageGrants, error, accessError, reload } = useBtbWorkspace();
  const card = btbCardForPath(usePathname());
  if (loading) return <div className="workspace-loading btb-loading" role="status"><span className="ui-loader" aria-hidden="true" /><p>Opening your workspace…</p></div>;
  if (error || !rows) return <div className="ui-empty btb-loading"><CircleAlert size={30} /><h1>Let’s reconnect your workspace.</h1><p role="alert">{error || accessError}</p><button className="ui-button" onClick={reload}>Try again</button></div>;
  if (!identity || (card && !btbPageAllowed(card, identity.role, rows, pageGrants))) return <div className="ui-empty btb-loading"><LockKeyhole size={30} /><h1>This page isn’t in your workspace.</h1><p>Your overview shows the tools available to your role and assigned locations.</p><Link className="ui-button ui-button--ghost" href="/btb/demo">Back to overview</Link></div>;
  return <>{children}</>;
}

export default function BtbFeatureGate({ feature, wide = false, children }: {
  feature: BtbFeature;
  wide?: boolean;
  children: (readOnly: boolean, role: BtbRole) => React.ReactNode;
}) {
  const { identity, rows, pageGrants } = useBtbWorkspace();
  const current = btbCardForPath(usePathname());
  const card = current?.feature === feature ? current : BTB_CARDS.find(item => item.feature === feature);
  if (!identity || !card || !btbCanView(feature, identity.role) || !btbPageAllowed(card, identity.role, rows, pageGrants)) return null;
  return <div className={wide ? "btb-page btb-page--wide" : "btb-page"}>{children(!btbCanEdit(feature, identity.role), identity.role)}</div>;
}
