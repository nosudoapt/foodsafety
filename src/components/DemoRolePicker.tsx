"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/demo-roles";
import { accentOf, type Accent } from "@/components/ui";

// One-click "enter as this role" controls shared by /demo and the sign-in
// panel. Sends only the role — /api/demo/session resolves the password
// server-side and returns session cookies for the regular Supabase auth flow.
export function useDemoSignIn() {
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [error, setError] = useState("");

  const enterAs = async (role: string) => {
    setPendingRole(role);
    setError("");
    try {
      const res = await fetch("/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || "Could not start the demo. Try again.");
        setPendingRole(null);
        return;
      }
      // push alone can serve a cached (pre-auth) copy of /dashboard, so refresh
      // after the new cookies land.
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not start the demo. Check your connection.");
      setPendingRole(null);
    }
  };

  return { enterAs, pendingRole, error };
}

// Big cards for /demo — each one sells the perspective of that role.
export function DemoRoleCards() {
  const { enterAs, pendingRole, error } = useDemoSignIn();

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 stagger">
        {DEMO_ACCOUNTS.map((account) => (
          <DemoRoleCard
            key={account.role}
            account={account}
            busy={pendingRole === account.role}
            disabled={pendingRole !== null}
            onClick={() => enterAs(account.role)}
          />
        ))}
      </div>
    </div>
  );
}

function DemoRoleCard({
  account, busy, disabled, onClick,
}: {
  account: DemoAccount;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const a = accentOf(account.accent as Accent);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="lift group w-full text-left bg-white rounded-2xl border border-slate-200 p-6 hover:border-green-300 transition-colors disabled:opacity-60 disabled:pointer-events-none"
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full ${a.soft} ${a.text}`}>
          {account.label}
        </span>
        <span className="text-xs font-semibold text-green-700 group-hover:translate-x-0.5 transition-transform">
          {busy ? "Signing in…" : "Enter →"}
        </span>
      </div>
      <h3 className="mt-4 font-bold text-slate-900">{account.headline}</h3>
      <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{account.desc}</p>
      <p className="mt-3 text-[11px] text-slate-400">
        {account.fullName} · {account.restaurantName}
      </p>
    </button>
  );
}

// Compact one-row buttons for the sign-in panel.
export function DemoRoleButtons({ accounts = DEMO_ACCOUNTS }: { accounts?: readonly DemoAccount[] }) {
  const { enterAs, pendingRole, error } = useDemoSignIn();

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {accounts.map((account) => (
          <button
            key={account.role}
            type="button"
            onClick={() => enterAs(account.role)}
            disabled={pendingRole !== null}
            className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2 text-sm font-semibold text-green-800 hover:bg-green-100 transition-colors disabled:opacity-60"
          >
            {pendingRole === account.role ? "Signing in…" : `Enter as ${account.label}`}
          </button>
        ))}
      </div>
    </div>
  );
}
