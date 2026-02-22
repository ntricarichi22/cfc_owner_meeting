"use client";

import { useState, useEffect, useCallback } from "react";
import DOMPurify from "isomorphic-dompurify";

interface Section {
  id: string;
  section_num: string;
  section_title: string;
  body: string;
  anchor: string;
}

interface Article {
  id: string;
  article_num: number;
  article_title: string;
  sections: Section[];
}

function findByHash(articles: Article[], hash: string) {
  if (!hash) return null;
  for (const article of articles) {
    for (const section of article.sections) {
      if (section.anchor === hash) return { articleId: article.id, sectionId: section.id };
    }
  }
  return null;
}

export default function ConstitutionAccordion({ articles }: { articles: Article[] }) {
  const [openArticles, setOpenArticles] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const match = findByHash(articles, window.location.hash.replace(/^#/, ""));
    return match ? new Set([match.articleId]) : new Set();
  });
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const match = findByHash(articles, window.location.hash.replace(/^#/, ""));
    return match ? new Set([match.sectionId]) : new Set();
  });

  const toggleArticle = (id: string) => {
    setOpenArticles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAndScroll = useCallback((hash: string) => {
    const match = findByHash(articles, hash);
    if (!match) return;
    setOpenArticles((prev) => new Set(prev).add(match.articleId));
    setOpenSections((prev) => new Set(prev).add(match.sectionId));
    // Wait for React to re-render the expanded accordions before scrolling
    setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [articles]);

  useEffect(() => {
    // Scroll to the initial hash target after mount
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && findByHash(articles, hash)) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }

    const onHashChange = () => {
      openAndScroll(window.location.hash.replace(/^#/, ""));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [articles, openAndScroll]);

  if (articles.length === 0) {
    return <p className="text-gray-500">No constitution articles found.</p>;
  }

  return (
    <div className="space-y-2">
      {articles.map((article) => {
        const artOpen = openArticles.has(article.id);
        return (
          <div key={article.id} className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleArticle(article.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="font-semibold text-white">
                Article {article.article_num} — {article.article_title}
              </span>
              <span className="text-xl text-gray-400 ml-4 flex-shrink-0">{artOpen ? "−" : "+"}</span>
            </button>

            {artOpen && (
              <div className="bg-gray-950 border-t border-gray-700">
                {article.sections.length === 0 && (
                  <p className="text-gray-500 px-6 py-3 text-sm">No sections.</p>
                )}
                {article.sections.map((section) => {
                  const secOpen = openSections.has(section.id);
                  return (
                    <div key={section.id} {...(section.anchor ? { id: section.anchor } : {})} className="border-b border-gray-800 last:border-b-0">
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-gray-900 transition-colors text-left"
                      >
                        <span className="text-sm text-blue-300">
                          Section {section.section_num} — {section.section_title}
                        </span>
                        <span className="text-lg text-gray-500 ml-4 flex-shrink-0">{secOpen ? "−" : "+"}</span>
                      </button>

                      {secOpen && (
                        <div
                          className="px-6 py-4 text-sm text-gray-300 prose prose-invert max-w-none prose-p:my-4 prose-li:my-1 prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-2 leading-relaxed constitution-body"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(section.body || ""),
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
