import { NextRequest } from "next/server";
import { jsonError, getCurrentTeamSession } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const { meetingId } = await params;
  const sb = getSupabaseServer();

  const [agendaItemsRes, proposalsRes, voteSessionsRes] = await Promise.all([
    sb
      .from("agenda_items")
      .select("id, title, category, order_index")
      .eq("meeting_id", meetingId)
      .order("order_index"),
    sb
      .from("proposals")
      .select("id, agenda_item_id, title, status, summary")
      .eq("meeting_id", meetingId),
    sb
      .from("proposal_vote_sessions")
      .select("proposal_id, proposal_version_id, yes_count, no_count, total_count, passed, status")
      .eq("meeting_id", meetingId),
  ]);

  if (agendaItemsRes.error)
    return jsonError(500, "Supabase error", agendaItemsRes.error.message, agendaItemsRes.error.code);
  if (proposalsRes.error)
    return jsonError(500, "Supabase error", proposalsRes.error.message, proposalsRes.error.code);

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

  const proposals = proposalsRes.data || [];

  const slides = (agendaItemsRes.data || []).map((item) => {
    const proposal = proposals.find((p) => p.agenda_item_id === item.id) ?? null;
    const voteSession = proposal
      ? voteSessions.find((v) => v.proposal_id === proposal.id) ?? null
      : null;
    const slideVotes = voteSession
      ? votes.filter((v) => v.proposal_version_id === voteSession.proposal_version_id)
      : [];

    return {
      id: item.id,
      order_index: item.order_index,
      title: item.title,
      category: item.category,
      proposal: proposal
        ? {
            id: proposal.id,
            title: proposal.title,
            status: proposal.status,
            summary: proposal.summary,
          }
        : null,
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
