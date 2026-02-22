import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import mammoth from "mammoth";
import { parse as parseHTML, HTMLElement } from "node-html-parser";

// Roman numeral to integer conversion
function romanToInt(roman: string): number {
  const map: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
  };
  const upper = roman.trim().toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    const current = map[upper[i]];
    const next = map[upper[i + 1]];
    if (current === undefined) return NaN;
    if (next && current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
}

// Parse article numeral (Roman or Arabic) to integer
function parseArticleNum(raw: string): number {
  const trimmed = raw.trim();
  const asInt = parseInt(trimmed, 10);
  if (!isNaN(asInt)) return asInt;
  return romanToInt(trimmed);
}

interface ParsedSection {
  section_num: string;
  section_title: string;
  body: string;
  anchor: string;
}

interface ParsedArticle {
  article_num: number;
  article_title: string;
  sort_order: number;
  sections: ParsedSection[];
}

interface DedupedAnchor {
  article_num: number;
  section_num: string;
  anchor: string;
}

interface ParseResult {
  articles: ParsedArticle[];
  dedupedAnchors: DedupedAnchor[];
}

// Build a unique anchor, tracking used anchors and recording deduped ones
function makeAnchor(
  articleNum: number,
  sectionNum: string,
  usedAnchors: Set<string>,
  dedupedAnchors: DedupedAnchor[],
): string {
  const baseAnchor = `article-${articleNum}-section-${sectionNum}`;
  let anchor = baseAnchor;
  if (usedAnchors.has(anchor)) {
    let suffix = 2;
    while (usedAnchors.has(`${baseAnchor}-${suffix}`)) suffix++;
    anchor = `${baseAnchor}-${suffix}`;
    dedupedAnchors.push({ article_num: articleNum, section_num: sectionNum, anchor });
  }
  usedAnchors.add(anchor);
  return anchor;
}

const SECTION_RE = /^Section\s+(\d+)\s*:\s*(.+)$/i;

// Parse HTML from mammoth into articles and sections.
// Section headers are detected by TEXT content, not by tag type, so that
// "Section X: …" lines rendered as <p>, <strong>, etc. are still recognised.
function parseConstitutionHtml(html: string): ParseResult {
  const articles: ParsedArticle[] = [];
  const usedAnchors = new Set<string>();
  const dedupedAnchors: DedupedAnchor[] = [];

  const root = parseHTML(html);
  const topNodes = root.childNodes;

  // Collect article blocks: { headingEl, bodyNodes[] }
  const articleBlocks: { heading: HTMLElement; bodyNodes: typeof topNodes }[] = [];

  for (const node of topNodes) {
    if (node instanceof HTMLElement && node.tagName === "H1") {
      articleBlocks.push({ heading: node, bodyNodes: [] });
    } else if (articleBlocks.length > 0) {
      articleBlocks[articleBlocks.length - 1].bodyNodes.push(node);
    }
  }

  let articleSortOrder = 1;
  for (const block of articleBlocks) {
    const articleMatch = block.heading.textContent.match(
      /Article\s+([IVXLCDM\d]+)\s*[:\u2013\u2014\-]\s*(.*)/i,
    );
    if (!articleMatch) continue;

    const articleNum = parseArticleNum(articleMatch[1]);
    if (isNaN(articleNum)) continue;
    const articleTitle = articleMatch[2].trim();

    // Walk body nodes; detect section headers by textContent
    const sections: ParsedSection[] = [];
    let currentBodyParts: string[] = [];

    for (const child of block.bodyNodes) {
      const el = child instanceof HTMLElement ? child : null;
      const text = (el ? el.textContent : child.textContent).trim();
      const secMatch = text.match(SECTION_RE);

      if (secMatch) {
        // Flush previous section's body (if a section was already started)
        if (sections.length > 0) {
          sections[sections.length - 1].body = currentBodyParts.join("").trim();
        }
        currentBodyParts = [];

        const sectionNum = secMatch[1];
        const sectionTitle = secMatch[2].trim();
        const anchor = makeAnchor(articleNum, sectionNum, usedAnchors, dedupedAnchors);

        sections.push({ section_num: sectionNum, section_title: sectionTitle, body: "", anchor });
      } else {
        // Accumulate HTML for the current section body
        currentBodyParts.push(el ? el.outerHTML : child.textContent);
      }
    }

    // Flush the last section's body
    if (sections.length > 0) {
      sections[sections.length - 1].body = currentBodyParts.join("").trim();
    }

    // Fallback: no section headers detected → single section
    if (sections.length === 0) {
      const fallbackBody = block.bodyNodes
        .map((n) => (n instanceof HTMLElement ? n.outerHTML : n.textContent))
        .join("")
        .trim();
      if (fallbackBody) {
        const anchor = makeAnchor(articleNum, "1", usedAnchors, dedupedAnchors);
        sections.push({ section_num: "1", section_title: "General", body: fallbackBody, anchor });
      }
    }

    articles.push({
      article_num: articleNum,
      article_title: articleTitle,
      sort_order: articleSortOrder,
      sections,
    });
    articleSortOrder++;
  }

  return { articles, dedupedAnchors };
}

export async function POST(request: Request) {
  // Commissioner-only access
  const session = await getSession();
  if (!session || session.team_name !== COMMISSIONER_TEAM_NAME) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Parse multipart/form-data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // Convert DOCX to HTML using mammoth
  const buffer = Buffer.from(await file.arrayBuffer());
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
  } catch {
    return NextResponse.json(
      { error: "Failed to convert DOCX file" },
      { status: 400 }
    );
  }

  // Parse articles and sections from HTML
  const { articles, dedupedAnchors } = parseConstitutionHtml(html);
  if (articles.length === 0) {
    return NextResponse.json(
      { error: "No articles found in the document. Ensure Article headings use Heading 1 style." },
      { status: 400 }
    );
  }

  const sb = getSupabaseServer();

  // Clear existing data (delete sections first due to FK, then articles)
  await sb.from("constitution_sections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("constitution_articles").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Insert articles and sections
  let totalSections = 0;
  for (const article of articles) {
    const { data: insertedArticle, error: articleError } = await sb
      .from("constitution_articles")
      .insert({
        article_num: article.article_num,
        article_title: article.article_title,
        sort_order: article.sort_order,
      })
      .select("id")
      .single();

    if (articleError || !insertedArticle) {
      return NextResponse.json(
        { error: `Failed to insert Article ${article.article_num}: ${articleError?.message}` },
        { status: 500 }
      );
    }

    // Batch insert sections for this article
    if (article.sections.length > 0) {
      const sectionRows = article.sections.map((section, idx) => ({
        article_id: insertedArticle.id,
        section_num: section.section_num,
        section_title: section.section_title,
        body: section.body,
        anchor: section.anchor,
        sort_order: idx + 1,
      }));

      const { error: sectionError } = await sb
        .from("constitution_sections")
        .insert(sectionRows);

      if (sectionError) {
        return NextResponse.json(
          { error: `Failed to insert sections for Article ${article.article_num}: ${sectionError.message}` },
          { status: 500 }
        );
      }
      totalSections += article.sections.length;
    }
  }

  return NextResponse.json({
    ok: true,
    articlesInserted: articles.length,
    sectionsInserted: totalSections,
    dedupedAnchors,
  });
}
