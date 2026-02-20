"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import { getConstitutionArticles } from "@/lib/actions";
import type { ConstitutionArticle, ConstitutionSection } from "@/lib/types";

type ArticleWithSections = ConstitutionArticle & { constitution_sections: ConstitutionSection[] };

export default function ConstitutionPage() {
  const { session, loading, logout } = useSession();
  const [articles, setArticles] = useState<ArticleWithSections[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getConstitutionArticles(year)
      .then((data) => { if (!cancelled) setArticles(data as ArticleWithSections[]); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load articles"); });
    return () => { cancelled = true; };
  }, [session, year]);

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-8">Not logged in.</div>;

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={session.role === "commissioner"} onLogout={logout} />

      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Constitution</h1>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 text-white px-3 py-1.5 rounded text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {error && <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded mb-4">{error}</div>}

        {articles.length === 0 && !error && (
          <p className="text-gray-500">No constitution articles found for {year}.</p>
        )}

        <div className="space-y-6">
          {articles.map((article) => (
            <div key={article.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-white mb-3">
                Article {article.article_num} — {article.article_title}
              </h2>
              {article.constitution_sections?.length > 0 ? (
                <ul className="space-y-1 ml-4">
                  {article.constitution_sections
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((section) => (
                      <li key={section.id}>
                        <Link
                          href={`/constitution/${section.anchor}`}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          §{section.section_num} {section.section_title}
                        </Link>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm ml-4">No sections.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
