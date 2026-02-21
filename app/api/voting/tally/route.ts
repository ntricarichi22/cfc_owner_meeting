import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getProposalVersionContext, insertAuditEvent, requireCommissionerAuth } from "@/lib/voting";
import { VOTE_THRESHOLD } from "@/lib/types";

export async function POST(req: NextRequest) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { proposalVersionId } = await req.json().catch(() => ({}));
  if (!proposalVersionId) return jsonError(400, "proposalVersionId is required");

  const context = await getProposalVersionContext(proposalVersionId).catch((error) => ({ error }));
  if (context && "error" in context) return jsonError(500, "Supabase error", context.error.message, context.error.code);
  if (!context) return jsonError(404, "Proposal version not found");
  if (context.meeting.locked) return jsonError(409, "Meeting is locked");

  const sb = getSupabaseServer();
  const voteSession = await sb
    .from("proposal_vote_sessions")
    .select("status")
    .eq("proposal_version_id", proposalVersionId)
    .maybeSingle();
  if (voteSession.error) return jsonError(500, "Supabase error", voteSession.error.message, voteSession.error.code);
  if (!voteSession.data) return jsonError(409, "Voting has not been opened");
  if (voteSession.data.status !== "closed") return jsonError(409, "Voting must be closed before tally");

  const votes = await sb
    .from("votes")
    .select("vote")
    .eq("proposal_version_id", proposalVersionId);
  if (votes.error) return jsonError(500, "Supabase error", votes.error.message, votes.error.code);

  const counts = { yes: 0, no: 0, abstain: 0 };
  for (const row of votes.data || []) {
    const value = (row.vote || "").toLowerCase();
    if (value === "yes") counts.yes += 1;
    else if (value === "no") counts.no += 1;
    else if (value === "abstain") counts.abstain += 1;
  }
  const total = counts.yes + counts.no + counts.abstain;
  const passed = counts.yes >= VOTE_THRESHOLD;

  const update = await sb
    .from("proposal_vote_sessions")
    .update({
      status: "tallied",
      tallied_at: new Date().toISOString(),
      tallied_by_team: auth.teamSession.team_name,
      yes_count: counts.yes,
      no_count: counts.no,
      abstain_count: counts.abstain,
      total_count: total,
      passed,
    })
    .eq("proposal_version_id", proposalVersionId);
  if (update.error) return jsonError(500, "Supabase error", update.error.message, update.error.code);

  await insertAuditEvent(context.meeting.id, context.proposal.id, "voting_tallied", {
    proposalVersionId,
    yes_count: counts.yes,
    no_count: counts.no,
    abstain_count: counts.abstain,
    total_count: total,
    passed,
  });
  return Response.json({ ok: true, totals: counts, passed });
}
