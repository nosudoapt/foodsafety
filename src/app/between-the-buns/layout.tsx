"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, LogOut } from "lucide-react";
import BtbWordmark from "@/components/BtbWordmark";

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
    <div className="min-h-screen bg-[#fdf8e8]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#e6dcc0] shadow-sm print:hidden">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {isHub ? (
            <span className="w-24" aria-hidden />
          ) : (
            <Link href="/between-the-buns" className="flex items-center gap-1.5 text-sm font-semibold text-[#b65a2e] hover:text-[#9c4a24] transition-colors">
              <ChevronLeft className="w-4 h-4" /> Staff hub
            </Link>
          )}
          <Link href="/between-the-buns" aria-label="Between the Buns home">
            <BtbWordmark className="text-xl sm:text-2xl" />
          </Link>
          <div className="flex items-center gap-3">
            {me.name && (
              <span className="hidden sm:inline text-xs text-gray-600">
                {me.name}
                {me.role && (
                  <span className="ml-1.5 font-bold uppercase text-[10px] tracking-wide bg-[#E07B2E] text-white rounded-full px-2 py-0.5">
                    {me.role.replace("_", " ")}
                  </span>
                )}
              </span>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#b65a2e] hover:text-[#9c4a24] transition-colors"
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
