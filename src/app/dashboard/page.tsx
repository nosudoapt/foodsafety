"use client";

import Link from "next/link";

const features = [
  {
    name: "Temperature Monitoring",
    description: "Record cooking, cooling, cold storage and hot holding temperatures",
    href: "/temperatures",
    icon: "🌡️",
    color: "bg-red-50 text-red-600",
  },
  {
    name: "Daily Kitchen Checks",
    description: "Complete opening and closing checklists every shift",
    href: "/checks",
    icon: "✅",
    color: "bg-green-50 text-green-600",
  },
  {
    name: "Cleaning & Hygiene",
    description: "Manage cleaning schedules and track completion",
    href: "/cleaning",
    icon: "🧹",
    color: "bg-blue-50 text-blue-600",
  },
  {
    name: "Allergen Management",
    description: "Track 14 allergens across your menu items",
    href: "/allergens",
    icon: "⚠️",
    color: "bg-yellow-50 text-yellow-600",
  },
  {
    name: "Delivery Checks",
    description: "Record incoming deliveries and supplier temperatures",
    href: "/deliveries",
    icon: "📦",
    color: "bg-purple-50 text-purple-600",
  },
  {
    name: "Corrective Actions",
    description: "Log issues, fixes and follow-up actions",
    href: "/corrective-actions",
    icon: "🔧",
    color: "bg-orange-50 text-orange-600",
  },
  {
    name: "Pest Control",
    description: "Maintain pest control register and inspection records",
    href: "/pest-control",
    icon: "🐀",
    color: "bg-gray-50 text-gray-600",
  },
  {
    name: "Training Records",
    description: "Track staff training and certifications",
    href: "/training",
    icon: "📚",
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    name: "Reports & PDF Export",
    description: "Export clean digital records instantly",
    href: "/reports",
    icon: "📊",
    color: "bg-teal-50 text-teal-600",
  },
];

export default function Dashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to your food safety management system</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-2xl font-bold text-green-600">0</div>
          <div className="text-sm text-gray-600">Today&apos;s Checks</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-2xl font-bold text-red-600">0</div>
          <div className="text-sm text-gray-600">Temperature Alerts</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">0</div>
          <div className="text-sm text-gray-600">Cleaning Tasks</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-2xl font-bold text-orange-600">0</div>
          <div className="text-sm text-gray-600">Open Actions</div>
        </div>
      </div>

      {/* Feature Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <Link
            key={feature.name}
            href={feature.href}
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-green-300 transition-all group"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 ${feature.color}`}>
              {feature.icon}
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
              {feature.name}
            </h3>
            <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
