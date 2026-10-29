"use client";

import { useEffect, useState } from "react";
import BtbWordmark from "@/components/BtbWordmark";

const ROLES = ["staff", "supervisor", "manager", "corporate"];
const PAGES = [
  "admin", "prep-list", "checklists", "branding-requests", "month-end-inventory",
  "training-guide", "tax-dates", "staff-schedule", "cash-out", "order-sheet",
  "cleaning-schedule", "prep-manual", "menu", "allergen-chart", "gluten-free",
  "fryer-timing", "emergency", "protocols", "handbook", "manuals", "compliance",
  "documents", "staff-licenses", "inspections", "franchise-inspection", "marketing",
  "new-restaurant", "vault",
];

export default function AdminDashboard() {
  const [access, setAccess] = useState<Record<string, string[]>>(() => Object.fromEntries(ROLES.map((r) => [r, []])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/btb/role-page-access").then((r) => r.json()).then((d) => {
      const map: Record<string, string[]> = Object.fromEntries(ROLES.map((r) => [r, []]));
      for (const row of d.rows ?? []) {
        if (row.allowed && map[row.role]) map[row.role].push(row.page);
      }
      setAccess(map);
    }).catch(() => {});
  }, []);

  const toggle = async (role: string, page: string) => {
    const cur = access[role] ?? [];
    const nextAllowed = !cur.includes(page);
    setAccess((prev) => {
      const c = prev[role] ?? [];
      const n = nextAllowed ? [...c, page] : c.filter((p) => p !== page);
      return { ...prev, [role]: n };
    });
    await fetch("/api/btb/role-page-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, page, allowed: nextAllowed }),
    });
  };

  const saveAll = async () => {
    setSaving(true);
    setSaved(false);
    for (const role of ROLES) {
      for (const page of PAGES) {
        const allowed = (access[role] ?? []).includes(page);
        await fetch("/api/btb/role-page-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, page, allowed }),
        });
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="text-center mb-6 sm:mb-8">
        <BtbWordmark className="text-2xl sm:text-3xl" />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">Assign which pages each role can access</p>
      </div>
      <div className="flex justify-center mb-4">
        <button onClick={saveAll} disabled={saving} className="px-4 py-2 rounded-lg bg-[#b65a2e] text-white font-semibold disabled:opacity-50">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Page</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-3 text-center font-semibold text-slate-700 capitalize">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGES.map((p, i) => (
                <tr key={p} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="px-4 py-3 font-medium text-slate-900 capitalize">{p.replace("-", " ")}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[#b65a2e] cursor-pointer"
                        checked={(access[r] ?? []).includes(p)}
                        onChange={() => toggle(r, p)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">© Between the Buns — Admin</p>
    </div>
  );
}
