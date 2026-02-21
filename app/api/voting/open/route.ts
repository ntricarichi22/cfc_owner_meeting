import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getProposalVersionContext, insertAuditEvent, requireCommissionerAuth } from "@/lib/voting";

export async function POST(req: NextRequest) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { proposalVersionId } = await req.json().catch(() => ({}));
  if (!proposalVersionId) return jsonError(400, "proposalVersionId is required");

  const context = await getProposalVersionContext(proposalVersionId).catch((error) => ({ error }));
  if (context && "error" in context) return jsonError(500, "Supabase error", context.error.message, context.error.code);
  if (!context) return jsonError(404, "Proposal version not found");
  if (!context.version.is_active) return jsonError(409, "Voting may only be opened for the active proposal version");

  const sb = getSupabaseServer();
  const { error } = await sb.from("proposal_vote_sessions").upsert(
    {
      meeting_id: context.meeting.id,
      proposal_id: context.proposal.id,
      proposal_version_id: proposalVersionId,
      status: "open",
      opened_at: new Date().toISOString(),
      opened_by_team: auth.teamSession.team_name,
      closed_at: null,
      tallied_at: null,
      passed: null,
      yes_count: 0,
      no_count: 0,
      abstain_count: 0,
      total_count: 0,
    },
    { onConflict: "proposal_version_id" }
  );
  if (error) return jsonError(500, "Supabase error", error.message, error.code);

  await insertAuditEvent(context.meeting.id, context.proposal.id, "voting_opened", { proposalVersionId });
  return Response.json({ ok: true });
}
