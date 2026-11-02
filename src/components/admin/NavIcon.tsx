"use client";

// Maps the serialisable NavIcon name from lib/admin-nav.ts onto a Lucide
// component. Kept separate so the nav model stays a plain .ts file that the
// node test runner can import.
import {
  LayoutDashboard,
  Sandwich,
  Wallet,
  CalendarDays,
  GraduationCap,
  Package,
  Palette,
  ShieldCheck,
  FileText,
  IdCard,
  Siren,
  Wrench,
  BookOpen,
  KeyRound,
  Megaphone,
  Search,
  Building,
  ScrollText,
  Printer,
  Store,
  Circle,
  Thermometer,
  ClipboardCheck,
  Sparkles,
  TriangleAlert,
  Truck,
  Bug,
  ChartNoAxesCombined,
  Settings,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/admin-nav";

const MAP: Record<NavIconName, typeof Circle> = {
  dashboard: LayoutDashboard,
  burger: Sandwich,
  cash: Wallet,
  calendar: CalendarDays,
  training: GraduationCap,
  inventory: Package,
  branding: Palette,
  shield: ShieldCheck,
  documents: FileText,
  licenses: IdCard,
  emergency: Siren,
  protocols: Wrench,
  handbook: BookOpen,
  vault: KeyRound,
  marketing: Megaphone,
  inspection: Search,
  corporate: Building,
  manuals: ScrollText,
  print: Printer,
  newrestaurant: Store,
  temperature: Thermometer,
  checks: ClipboardCheck,
  cleaning: Sparkles,
  allergens: TriangleAlert,
  delivery: Truck,
  pest: Bug,
  reports: ChartNoAxesCombined,
  settings: Settings,
};

export function NavIcon({ name, size = 16 }: { name: NavIconName; size?: number }) {
  const Icon = MAP[name] ?? Circle;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
