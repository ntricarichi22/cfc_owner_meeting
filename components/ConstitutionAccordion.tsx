"use client";

import { useState, useEffect, useCallback } from "react";
import DOMPurify from "isomorphic-dompurify";
import { PopCard } from "@/components/ui/primitives";

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

/** Delay (ms) to let React re-render expanded accordions before scrolling */
const SCROLL_DELAY_MS = 50;

function findByHash(articles: Article[], hash: string) {
  if (!hash) return null;
  for (const article of articles) {
    for (const section of article.sections) {
      if (section.anchor === hash) return { articleId: article.id, sectionId: section.id };
    }
  }
  return null;
}

function scrollToHash(hash: string) {
  setTimeout(() => {
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, SCROLL_DELAY_MS);
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
    scrollToHash(hash);
  }, [articles]);

  useEffect(() => {
    // Scroll to the initial hash target after mount
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && findByHash(articles, hash)) {
      scrollToHash(hash);
    }

    const onHashChange = () => {
      openAndScroll(window.location.hash.replace(/^#/, ""));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [articles, openAndScroll]);

  if (articles.length === 0) {
    return <p className="text-[rgba(11,11,15,0.6)]">No constitution articles found.</p>;
  }

  return (
    <div className="space-y-2">
      {articles.map((article) => {
        const artOpen = openArticles.has(article.id);
        return (
          <PopCard key={article.id} className="p-0 overflow-hidden">
            <button
              onClick={() => toggleArticle(article.id)}
              className="w-full flex items-center justify-between px-5 py-4 bg-[var(--card-surface)] hover:bg-[var(--paper-bg)] transition-colors text-left"
            >
              <span className="font-semibold text-[var(--ink)]">
                Article {article.article_num} — {article.article_title}
              </span>
              <span className="text-xl text-[rgba(11,11,15,0.55)] ml-4 flex-shrink-0">{artOpen ? "−" : "+"}</span>
            </button>

            {artOpen && (
              <div className="bg-[var(--paper-bg)] border-t border-[rgba(17,24,39,0.2)]">
                {article.sections.length === 0 && (
                  <p className="text-[rgba(11,11,15,0.6)] px-6 py-3 text-sm">No sections.</p>
                )}
                {article.sections.map((section) => {
                  const secOpen = openSections.has(section.id);
                  return (
                    <div key={section.id} {...(section.anchor ? { id: section.anchor } : {})} className="border-b border-[rgba(17,24,39,0.2)] last:border-b-0">
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full flex items-center justify-between px-6 py-3 hover:bg-[var(--card-surface)] transition-colors text-left"
                      >
                        <span className="text-sm text-[var(--accent-blue)] font-medium">
                          Section {section.section_num} — {section.section_title}
                        </span>
                        <span className="text-lg text-[rgba(11,11,15,0.45)] ml-4 flex-shrink-0">{secOpen ? "−" : "+"}</span>
                      </button>

                      {secOpen && (
                        <div
                          className="px-6 py-4 text-sm text-[var(--ink)] prose max-w-none prose-p:my-4 prose-li:my-1 prose-h2:mt-6 prose-h2:mb-2 prose-h3:mt-4 prose-h3:mb-2 leading-relaxed constitution-body"
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
          </PopCard>
        );
      })}
    </div>
  );
}
