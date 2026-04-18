import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "UNIFEYE Command Center",
  description: "Autonomous campus task dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="bg-slate-950">
      <body
        className={`${sans.variable} ${mono.variable} bg-slate-950 font-[family-name:var(--font-sans)] text-slate-50 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
