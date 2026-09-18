"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const roleStats = [
  { label: "Total Staff", value: "12", icon: "👥", color: "bg-blue-500" },
  { label: "Documents", value: "8", icon: "📄", color: "bg-green-500" },
  { label: "Inspections", value: "3", icon: "🔍", color: "bg-orange-500" },
  { label: "Active Promos", value: "2", icon: "📣", color: "bg-purple-500" },
];

const recentActivity = [
  { action: "Food inspection report uploaded", user: "Manager", time: "2 hours ago", icon: "📄" },
  { action: "Weekly cleaning completed", user: "Staff - Kitchen", time: "5 hours ago", icon: "✅" },
  { action: "Temperature log submitted", user: "Staff - Front", time: "6 hours ago", icon: "🌡️" },
  { action: "Staff license renewed", user: "Sarah M.", time: "1 day ago", icon: "🪪" },
  { action: "Corporate inspection passed", user: "Inspector", time: "3 days ago", icon: "🏢" },
];

const quickActions = [
  { label: "Upload Document", href: "/admin/documents", icon: "📄", color: "bg-blue-500" },
  { label: "Add Staff License", href: "/admin/staff-licenses", icon: "🪪", color: "bg-green-500" },
  { label: "New Inspection", href: "/admin/inspections", icon: "🔍", color: "bg-orange-500" },
  { label: "Create Promotion", href: "/admin/marketing", icon: "📣", color: "bg-purple-500" },
  { label: "Print Manual", href: "/admin/manuals", icon: "📑", color: "bg-pink-500" },
  { label: "Back to App", href: "/dashboard", icon: "🏠", color: "bg-gray-500" },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {roleStats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center text-white text-lg`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:shadow-md transition-all group"
            >
              <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center text-white text-xl mx-auto mb-2 group-hover:scale-110 transition-transform`}>
                {action.icon}
              </div>
              <p className="text-sm font-medium text-gray-900 group-hover:text-red-600 transition-colors">
                {action.label}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">Recent Activity</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.map((activity, idx) => (
              <div key={idx} className="px-4 py-3 flex items-center gap-3">
                <span className="text-lg">{activity.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{activity.action}</p>
                  <p className="text-[10px] text-gray-500">
                    {activity.user} · {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Role Access Guide */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-3">Role Access Levels</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full whitespace-nowrap">
                Corporate
              </span>
              <p className="text-xs text-gray-600">
                Full access. Manage all stores, documents, inspections, staff, and settings.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full whitespace-nowrap">
                Manager
              </span>
              <p className="text-xs text-gray-600">
                Store-level access. Manage documents, inspections, staff, and promotions.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full whitespace-nowrap">
                Supervisor
              </span>
              <p className="text-xs text-gray-600">
                Can submit in-house inspections and view staff licenses.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full whitespace-nowrap">
                Staff
              </span>
              <p className="text-xs text-gray-600">
                Upload own health licenses. View cleaning schedules and daily checks.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="px-2 py-0.5 bg-pink-100 text-pink-700 text-[10px] font-bold rounded-full whitespace-nowrap">
                Designer
              </span>
              <p className="text-xs text-gray-600">
                Upload marketing materials, posters, and promotional designs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
