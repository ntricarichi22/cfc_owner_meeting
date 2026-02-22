import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";

/**
 * POST /api/admin/sync-article-buckets
 * Body: { meeting_id: string }
 *
 * For each constitution_article, ensures an agenda_items row exists for
 * the given meeting with category='Article', order_index=sort_order,
 * title='Article <num> – <title>'.
 *
 * Uses only existing columns – no schema changes.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.team_name !== COMMISSIONER_TEAM_NAME) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.meeting_id) {
    return NextResponse.json(
      { error: "meeting_id is required" },
      { status: 400 }
    );
  }

  const sb = getSupabaseServer();

  // 1. Fetch all constitution articles ordered by sort_order
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
    return NextResponse.json({ synced: 0, items: [] });
  }

  // 2. Fetch existing Article-category agenda items for this meeting
  const { data: existing, error: existErr } = await sb
    .from("agenda_items")
    .select("id, title, order_index, category")
    .eq("meeting_id", body.meeting_id)
    .eq("category", "Article");

  if (existErr) {
    return NextResponse.json(
      { error: "Failed to fetch existing agenda items", details: existErr.message },
      { status: 500 }
    );
  }

  const existingByTitle = new Map(
    (existing ?? []).map((item) => [item.title, item])
  );

  const results: { id: string; title: string; order_index: number }[] = [];

  for (const article of articles) {
    const title = `Article ${article.article_num} – ${article.article_title}`;
    const orderIndex = article.sort_order ?? 0;

    const match = existingByTitle.get(title);

    if (match) {
      // Update order_index if it changed
      if (match.order_index !== orderIndex) {
        await sb
          .from("agenda_items")
          .update({ order_index: orderIndex })
          .eq("id", match.id);
      }
      results.push({ id: match.id, title, order_index: orderIndex });
    } else {
      // Insert new agenda item
      const { data: inserted, error: insErr } = await sb
        .from("agenda_items")
        .insert({
          meeting_id: body.meeting_id,
          title,
          category: "Article",
          order_index: orderIndex,
        })
        .select("id, title, order_index")
        .single();

      if (insErr) {
        return NextResponse.json(
          { error: `Failed to create agenda item for "${title}"`, details: insErr.message },
          { status: 500 }
        );
      }

      results.push(inserted);
    }
  }

  return NextResponse.json({ synced: results.length, items: results });
}
