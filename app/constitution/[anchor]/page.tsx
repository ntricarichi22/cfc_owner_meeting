"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import { getConstitutionSectionByAnchor } from "@/lib/actions";
import type { ConstitutionArticle, ConstitutionSection } from "@/lib/types";

type SectionWithArticle = ConstitutionSection & { article: ConstitutionArticle };

export default function ConstitutionSectionPage({ params }: { params: Promise<{ anchor: string }> }) {
  const { anchor } = use(params);
  const { session, loading, logout } = useSession();
  const [section, setSection] = useState<SectionWithArticle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    getConstitutionSectionByAnchor(anchor)
      .then((data) => setSection(data as SectionWithArticle))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load section"));
  }, [session, anchor]);

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-8">Not logged in.</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={session.role === "commissioner"} onLogout={logout} />

      <div className="max-w-4xl mx-auto p-6">
        <Link href="/constitution" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">
          ← Back to Constitution
        </Link>

        {error && <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded mb-4">{error}</div>}

        {section ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-1">
              Article {section.article.article_num} — {section.article.article_title}
            </p>
            <h1 className="text-xl font-bold mb-4">
              §{section.section_num} {section.section_title}
            </h1>
            <div className="text-gray-300 whitespace-pre-wrap">{section.body}</div>
          </div>
        ) : (
          !error && <p className="text-gray-500">Loading…</p>
        )}
      </div>
    </div>
  );
}
