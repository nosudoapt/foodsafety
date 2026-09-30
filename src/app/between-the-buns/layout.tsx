"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, LogOut } from "lucide-react";

interface BtbMe {
  name?: string;
  role?: string;
}

// Persistent header for the Between the Buns surface. Fully self-contained —
// no links back to the green FoodSafe demo. The /login page renders bare.
export default function BetweenTheBunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isHub = pathname === "/between-the-buns";
  const isLogin = pathname === "/between-the-buns/login";
  const [me, setMe] = useState<BtbMe>({});

  // Identity chip: which of the four BTB accounts is on this tablet.
  useEffect(() => {
    if (isLogin) return;
    fetch("/api/btb/me")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: BtbMe) => setMe(data))
      .catch(() => setMe({}));
  }, [isLogin, pathname]);

  if (isLogin) return <>{children}</>;

  const signOut = async () => {
    await fetch("/api/btb/logout", { method: "POST" });
    router.push("/between-the-buns/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
      <header className="sticky top-0 z-30 bg-red-600 text-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {isHub ? (
            <span className="w-24" aria-hidden />
          ) : (
            <Link href="/between-the-buns" className="flex items-center gap-1.5 text-sm font-medium text-red-50 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" /> Staff hub
            </Link>
          )}
          <span className="font-bold tracking-tight">Between the Buns</span>
          <div className="flex items-center gap-3">
            {me.name && (
              <span className="hidden sm:inline text-xs text-red-100">
                {me.name}
                {me.role && (
                  <span className="ml-1.5 font-semibold uppercase text-[10px] tracking-wide bg-white/15 rounded-full px-2 py-0.5">
                    {me.role.replace("_", " ")}
                  </span>
                )}
              </span>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm font-medium text-red-50 hover:text-white transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="animate-fade-in">{children}</div>
    </div>
  );
}
