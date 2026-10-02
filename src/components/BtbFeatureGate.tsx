"use client";

// Client gate for a Between the Buns feature page. Fetches the signed-in BTB
// role (same /api/btb/me the hub header uses), then renders its child with the
// computed read-only flag. Access + edit rights come from the single source of
// truth in src/lib/btb-access.ts. Renders a spinner while resolving and a clear
// "no access" card if the role may not see the feature (defense in depth — the
// hub already hides the card).
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { btbCanView, btbCanEdit, type BtbFeature } from "@/lib/btb-access";
import { isBtbRole, type BtbRole } from "@/lib/btb-roles";

export default function BtbFeatureGate({
  feature,
  wide = false,
  children,
}: {
  feature: BtbFeature;
  /** Full-width sheets (cleaning schedule, prep sheet) own their own layout —
   *  skip the default centred container so wide grids aren't squeezed. */
  wide?: boolean;
  /** readOnly first (existing pages), role second (pages that gate fields
   *  more tightly than the feature matrix, e.g. manager-only PAR). */
  children: (readOnly: boolean, role: BtbRole) => React.ReactNode;
}) {
  const [role, setRole] = useState<BtbRole | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/btb/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string } | null) => {
        if (cancelled) return;
        if (d?.role && isBtbRole(d.role)) setRole(d.role);
        setReady(true);
      })
      .catch(() => !cancelled && setReady(true));
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600" />
      </div>
    );
  }

  if (!role || !btbCanView(feature, role)) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <Lock className="w-8 h-8 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500 text-sm">
          This section isn’t available for your role.
        </p>
      </div>
    );
  }

  return (
    <div className={wide ? "" : "max-w-4xl mx-auto px-4 py-8"}>
      {children(!btbCanEdit(feature, role), role)}
    </div>
  );
}
