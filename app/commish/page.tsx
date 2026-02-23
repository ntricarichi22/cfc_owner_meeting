import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Link from "next/link";

export default async function CommishToolsPage() {
  const session = await getSession();
  if (!session || session.role !== "commissioner") {
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
