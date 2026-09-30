"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

interface PublicInfo {
  accounts?: { role: string; email: string; name: string }[];
  passwordHint?: string | null;
}

// Standalone Between the Buns sign-in. Deliberately self-contained — no link
// back to the green FoodSafe demo. Checked against BTB's own credential list,
// one shared store password, cookie session.
export default function BtbLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<PublicInfo>({});
  const router = useRouter();

  // Account chips + (default-only) password hint, served by /api/btb/me.
  useEffect(() => {
    fetch("/api/btb/me")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: PublicInfo) => setInfo(data))
      .catch(() => setInfo({}));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/btb/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    const dest = next && next.startsWith("/between-the-buns") ? next : "/between-the-buns";
    router.push(dest);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <span className="text-white font-bold text-xl">BTB</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Between the Buns</h1>
          <p className="text-slate-600 mt-1">Staff sign-in</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-slate-900 bg-white"
              placeholder="manager@foodsafe.demo"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-slate-900 bg-white"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {loading ? "Signing in..." : "Sign In"}
          </button>

          {info.accounts && info.accounts.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-2">
                Pick an account {info.passwordHint ? `— password ${info.passwordHint}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {info.accounts.map((a) => (
                  <button
                    key={a.role}
                    type="button"
                    onClick={() => setEmail(a.email)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                  >
                    {a.name} · {a.role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
