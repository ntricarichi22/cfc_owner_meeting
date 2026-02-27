import { NextRequest } from "next/server";
import { jsonError, getCurrentTeamSession } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";

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

  const proposals = proposalsRes.data || [];
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

  const slides = proposals.map((p) => {
    const voteSession = voteSessions.find((v) => v.proposal_id === p.id) ?? null;
    const slideVotes = voteSession
      ? votes.filter((v) => v.proposal_version_id === voteSession.proposal_version_id)
      : [];

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
        summary: p.summary,
      },
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
