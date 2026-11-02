import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const uiFont = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  variable: "--font-foodsafe-sans",
  weight: "400 700",
  display: "swap",
});

const displayFont = localFont({
  src: [
    { path: "./fonts/dm-serif-display-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-serif-display-italic-latin.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-foodsafe-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FoodSafe - Restaurant Operations Platform",
  description: "The operations platform for cafés, restaurants, takeaways, pubs and catering businesses.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FoodSafe",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4a1b3d",
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
