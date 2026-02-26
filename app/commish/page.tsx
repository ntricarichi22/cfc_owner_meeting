import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import Link from "next/link";
import { PopCard } from "@/components/ui/primitives";

export default async function CommishToolsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  if (session.team_name !== COMMISSIONER_TEAM_NAME) {
    redirect("/meeting");
  }

  const links = [
    { href: "/admin/meeting-builder", label: "Meeting Builder" },
    { href: "/constitution/import", label: "Import Constitution" },
    { href: "/meeting/minutes", label: "Meeting Minutes" },
  ];

  return (
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
      <main className="max-w-2xl mx-auto p-8 space-y-6">
        <p className="text-sm text-[rgba(11,11,15,0.65)]">Signed in as: {session.team_name}</p>
        <h1 className="text-2xl font-bold tracking-tight">Commish Tools</h1>
        <ul className="space-y-3">
          {links.map((link) => (
            <li key={link.href}>
              <PopCard className="p-0 hover:-translate-y-[1px] transition-transform">
                <Link
                  href={link.href}
                  className="block px-4 py-3 text-[var(--accent-blue)] font-semibold"
                >
                  {link.label}
                </Link>
              </PopCard>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
