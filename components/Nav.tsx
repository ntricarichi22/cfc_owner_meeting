"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavProps {
  teamName?: string;
  isCommissioner?: boolean;
  onLogout?: () => void;
}

export default function Nav({ teamName, isCommissioner, onLogout }: NavProps) {
  const pathname = usePathname();
  const links = [
    { href: "/meeting", label: "Current Meeting", active: pathname.startsWith("/meeting") },
    { href: "/past-meetings", label: "Meeting History", active: pathname.startsWith("/past-meetings") },
    { href: "/constitution", label: "Constitution", active: pathname.startsWith("/constitution") },
    ...(isCommissioner ? [{ href: "/commish", label: "Commish Tools", active: pathname.startsWith("/commish") || pathname.startsWith("/admin") }] : []),
  ];

  return (
    <nav className="bg-[#0B0B0F] text-white px-8 h-16 min-h-16 flex items-center justify-between shadow-[6px_6px_0_#000] border-b-[var(--border-width)] border-[var(--border)]">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-lg font-bold tracking-tight hover:text-white/80">
          CFC Owners Meeting
        </Link>
        {teamName && (
          <span className="text-xs text-white/70">
            {teamName}{isCommissioner ? " • Commissioner" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center gap-6 text-sm">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`pb-1 transition-colors ${link.active ? "text-white border-b-2 border-white" : "text-white/70 border-b-2 border-transparent hover:text-white"}`}
          >
            {link.label}
          </Link>
        ))}
        {teamName && onLogout && (
          <button
            onClick={onLogout}
            className="text-xs text-white/70 hover:text-white transition-colors underline-offset-4 hover:underline"
          >
            Switch Team
          </button>
        )}
      </div>
    </nav>
  );
}
