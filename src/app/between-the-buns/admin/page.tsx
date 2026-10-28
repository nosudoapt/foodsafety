"use client";

import { useState } from "react";
import BtbWordmark from "@/components/BtbWordmark";

const BTB_ACCOUNTS = [
  { role: "corporate", email: "corporate@foodsafe.demo", name: "Morgan Blake" },
  { role: "manager", email: "manager@foodsafe.demo", name: "Jordan Patel" },
  { role: "supervisor", email: "supervisor@foodsafe.demo", name: "Riley Nguyen" },
  { role: "staff", email: "staff@foodsafe.demo", name: "Sam Rivera" },
  { role: "admin", email: "admin@foodsafe.demo", name: "Admin User" },
];

const PAGES = [
  "hub", "prep-list", "order-sheet", "cleaning", "vault",
  "training", "allergens", "recipes", "checklists",
];

export default function AdminDashboard() {
  const [access, setAccess] = useState<Record<string, string[]>>(
    () => Object.fromEntries(BTB_ACCOUNTS.map((a) => [a.email, []]))
  );

  const toggle = (email: string, page: string) => {
    setAccess((prev) => {
      const cur = prev[email] ?? [];
      const next = cur.includes(page) ? cur.filter((p) => p !== page) : [...cur, page];
      return { ...prev, [email]: next };
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="text-center mb-6 sm:mb-8">
        <BtbWordmark className="text-2xl sm:text-3xl" />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">Manage page access for each user</p>
      </div>
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Role</th>
                {PAGES.map((p) => (
                  <th key={p} className="px-2 py-3 text-center font-semibold text-slate-700 capitalize whitespace-nowrap">
                    {p.replace("-", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BTB_ACCOUNTS.map((a, i) => (
                <tr key={a.email} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{a.name}</td>
                  <td className="px-4 py-3 capitalize text-slate-600 whitespace-nowrap">{a.role}</td>
                  {PAGES.map((p) => (
                    <td key={p} className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[#b65a2e] cursor-pointer"
                        checked={(access[a.email] ?? []).includes(p)}
                        onChange={() => toggle(a.email, p)}
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
