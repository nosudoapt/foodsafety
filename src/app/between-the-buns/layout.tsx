"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronLeft } from "lucide-react";

// Persistent header so every BTB page has a return path (fixes the
// dead-end/orphan navigation). Staff pages stay public — no auth here.
export default function BetweenTheBunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHub = pathname === "/between-the-buns";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
      <header className="sticky top-0 z-30 bg-red-600 text-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          {isHub ? (
            <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-red-50 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" /> All workspaces
            </Link>
          ) : (
            <Link href="/between-the-buns" className="flex items-center gap-1.5 text-sm font-medium text-red-50 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" /> Staff hub
            </Link>
          )}
          <span className="font-bold tracking-tight">Between the Buns</span>
          <Link href="/" className="p-1.5 rounded-lg hover:bg-red-500/60 transition-colors" aria-label="Home">
            <Home className="w-5 h-5" />
          </Link>
        </div>
      </header>
      <div className="animate-fade-in">{children}</div>
    </div>
  );
}
