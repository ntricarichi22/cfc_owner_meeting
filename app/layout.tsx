import type { Metadata } from "next";
import "./globals.css";
import SessionHeartbeat from "@/components/SessionHeartbeat";

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
    <html lang="en">
      <body className="antialiased bg-[var(--paper-bg)] text-[var(--ink)] font-sans">
        <SessionHeartbeat />
        {children}
      </body>
    </html>
  );
}
