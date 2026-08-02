import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireCommissionerAuth } from "@/lib/voting";
import { readStoredRecommendations } from "@/lib/recommendations";
import { stripHtmlServer } from "@/lib/transcript";
import { buildRedlineDocx, type RedlineArticle } from "@/lib/redline";

export const maxDuration = 60;

/**
 * GET — download the full constitution as a Word document with tracked
 * changes for every amended section and a comment explaining each edit.
 * Uses the saved constitution recommendations (generate/edit those first).
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const sb = getSupabaseServer();

  const minutesRes = await sb
    .from("meeting_minutes")
    .select("checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (minutesRes.error) return jsonError(500, "Supabase error", minutesRes.error.message);
  const recommendations = readStoredRecommendations(minutesRes.data?.checklist_markdown);
  if (!recommendations || recommendations.items.length === 0) {
    return jsonError(400, "No constitution recommendations saved. Generate them first on the Constitution Updates page.");
  }

  const meetingRes = await sb
    .from("meetings")
    .select("title, year")
    .eq("id", meetingId)
    .maybeSingle();
  const meeting = meetingRes.data;

  const articlesRes = await sb
    .from("constitution_articles")
    .select("id, article_num, article_title, sort_order")
    .order("sort_order")
    .order("article_num");
  if (articlesRes.error) return jsonError(500, "Supabase error", articlesRes.error.message);

  const sectionsRes = await sb
    .from("constitution_sections")
    .select("id, article_id, section_num, section_title, body, sort_order")
    .order("sort_order")
    .order("section_num");
  if (sectionsRes.error) return jsonError(500, "Supabase error", sectionsRes.error.message);

  // Map section id → amendment (recommendation with non-empty recommended text).
  const amendmentsBySection = new Map<
    string,
    { commentLines: string[]; recommended_body: string }
  >();
  for (const item of recommendations.items) {
    for (const sec of item.sections) {
      if (!sec.section_id || !sec.recommended_body.trim()) continue;
      const commentLines = [
        `Amendment: ${item.title} (${item.vote})`,
        item.effective_date ? `Effective: ${item.effective_date}` : null,
        item.change_summary ? `Change: ${item.change_summary}` : null,
        item.commissioner_notes ? `Commissioner notes: ${item.commissioner_notes}` : null,
      ].filter((l): l is string => !!l);
      amendmentsBySection.set(sec.section_id, {
        commentLines,
        recommended_body: sec.recommended_body.trim(),
      });
    }
  }

  const articles: RedlineArticle[] = (articlesRes.data || []).map((a) => ({
    article_num: a.article_num ?? null,
    article_title: a.article_title ?? null,
    sections: (sectionsRes.data || [])
      .filter((s) => s.article_id === a.id)
      .map((s) => ({
        section_num: s.section_num ?? null,
        section_title: s.section_title ?? null,
        body: stripHtmlServer(s.body ?? ""),
        amendment: amendmentsBySection.get(s.id) ?? null,
      })),
  }));

  const year = meeting?.year ?? new Date().getFullYear();
  const buffer = await buildRedlineDocx({
    title: "CFC Constitution — Amendment Redline",
    subtitle: `${meeting?.title ?? "Owners Meeting"} · generated ${new Date().toLocaleDateString("en-US")}`,
    articles,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="CFC-Constitution-Redline-${year}.docx"`,
    },
  });
}
