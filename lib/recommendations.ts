/**
 * Constitution change recommendations.
 *
 * After a meeting, generate recommended constitution edits from the proposals
 * that PASSED (tallied vote sessions), using the proposal's active version
 * text, commissioner notes, transcript discussion summaries, and the current
 * text of each linked constitution section.
 *
 * Persisted (schema-free) under meeting_minutes.checklist_markdown JSON key
 * `constitution_recommendations`, alongside slide_notes / commissioner_notes /
 * discussion_summaries.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { callLLM, extractJson, llmProvider } from "@/lib/llm";
import { parseChecklist, stripHtmlServer, type DiscussionSummary } from "@/lib/transcript";

export interface SectionRecommendation {
  /** Constitution section id, or null when the proposal maps to no existing section. */
  section_id: string | null;
  label: string;
  anchor: string | null;
  current_body: string;
  recommended_body: string;
}

export interface ProposalRecommendation {
  proposal_id: string;
  title: string;
  vote: string;
  effective_date: string | null;
  proposed_by: string | null;
  commissioner_notes: string | null;
  proposal_text: string;
  change_summary: string;
  sections: SectionRecommendation[];
  source: "ai" | "fallback";
}

export interface ConstitutionRecommendations {
  generated_at: string;
  provider: string | null;
  items: ProposalRecommendation[];
}

interface SectionRow {
  id: string;
  article_id: string | null;
  section_num: string | null;
  section_title: string | null;
  body: string | null;
  anchor: string | null;
}

interface ArticleRow {
  id: string;
  article_num: number | null;
  article_title: string | null;
}

function sectionLabel(section: SectionRow, article: ArticleRow | undefined): string {
  const num = section.section_num ?? "";
  const title = section.section_title ?? "";
  const art = article?.article_title
    ? `Art. ${article.article_num} – ${article.article_title}`
    : article?.article_num != null
      ? `Art. ${article.article_num}`
      : "";
  const sec = [num ? `§${num}` : "", title].filter(Boolean).join(" ");
  return [art, sec].filter(Boolean).join(", ") || "Constitution section";
}

export function readStoredRecommendations(checklistRaw: string | null | undefined): ConstitutionRecommendations | null {
  const blob = parseChecklist(checklistRaw) as Record<string, unknown>;
  const stored = blob.constitution_recommendations;
  return stored && typeof stored === "object" ? (stored as ConstitutionRecommendations) : null;
}

export async function saveRecommendations(
  meetingId: string,
  recommendations: ConstitutionRecommendations,
): Promise<string | null> {
  const sb = getSupabaseServer();
  const fresh = await sb
    .from("meeting_minutes")
    .select("checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (fresh.error) return fresh.error.message;
  const blob = parseChecklist(fresh.data?.checklist_markdown) as Record<string, unknown>;
  blob.constitution_recommendations = recommendations;
  const upsert = await sb
    .from("meeting_minutes")
    .upsert({ meeting_id: meetingId, checklist_markdown: JSON.stringify(blob) }, { onConflict: "meeting_id" });
  return upsert.error ? upsert.error.message : null;
}

interface AiSectionEdit {
  section_id: string;
  recommended_body: string;
}

interface AiRecommendation {
  change_summary: string;
  sections: AiSectionEdit[];
  new_section_text?: string;
}

/**
 * Generate recommendations for every passed proposal in a meeting and persist
 * them. Re-runnable; replaces the stored set.
 */
export async function generateRecommendations(meetingId: string): Promise<
  { ok: true; recommendations: ConstitutionRecommendations } | { ok: false; error: string }
> {
  const sb = getSupabaseServer();

  const proposalsRes = await sb
    .from("proposals")
    .select("id, title, order_index, proposal_type, proposed_by, effective_date, summary, article_sections, created_at")
    .eq("meeting_id", meetingId)
    .order("order_index")
    .order("created_at");
  if (proposalsRes.error) return { ok: false, error: `Supabase error: ${proposalsRes.error.message}` };
  const proposals = (proposalsRes.data || []).filter((p) => (p.proposal_type ?? "proposal") !== "admin");
  if (proposals.length === 0) {
    return { ok: false, error: "This meeting has no proposals." };
  }

  const proposalIds = proposals.map((p) => p.id);
  const voteSessionsRes = await sb
    .from("proposal_vote_sessions")
    .select("proposal_id, status, yes_count, no_count, total_count, passed")
    .in("proposal_id", proposalIds);
  const voteSessions = voteSessionsRes.error ? [] : (voteSessionsRes.data || []);

  const passedProposals = proposals.filter((p) => {
    const vs = voteSessions.find((v) => v.proposal_id === p.id);
    return vs?.status === "tallied" && vs.passed === true;
  });
  if (passedProposals.length === 0) {
    return { ok: false, error: "No passed proposals found for this meeting (votes must be tallied)." };
  }

  // Active proposal version text
  const versionsRes = await sb
    .from("proposal_versions")
    .select("proposal_id, version_number, full_text, is_active")
    .in("proposal_id", passedProposals.map((p) => p.id))
    .eq("is_active", true)
    .order("version_number", { ascending: false });
  const versions = versionsRes.error ? [] : (versionsRes.data || []);

  // Commissioner notes + discussion summaries
  const minutesRes = await sb
    .from("meeting_minutes")
    .select("checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  const checklist = parseChecklist(minutesRes.data?.checklist_markdown);
  const commissionerNotes = (checklist.commissioner_notes ?? {}) as Record<string, string>;
  const discussionSummaries = (checklist.discussion_summaries ?? {}) as Record<string, DiscussionSummary>;

  // Constitution sections + articles
  const sectionsRes = await sb
    .from("constitution_sections")
    .select("id, article_id, section_num, section_title, body, anchor");
  const sections = (sectionsRes.error ? [] : (sectionsRes.data || [])) as SectionRow[];
  const articlesRes = await sb
    .from("constitution_articles")
    .select("id, article_num, article_title");
  const articles = (articlesRes.error ? [] : (articlesRes.data || [])) as ArticleRow[];
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const articleMap = new Map(articles.map((a) => [a.id, a]));

  const hasLlm = !!llmProvider();

  const items: ProposalRecommendation[] = await Promise.all(
    passedProposals.map(async (proposal) => {
      const vs = voteSessions.find((v) => v.proposal_id === proposal.id);
      const vote = vs ? `PASSED ${vs.yes_count ?? 0}-${vs.no_count ?? 0}` : "PASSED";
      const activeVersion = versions.find((v) => v.proposal_id === proposal.id);
      const proposalText = stripHtmlServer(activeVersion?.full_text || proposal.summary || "");
      const notes = commissionerNotes[proposal.id] || null;
      const discussion = discussionSummaries[proposal.id]?.summary || null;

      const linkedIds = Array.isArray(proposal.article_sections) ? (proposal.article_sections as string[]) : [];
      const linkedSections = linkedIds
        .map((id) => sectionMap.get(id))
        .filter((s): s is SectionRow => !!s);

      // Deterministic fallback: current text side-by-side with the proposal
      // text; the commissioner edits wording manually.
      const fallback = (): ProposalRecommendation => ({
        proposal_id: proposal.id,
        title: proposal.title,
        vote,
        effective_date: proposal.effective_date ?? null,
        proposed_by: proposal.proposed_by ?? null,
        commissioner_notes: notes,
        proposal_text: proposalText,
        change_summary: proposalText
          ? `Apply the approved proposal "${proposal.title}" to the sections below.`
          : `Approved proposal "${proposal.title}" — no proposal text on file; edit manually.`,
        sections: linkedSections.length
          ? linkedSections.map((s) => ({
              section_id: s.id,
              label: sectionLabel(s, s.article_id ? articleMap.get(s.article_id) : undefined),
              anchor: s.anchor ?? null,
              current_body: stripHtmlServer(s.body ?? ""),
              recommended_body: "",
            }))
          : [
              {
                section_id: null,
                label: "No linked section — place manually",
                anchor: null,
                current_body: "",
                recommended_body: proposalText,
              },
            ],
        source: "fallback",
      });

      if (!hasLlm) return fallback();

      const system = [
        "You are helping a fantasy football league commissioner update the league constitution after the annual owners meeting.",
        "A proposal PASSED. Rewrite the affected constitution section(s) to incorporate the approved change.",
        "Keep the existing structure, numbering, tone, and any content unrelated to this change EXACTLY as-is — only edit what the proposal requires.",
        "If commissioner notes describe modifications agreed during the meeting, incorporate them.",
        "If no existing section is provided, draft the new constitution text in `new_section_text`.",
        'Respond with ONLY JSON: {"change_summary": "<1-3 sentence plain-English summary of the change>", "sections": [{"section_id": "<id>", "recommended_body": "<full revised section text>"}], "new_section_text": "<only when no sections were provided>"}',
      ].join(" ");

      const user = [
        `Proposal: ${proposal.title}`,
        `Vote result: ${vote}`,
        proposal.effective_date ? `Effective: ${proposal.effective_date}` : null,
        `Approved proposal text:\n${proposalText || "(none on file)"}`,
        notes ? `Commissioner notes (modifications agreed at the meeting):\n${notes}` : null,
        discussion ? `Meeting discussion summary:\n${discussion}` : null,
        linkedSections.length
          ? `Current constitution section(s) to update:\n${linkedSections
              .map((s) => `--- section_id: ${s.id} | ${sectionLabel(s, s.article_id ? articleMap.get(s.article_id) : undefined)} ---\n${stripHtmlServer(s.body ?? "")}`)
              .join("\n\n")}`
          : "No constitution sections are linked to this proposal.",
      ]
        .filter(Boolean)
        .join("\n\n");

      const raw = await callLLM(system, user, 3000);
      const ai = extractJson<AiRecommendation>(raw);
      if (!ai || typeof ai.change_summary !== "string") return fallback();

      const aiSections: SectionRecommendation[] = [];
      for (const linked of linkedSections) {
        const edit = Array.isArray(ai.sections) ? ai.sections.find((s) => s?.section_id === linked.id) : null;
        aiSections.push({
          section_id: linked.id,
          label: sectionLabel(linked, linked.article_id ? articleMap.get(linked.article_id) : undefined),
          anchor: linked.anchor ?? null,
          current_body: stripHtmlServer(linked.body ?? ""),
          recommended_body: typeof edit?.recommended_body === "string" ? edit.recommended_body.trim() : "",
        });
      }
      if (linkedSections.length === 0) {
        aiSections.push({
          section_id: null,
          label: "New / unmapped constitution text — place manually",
          anchor: null,
          current_body: "",
          recommended_body:
            typeof ai.new_section_text === "string" && ai.new_section_text.trim()
              ? ai.new_section_text.trim()
              : proposalText,
        });
      }

      return {
        proposal_id: proposal.id,
        title: proposal.title,
        vote,
        effective_date: proposal.effective_date ?? null,
        proposed_by: proposal.proposed_by ?? null,
        commissioner_notes: notes,
        proposal_text: proposalText,
        change_summary: ai.change_summary.trim(),
        sections: aiSections,
        source: "ai" as const,
      };
    }),
  );

  const recommendations: ConstitutionRecommendations = {
    generated_at: new Date().toISOString(),
    provider: llmProvider(),
    items,
  };

  const saveError = await saveRecommendations(meetingId, recommendations);
  if (saveError) return { ok: false, error: `Supabase error: ${saveError}` };
  return { ok: true, recommendations };
}
