import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const uiFont = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  variable: "--font-pholo-sans",
  weight: "400 700",
  display: "swap",
});

const displayFont = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-italic-latin.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-pholo-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pholo.ca"),
  title: {
    default: "Pholo — Every business runs on paper. We make it run itself.",
    template: "%s · Pholo",
  },
  description:
    "Pholo turns the printouts, spreadsheets and clipboards a business already runs on into one live operations platform — checks, counts, scheduling, documents, inspections and compliance across every location.",
  applicationName: "Pholo",
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://pholo.ca",
    siteName: "Pholo",
    title: "Pholo — Every business runs on paper. We make it run itself.",
    description:
      "One live operations platform for every industry: checks, counts, scheduling, documents, inspections and compliance across every location.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pholo",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f0e9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${uiFont.variable} ${displayFont.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ServiceWorkerRegistrar />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
