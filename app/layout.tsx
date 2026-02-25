import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";
import "./globals.css";
import SessionHeartbeat from "@/components/SessionHeartbeat";

const bebasNeue = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });

export const metadata: Metadata = {
  title: "CFC Owners Meeting",
  description: "Annual Owners Meeting app for CFC Dynasty League",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={bebasNeue.variable}>
      <body className="antialiased bg-[var(--paper-bg)] text-[var(--ink)] font-sans">
        <SessionHeartbeat />
        {children}
      </body>
    </html>
  );
}
