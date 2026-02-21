import type { Metadata } from "next";
import "./globals.css";
import SessionAutoRelease from "@/components/SessionAutoRelease";

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
      <body className="antialiased bg-black text-white font-sans">
        <SessionAutoRelease />
        {children}
      </body>
    </html>
  );
}
