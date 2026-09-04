import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DEAL — Agree. Pay. Create. Deliver.",
  description:
    "DEAL helps African creatives manage paid projects that start on Instagram, WhatsApp or referrals. Clear agreements, milestone payments and protected file delivery — so you get paid for work you already win.",
  keywords: [
    "DEAL",
    "African creatives",
    "freelance payments",
    "milestone payments",
    "client agreements",
    "Instagram clients",
    "WhatsApp invoices",
    "creative contracts",
  ],
  authors: [{ name: "DEAL" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "DEAL — Agree. Pay. Create. Deliver.",
    description:
      "Turn client conversations into clear agreements, secure payments and successful projects — without the stress of chasing or confusion.",
    siteName: "DEAL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DEAL — Agree. Pay. Create. Deliver.",
    description:
      "Clear agreements, milestone payments and protected delivery for African creatives.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0FA958",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${geistMono.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
