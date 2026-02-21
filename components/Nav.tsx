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
  ];

  return (
    <nav className="bg-black/80 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-lg font-semibold text-white tracking-wide hover:text-white/80">
          CFC Owners Meeting
        </Link>
        {teamName && <span className="text-xs text-white/60">{teamName}{isCommissioner ? " • Commissioner" : ""}</span>}
      </div>

      <div className="flex items-center gap-5 text-sm">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`pb-0.5 transition-colors ${link.active ? "text-white border-b border-white/70" : "text-white/60 border-b border-transparent hover:text-white"}`}
          >
            {link.label}
          </Link>
        ))}
        {teamName && onLogout && (
          <button
            onClick={onLogout}
            className="text-xs text-white/50 hover:text-white transition-colors"
          >
            Switch Team
          </button>
        )}
      </div>
    </nav>
  );
}
