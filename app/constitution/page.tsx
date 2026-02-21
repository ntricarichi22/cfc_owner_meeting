"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import type { ConstitutionSection } from "@/lib/types";

export default function ConstitutionPage() {
  const { session, loading, logout, isCommissioner } = useSession();
  const [sections, setSections] = useState<ConstitutionSection[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    fetch("/api/constitution-sections")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load constitution sections");
        return (await res.json()) as ConstitutionSection[];
      })
      .then((data) => setSections(Array.isArray(data) ? data : []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load constitution sections"));
  }, [session]);

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-8">Not logged in.</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Constitution Sections</h1>

        {error && <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded mb-4">{error}</div>}

        {sections.length === 0 && !error && (
          <p className="text-gray-500">No constitution sections found.</p>
        )}

        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-blue-300">{section.section_key}</p>
              <h2 className="text-lg font-semibold text-white mt-1">{section.title}</h2>
              <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{section.body || "No body text available."}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
