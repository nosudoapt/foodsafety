"use client";

import Link from "next/link";

export default function BetweenTheBunsHome() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
      {/* Header */}
      <div className="bg-red-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 font-bold text-2xl">BTB</span>
          </div>
          <h1 className="text-3xl font-bold">Between the Buns</h1>
          <p className="text-red-100 mt-2">Staff Resource Hub</p>
        </div>
      </div>

      {/* Menu */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/between-the-buns/prep-manual"
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-red-300 transition-all group"
          >
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-2xl mb-4">
              📖
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
              Prep Manual
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Searchable recipes and preparation guides — 21 recipes
            </p>
          </Link>

          <Link
            href="/between-the-buns/prep-list"
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-red-300 transition-all group"
          >
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-2xl mb-4">
              📋
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
              Daily Prep List
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Track par, on hand, make quantities — keep 7 days of records
            </p>
          </Link>

          <Link
            href="/checks"
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-red-300 transition-all group"
          >
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-2xl mb-4">
              ✅
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
              Daily Checks
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Opening and closing duty checklists
            </p>
          </Link>

          <Link
            href="/temperatures"
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-red-300 transition-all group"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl mb-4">
              🌡️
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
              Temperature Log
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Record cooking, cooling, and storage temperatures
            </p>
          </Link>

          <Link
            href="/between-the-buns/cleaning-schedule"
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-red-300 transition-all group"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-2xl mb-4">
              🧹
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
              Cleaning Schedule
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Weekly cleaning tasks — each item done once per week
            </p>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            © Between the Buns — Food Safety Management System
          </p>
        </div>
      </div>
    </div>
  );
}
