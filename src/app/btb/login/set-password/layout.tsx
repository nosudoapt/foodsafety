import type { Metadata } from "next";
import "@/app/btb-console.css";

export const metadata: Metadata = { title: "Set your BTB password", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function PasswordSetupLayout({ children }: { children: React.ReactNode }) { return children; }
