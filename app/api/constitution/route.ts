import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const sb = getSupabaseServer();

  const { data: articles, error: aErr } = await sb
    .from("constitution_articles")
    .select("id, article_num, article_title, sort_order")
    .order("sort_order")
    .order("article_num");

  if (aErr)
    return NextResponse.json({ error: "Failed to fetch articles" }, { status: 500 });

  const { data: sections, error: sErr } = await sb
    .from("constitution_sections")
    .select("id, article_id, section_num, section_title, body, anchor, sort_order")
    .order("sort_order")
    .order("section_num");

  if (sErr)
    return NextResponse.json({ error: "Failed to fetch sections" }, { status: 500 });

  const nested = (articles ?? []).map((a) => ({
    id: a.id,
    article_num: a.article_num,
    article_title: a.article_title,
    sections: (sections ?? [])
      .filter((s) => s.article_id === a.id)
      .map((s) => ({
        id: s.id,
        section_num: s.section_num,
        section_title: s.section_title,
        body: s.body,
        anchor: s.anchor,
      })),
  }));

  return NextResponse.json({ articles: nested });
}
