import Nav from "@/components/Nav";
import ConstitutionAccordion from "@/components/ConstitutionAccordion";
import { PopCard } from "@/components/ui/primitives";
import { getSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getConstitutionData() {
  const sb = getSupabaseServer();

  const { data: articles, error: aErr } = await sb
    .from("constitution_articles")
    .select("id, article_num, article_title, sort_order")
    .order("sort_order")
    .order("article_num");

  if (aErr) throw new Error("Failed to fetch articles");

  const { data: sections, error: sErr } = await sb
    .from("constitution_sections")
    .select("id, article_id, section_num, section_title, body, anchor, sort_order")
    .order("sort_order")
    .order("section_num");

  if (sErr) throw new Error("Failed to fetch sections");

  return (articles ?? []).map((a) => ({
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
}

export default async function ConstitutionPage() {
  let articles: Awaited<ReturnType<typeof getConstitutionData>> = [];
  let error = "";

  try {
    articles = await getConstitutionData();
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : "Failed to load constitution";
  }

  return (
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
      <Nav />

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Constitution</h1>

        {error && (
          <PopCard className="mb-4 border-[var(--border-width)] border-[var(--accent-red)] text-[var(--ink)]">
            <p className="text-[var(--accent-red)] font-semibold">{error}</p>
          </PopCard>
        )}

        <ConstitutionAccordion articles={articles} />
      </div>
    </div>
  );
}
