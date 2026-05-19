import { NextRequest } from "next/server";
import { jsonError, getCurrentTeamSession } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { parseChecklist, type DiscussionSummary } from "@/lib/transcript";

type ProposalRow = {
  id: string;
  title: string;
  order_index: number;
  proposal_type: string | null;
  proposed_by: string | null;
  effective_date: string | null;
  summary: string | null;
  article_sections: unknown;
  status: string;
  created_at: string;
};

export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const { meetingId } = await params;
  const sb = getSupabaseServer();

  // Primary source: proposals ordered by their own order_index, matching the live meeting carousel.
  // This ensures admin + proposal slides appear in the correct order, using the real proposal data.
  const proposalsRes = await sb
    .from("proposals")
    .select("id, title, order_index, proposal_type, proposed_by, effective_date, summary, article_sections, status, created_at")
    .eq("meeting_id", meetingId)
    .order("order_index")
    .order("created_at");

  if (proposalsRes.error)
    return jsonError(500, "Supabase error", proposalsRes.error.message, proposalsRes.error.code);

  const proposals = (proposalsRes.data || []) as ProposalRow[];
  const proposalIds = proposals.map((p) => p.id);

  // Fetch vote sessions by proposal_id (not meeting_id) so sessions without meeting_id set
  // are still found — a session's meeting_id may be NULL if created before the column existed.
  const voteSessionsRes = proposalIds.length > 0
    ? await sb
        .from("proposal_vote_sessions")
        .select("proposal_id, proposal_version_id, yes_count, no_count, total_count, passed, status")
        .in("proposal_id", proposalIds)
    : { data: [] as Array<{ proposal_id: string; proposal_version_id: string; yes_count: number; no_count: number; total_count: number; passed: boolean | null; status: string }>, error: null };
  const voteSessions = voteSessionsRes.error ? [] : (voteSessionsRes.data || []);

  // Fetch individual votes for tallied sessions so the UI can show who voted which way
  const talliedVersionIds = voteSessions
    .filter((s) => s.status === "tallied")
    .map((s) => s.proposal_version_id);

  let votes: { proposal_version_id: string; team_name: string; vote: string }[] = [];
  if (talliedVersionIds.length) {
    const votesRes = await sb
      .from("votes")
      .select("proposal_version_id, team_name, vote")
      .in("proposal_version_id", talliedVersionIds)
      .order("team_name");
    if (!votesRes.error) votes = votesRes.data || [];
  }

  // Load any transcript-derived discussion summaries (stored under
  // meeting_minutes.checklist_markdown JSON). When present, these replace
  // the proposal.summary in the Minutes Review payload so the page shows
  // the actual transcript-driven discussion rather than the slide's own text.
  let discussionSummaries: Record<string, DiscussionSummary> = {};
  const minutesRes = await sb
    .from("meeting_minutes")
    .select("checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (!minutesRes.error && minutesRes.data?.checklist_markdown) {
    const blob = parseChecklist(minutesRes.data.checklist_markdown);
    if (blob.discussion_summaries && typeof blob.discussion_summaries === "object") {
      discussionSummaries = blob.discussion_summaries;
    }
  }

  const slides = proposals.map((p) => {
    const voteSession = voteSessions.find((v) => v.proposal_id === p.id) ?? null;
    const slideVotes = voteSession
      ? votes.filter((v) => v.proposal_version_id === voteSession.proposal_version_id)
      : [];

    // Prefer the transcript-derived discussion summary when one exists.
    // Falls back to the proposal's own summary (which may be HTML — the client
    // strips it before rendering) when no transcript summary has been generated.
    const generated = discussionSummaries[p.id];
    const proposalSummary = generated ? generated.summary : p.summary;

    return {
      id: p.id,
      order_index: p.order_index,
      title: p.title,
      // Map proposal_type to category so badge logic works ('admin' → admin badge, else proposal)
      category: p.proposal_type ?? "proposal",
      proposed_by: p.proposed_by ?? null,
      effective_date: p.effective_date ?? null,
      article_sections: (p.article_sections as string[] | null) ?? [],
      proposal: {
        id: p.id,
        title: p.title,
        status: p.status,
        summary: proposalSummary,
      },
      // Per-slide transcript excerpt (plain text) when available, so the
      // existing "View Transcript Excerpt" modal can show only the discussion
      // for this slide instead of the entire meeting transcript.
      transcript_excerpt: generated?.transcript_excerpt ?? null,
      summary_confidence: generated?.confidence ?? null,
      summary_source: generated?.source ?? null,
      voteSession: voteSession
        ? {
            yes_count: voteSession.yes_count,
            no_count: voteSession.no_count,
            total_count: voteSession.total_count,
            passed: voteSession.passed,
            status: voteSession.status,
          }
        : null,
      votes: slideVotes
        .filter((v): v is { proposal_version_id: string; team_name: string; vote: "yes" | "no" } =>
          v.vote === "yes" || v.vote === "no",
        )
        .map((v) => ({ team_name: v.team_name, vote: v.vote })),
    };
  });

  return Response.json({ slides });
}
