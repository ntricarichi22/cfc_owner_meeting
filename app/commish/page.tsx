import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import Link from "next/link";

export default async function CommishToolsPage() {
  const session = await getSession();
  if (!session?.session_id) {
    redirect("/");
  }

  const sb = getSupabaseServer();
  const { data: row } = await sb
    .from("team_sessions")
    .select("id, team_name")
    .eq("id", session.session_id)
    .maybeSingle();

  if (!row) {
    redirect("/");
  }

  if (row.team_name !== COMMISSIONER_TEAM_NAME) {
    redirect("/meeting");
  }

  const links = [
    { href: "/admin/meeting-builder", label: "Meeting Builder" },
    { href: "/constitution/import", label: "Import Constitution" },
    { href: "/meeting/minutes", label: "Meeting Minutes" },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="max-w-2xl mx-auto p-8 space-y-6">
        <p className="text-sm text-gray-400">Signed in as: {row.team_name}</p>
        <h1 className="text-2xl font-bold">Commish Tools</h1>
        <ul className="space-y-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block px-4 py-3 rounded bg-gray-900 border border-gray-800 hover:border-blue-500 transition-colors text-blue-400 hover:text-blue-300"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
