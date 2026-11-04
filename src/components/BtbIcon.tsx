import { BookOpen, Calculator, ClipboardList, LayoutGrid, Sparkles, AlertTriangle, Salad, UtensilsCrossed, Phone, FileText, BookCheck, Printer, ShieldCheck, File, IdCard, ClipboardCheck, Megaphone, ListChecks, KeyRound, Flame, Thermometer, type LucideIcon } from "lucide-react";
import type { BtbIconKey } from "@/lib/btb-hub";

export const BTB_ICONS: Record<BtbIconKey, LucideIcon> = {
  calculator: Calculator, layoutGrid: LayoutGrid, clipboard: ClipboardList, sparkles: Sparkles, book: BookOpen,
  utensils: UtensilsCrossed, alert: AlertTriangle, salad: Salad, phone: Phone, fileText: FileText,
  bookCheck: BookCheck, printer: Printer, shield: ShieldCheck, file: File, idCard: IdCard,
  clipboardCheck: ClipboardCheck, megaphone: Megaphone, listChecks: ListChecks, key: KeyRound, flame: Flame,
  thermometer: Thermometer,
};

export default function BtbIcon({ name, size = 20 }: { name: BtbIconKey; size?: number }) {
  const Icon = BTB_ICONS[name];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
