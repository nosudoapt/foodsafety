"use client";

import { useState } from "react";
import { BtbWordmark } from "@/components/BtbWordmark";
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <BtbWordmark className="text-2xl" />
        <h1 className="text-3xl font-bold text-slate-900 mt-2">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">Manage page access for each user</p>
      </div>
      <div className="overflow-x-auto bg-white rounded-xl shadow border border-slate-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-3 text-left font-semibold">Name</th>
              <th className="px-4 py-3 text-left font-semibold">Role</th>
              {PAGES.map((p) => (
                <th key={p} className="px-2 py-3 text-center font-semibold capitalize">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BTB_ACCOUNTS.map((a) => (
              <tr key={a.email} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3 capitalize">{a.role}</td>
                {PAGES.map((p) => (
                  <td key={p} className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
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
  );
}
