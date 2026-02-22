import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import mammoth from "mammoth";

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

// Parse HTML from mammoth into articles and sections
function parseConstitutionHtml(html: string): ParseResult {
  const articles: ParsedArticle[] = [];
  const usedAnchors = new Set<string>();
  const dedupedAnchors: DedupedAnchor[] = [];

  // Split on <h1> tags to find articles
  const h1Pattern = /<h1>(.*?)<\/h1>/gi;
  const parts: { heading: string; body: string }[] = [];

  let match: RegExpExecArray | null;
  const headings: { heading: string; index: number; endIndex: number }[] = [];

  while ((match = h1Pattern.exec(html)) !== null) {
    headings.push({
      heading: match[1],
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const nextStart = i + 1 < headings.length ? headings[i + 1].index : html.length;
    parts.push({
      heading: headings[i].heading,
      body: html.substring(headings[i].endIndex, nextStart),
    });
  }

  // Parse each article
  let articleSortOrder = 1;
  for (const part of parts) {
    // Match "Article X: Title" or "Article X – Title" or "Article X - Title"
    const articleMatch = part.heading.match(
      /Article\s+([IVXLCDM\d]+)\s*[:\u2013\u2014\-]\s*(.*)/i
    );
    if (!articleMatch) continue;

    const articleNum = parseArticleNum(articleMatch[1]);
    if (isNaN(articleNum)) continue;
    const articleTitle = articleMatch[2].trim();

    // Parse sections within this article body
    const sections: ParsedSection[] = [];
    const h2Pattern = /<h2>(.*?)<\/h2>/gi;
    const sectionHeadings: { heading: string; index: number; endIndex: number }[] = [];
    let h2Match: RegExpExecArray | null;

    while ((h2Match = h2Pattern.exec(part.body)) !== null) {
      sectionHeadings.push({
        heading: h2Match[1],
        index: h2Match.index,
        endIndex: h2Match.index + h2Match[0].length,
      });
    }

    for (let j = 0; j < sectionHeadings.length; j++) {
      // Only create a section when heading matches: Section <number>: <title>
      const sectionMatch = sectionHeadings[j].heading.match(
        /^Section\s+(\d+)\s*:\s*(.+)$/i
      );
      if (!sectionMatch) continue;

      const nextStart =
        j + 1 < sectionHeadings.length
          ? sectionHeadings[j + 1].index
          : part.body.length;
      const sectionBody = part.body.substring(sectionHeadings[j].endIndex, nextStart).trim();

      const sectionNum = sectionMatch[1];
      const sectionTitle = sectionMatch[2].trim();

      // Build unique anchor
      const baseAnchor = `article-${articleNum}-section-${sectionNum}`;
      let anchor = baseAnchor;
      if (usedAnchors.has(anchor)) {
        let suffix = 2;
        while (usedAnchors.has(`${baseAnchor}-${suffix}`)) {
          suffix++;
        }
        anchor = `${baseAnchor}-${suffix}`;
        dedupedAnchors.push({ article_num: articleNum, section_num: sectionNum, anchor });
      }
      usedAnchors.add(anchor);

      sections.push({
        section_num: sectionNum,
        section_title: sectionTitle,
        body: sectionBody,
        anchor,
      });
    }

    // If no matching <h2> sections found, treat all body as a single section
    if (sections.length === 0 && part.body.trim()) {
      const baseAnchor = `article-${articleNum}-section-1`;
      let anchor = baseAnchor;
      if (usedAnchors.has(anchor)) {
        let suffix = 2;
        while (usedAnchors.has(`${baseAnchor}-${suffix}`)) {
          suffix++;
        }
        anchor = `${baseAnchor}-${suffix}`;
        dedupedAnchors.push({ article_num: articleNum, section_num: "1", anchor });
      }
      usedAnchors.add(anchor);

      sections.push({
        section_num: "1",
        section_title: articleTitle,
        body: part.body.trim(),
        anchor,
      });
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
