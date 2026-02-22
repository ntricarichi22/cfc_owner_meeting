import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseServer();

  // Try fetching sections with article relationship (full schema)
  const { data: sections, error: secErr } = await sb
    .from("constitution_sections")
    .select("id, section_num, section_title, anchor, article_id")
    .order("sort_order");

  if (!secErr && sections && sections.length > 0) {
    // Fetch articles to join article_num and article_title
    const { data: articles } = await sb
      .from("constitution_articles")
      .select("id, article_num, article_title");

    const articleMap = new Map(
      (articles || []).map((a) => [a.id, a])
    );

    const result = sections.map((s) => {
      const art = articleMap.get(s.article_id);
      return {
        id: s.id,
        section_num: s.section_num,
        section_title: s.section_title,
        anchor: s.anchor,
        article_num: art?.article_num ?? null,
        article_title: art?.article_title ?? null,
      };
    });

    return NextResponse.json(result);
  }

  // Fallback: MVP schema with section_key / title
  const { data, error } = await sb
    .from("constitution_sections")
    .select("id, section_key, title")
    .order("section_key");
  if (error) return NextResponse.json({ error: "Failed to fetch constitution sections" }, { status: 500 });

  return NextResponse.json(data || []);
}
