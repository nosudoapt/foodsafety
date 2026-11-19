import type { Metadata } from "next";
import "@/app/btb-console.css";

export const metadata: Metadata = { title: "BTB Console", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
