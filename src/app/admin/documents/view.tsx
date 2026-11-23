"use client";

// Business documents = plain files with no expiry (forms, SOPs, brand assets,
// menus). The shared <DocumentVault> filters expiry_date IS NULL; anything that
// expires lives in Compliance & Renewals instead. Managers and owners manage;
// corporate sees it read-only (staff/designer never reach this route — see
// route-guards.ts).
import { useAuth } from "@/contexts/AuthContext";
import { isRole, type Role } from "@/lib/roles";
import DocumentVault from "@/components/DocumentVault";

// Roles that can upload/delete documents. Corporate is view-only by design;
// staff and designer are blocked from this route entirely.
const MANAGE_ROLES: Role[] = ["manager", "owner", "multi_location_owner"];

export default function DocumentsPage() {
  const { role } = useAuth();
  const readOnly = !isRole(role) || !MANAGE_ROLES.includes(role);

  return (
    <DocumentVault
      title="Business Documents"
      subtitle="Forms, SOPs, brand assets & menus — files that don't expire"
      readOnly={readOnly}
    />
  );
}
