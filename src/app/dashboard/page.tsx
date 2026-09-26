"use client";

import { Thermometer, ClipboardCheck, Sparkles, AlertTriangle, Package, Wrench, Bug, GraduationCap, FileBarChart } from "lucide-react";
import { PageHeader, StatTile, NavCard } from "@/components/ui";

const features = [
  { name: "Temperature Monitoring", description: "Record cooking, cooling, cold storage and hot holding temperatures.", href: "/temperatures", icon: Thermometer, accent: "red" as const },
  { name: "Daily Kitchen Checks", description: "Complete opening and closing checklists every shift.", href: "/checks", icon: ClipboardCheck, accent: "green" as const },
  { name: "Cleaning & Hygiene", description: "Manage cleaning schedules and track completion.", href: "/cleaning", icon: Sparkles, accent: "blue" as const },
  { name: "Allergen Management", description: "Track 14 allergens across your menu items.", href: "/allergens", icon: AlertTriangle, accent: "amber" as const },
  { name: "Delivery Checks", description: "Record incoming deliveries and supplier temperatures.", href: "/deliveries", icon: Package, accent: "purple" as const },
  { name: "Corrective Actions", description: "Log issues, fixes and follow-up actions.", href: "/corrective-actions", icon: Wrench, accent: "amber" as const },
  { name: "Pest Control", description: "Maintain pest control register and inspection records.", href: "/pest-control", icon: Bug, accent: "slate" as const },
  { name: "Training Records", description: "Track staff training and certifications.", href: "/training", icon: GraduationCap, accent: "teal" as const },
  { name: "Reports & PDF Export", description: "Export clean digital records instantly.", href: "/reports", icon: FileBarChart, accent: "teal" as const },
];

export default function Dashboard() {
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Welcome to your food safety management system" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatTile label="Today's Checks" value="0" icon={ClipboardCheck} accent="green" />
        <StatTile label="Temperature Alerts" value="0" icon={Thermometer} accent="red" />
        <StatTile label="Cleaning Tasks" value="0" icon={Sparkles} accent="blue" />
        <StatTile label="Open Actions" value="0" icon={Wrench} accent="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <NavCard key={f.name} href={f.href} title={f.name} desc={f.description} icon={f.icon} accent={f.accent} />
        ))}
      </div>
    </div>
  );
}
