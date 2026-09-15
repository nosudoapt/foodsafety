"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="w-20 h-20 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">FoodSafe</h1>
          <p className="text-gray-600">Digital HACCP Food Safety Management</p>
        </div>

        <div className="space-y-4">
          <Link
            href="/auth/sign-in"
            className="block w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="block w-full bg-white text-green-600 py-3 px-6 rounded-lg font-semibold border-2 border-green-600 hover:bg-green-50 transition-colors"
          >
            Create Account
          </Link>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Built for UK & Canadian food businesses
        </p>
      </div>
    </div>
  );
}
