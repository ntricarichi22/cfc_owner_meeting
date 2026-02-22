import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";

/**
 * GET /api/admin/constitution-article-sections
 *
 * Returns constitution articles with their sections for the meeting builder
 * section dropdowns. Queries the legacy constitution_articles and
 * constitution_sections tables that have article_id relationships.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.team_name !== COMMISSIONER_TEAM_NAME) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseServer();

  // Fetch articles
  const { data: articles, error: artErr } = await sb
    .from("constitution_articles")
    .select("id, article_num, article_title, sort_order")
    .order("sort_order")
    .order("article_num");

  if (artErr) {
    return NextResponse.json(
      { error: "Failed to fetch constitution articles", details: artErr.message },
      { status: 500 }
    );
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch all sections with their article_id
  const { data: sections, error: secErr } = await sb
    .from("constitution_sections")
    .select("id, article_id, section_num, section_title, anchor, sort_order")
    .order("sort_order");

  if (secErr) {
    // If the legacy constitution_sections table doesn't have article_id,
    // return articles without sections
    return NextResponse.json(
      articles.map((a) => ({
        id: a.id,
        article_num: a.article_num,
        article_title: a.article_title,
        sort_order: a.sort_order,
        sections: [],
      }))
    );
  }

  // Group sections by article_id
  const sectionsByArticle = new Map<string, typeof sections>();
  for (const sec of sections || []) {
    if (!sec.article_id) continue;
    const list = sectionsByArticle.get(sec.article_id) || [];
    list.push(sec);
    sectionsByArticle.set(sec.article_id, list);
  }

  const result = articles.map((a) => ({
    id: a.id,
    article_num: a.article_num,
    article_title: a.article_title,
    sort_order: a.sort_order,
    sections: (sectionsByArticle.get(a.id) || []).map((s) => ({
      id: s.id,
      section_num: s.section_num,
      section_title: s.section_title,
      anchor: s.anchor,
    })),
  }));

  return NextResponse.json(result);
}
