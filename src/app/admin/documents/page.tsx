"use client";

// Business documents = the full compliance vault: licenses, insurance, hood &
// fire certificates, pest reports, franchise & lease agreements — every doc with
// an expiry the client asked us to track. All rendering, expiry status and
// alerts come from the shared <DocumentVault>. Managers and owners manage;
// corporate sees it read-only (staff/designer never reach this route — see
// route-guards.ts).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/profile";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/roles";
import DocumentVault from "@/components/DocumentVault";

// Roles that can upload/delete documents. Corporate is view-only by design;
// staff and designer are blocked from this route entirely.
const MANAGE_ROLES: Role[] = ["manager", "owner", "multi_location_owner"];

export default function DocumentsPage() {
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getSessionUser();
      if (!user) { if (!cancelled) setRole(DEFAULT_ROLE); return; }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (!cancelled) setRole(isRole(data?.role) ? data.role : DEFAULT_ROLE);
    })();
    return () => { cancelled = true; };
  }, []);

  if (role === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600" />
      </div>
    );
  }

  const readOnly = !MANAGE_ROLES.includes(role);

  return (
    <DocumentVault
      title="Business Documents"
      subtitle="Licenses, insurance, inspections and agreements — with live expiry alerts"
      readOnly={readOnly}
    />
  );
}
