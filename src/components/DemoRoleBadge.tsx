"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { demoBadgeLabel, isDemoEmail } from "@/lib/demo-roles";

// "Demo — Owner" badge + "Switch role" link, shown only when the signed-in
// session belongs to one of the seeded demo accounts, so a prospect always
// knows which perspective they are looking at. Renders nothing otherwise.
export default function DemoRoleBadge({ compact = false }: { compact?: boolean }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (cancelled || !user || !isDemoEmail(user.email)) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!cancelled) setRole(profile?.role ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!role) return null;

  return (
    <div
      className={
        compact
          ? "flex items-center gap-2"
          : "flex items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2"
      }
    >
      <span
        className={`inline-flex items-center rounded-full bg-amber-100 text-amber-800 font-bold ${
          compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
        }`}
      >
        Demo — {demoBadgeLabel(role)}
      </span>
      <Link
        href="/demo"
        className={`font-semibold text-amber-700 hover:text-amber-900 hover:underline ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        Switch role
      </Link>
    </div>
  );
}
