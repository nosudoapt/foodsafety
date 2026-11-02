"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AdminShell from "@/components/admin/AdminShell";
import { isRole } from "@/lib/roles";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, profileLoading, role, displayName, restaurantName, reloadProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user || profileLoading) {
    return (
      <div className="workspace-loading" role="status">
        <span className="ui-loader" aria-hidden="true" />
        <p>Opening your workspace…</p>
      </div>
    );
  }

  if (!isRole(role)) return (
    <div className="workspace-loading">
      <h1>Let’s reconnect your workspace.</h1>
      <p>Your profile could not be loaded. Try reconnecting.</p>
      <button className="ui-button" onClick={reloadProfile}>Try again</button>
    </div>
  );

  return (
    <AdminShell profile={{ role, full_name: displayName, restaurant_name: restaurantName, email: user.email || "" }}>
      {children}
    </AdminShell>
  );
}
