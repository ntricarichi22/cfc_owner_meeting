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
  if (context.meeting.locked) return jsonError(409, "Meeting is locked");

  const sb = getSupabaseServer();
  const { error } = await sb
    .from("proposal_vote_sessions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by_team: auth.teamSession.team_name,
    })
    .eq("proposal_version_id", proposalVersionId);
  if (error) return jsonError(500, "Supabase error", error.message, error.code);

  await insertAuditEvent(context.meeting.id, context.proposal.id, "voting_closed", { proposalVersionId });
  return Response.json({ ok: true });
}
