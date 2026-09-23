"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import AdminShell from "./shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = "FoodSafe · Admin";
  }, []);

  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
