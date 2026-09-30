"use client";

import Link from "next/link";
import { DemoRoleCards } from "@/components/DemoRolePicker";

// Public role picker: pick a perspective, land on that role's dashboard.
// Reached from the sign-in page, the "Demo — {role}" badge's Switch role link,
// and /app → "Enter demo".
export default function DemoPickerPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600">
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Try a demo role</h1>
          <p className="mt-2 text-slate-600">
            The same food safety system, seen through four different jobs.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            No signup, no typing — pick a perspective and you&apos;re in.
          </p>
        </div>

        <DemoRoleCards />

        <p className="mt-8 text-center text-sm text-slate-500">
          Have your own account?{" "}
          <Link href="/auth/sign-in" className="font-semibold text-green-700 hover:underline">
            Sign in instead
          </Link>
          <span className="mx-2 text-slate-300">·</span>
          <Link href="/" className="text-slate-500 hover:underline">
            Back to site
          </Link>
        </p>
      </div>
    </div>
  );
}
