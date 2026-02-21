import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getProposalVersionContext, normalizeVote, requireTeamAuth } from "@/lib/voting";

export async function POST(req: NextRequest) {
  const auth = await requireTeamAuth().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const { proposalVersionId, vote } = await req.json().catch(() => ({}));
  if (!proposalVersionId || typeof vote !== "string") {
    return jsonError(400, "proposalVersionId and vote are required");
  }

  const normalizedVote = normalizeVote(vote);
  if (!normalizedVote) return jsonError(400, "vote must be YES or NO");

  const context = await getProposalVersionContext(proposalVersionId).catch((error) => ({ error }));
  if (context && "error" in context) return jsonError(500, "Supabase error", context.error.message, context.error.code);
  if (!context) return jsonError(404, "Proposal version not found");

  const sb = getSupabaseServer();
  const voteSession = await sb
    .from("proposal_vote_sessions")
    .select("status")
    .eq("proposal_version_id", proposalVersionId)
    .maybeSingle();
  if (voteSession.error) return jsonError(500, "Supabase error", voteSession.error.message, voteSession.error.code);
  if (!voteSession.data || voteSession.data.status !== "open") return jsonError(409, "Voting is not open");

  const { error } = await sb.from("votes").upsert(
    {
      proposal_version_id: proposalVersionId,
      team_id: auth.teamSession.team_id || auth.session.owner_id,
      team_name: auth.teamSession.team_name,
      vote: normalizedVote,
    },
    { onConflict: "proposal_version_id,team_id" }
  );
  if (error) return jsonError(500, "Supabase error", error.message, error.code);

  return Response.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const auth = await requireTeamAuth().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const proposalVersionId = req.nextUrl.searchParams.get("proposalVersionId");
  if (!proposalVersionId) return jsonError(400, "proposalVersionId is required");

  const sb = getSupabaseServer();
  const voteSession = await sb
    .from("proposal_vote_sessions")
    .select("status, yes_count, no_count, abstain_count, total_count, passed")
    .eq("proposal_version_id", proposalVersionId)
    .maybeSingle();
  if (voteSession.error) return jsonError(500, "Supabase error", voteSession.error.message, voteSession.error.code);

  const myVoteRes = await sb
    .from("votes")
    .select("vote")
    .eq("proposal_version_id", proposalVersionId)
    .eq("team_id", auth.teamSession.team_id || auth.session.owner_id)
    .maybeSingle();
  if (myVoteRes.error) return jsonError(500, "Supabase error", myVoteRes.error.message, myVoteRes.error.code);

  const status = voteSession.data?.status || "not_open";
  const submittedCount = await sb
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("proposal_version_id", proposalVersionId);
  if (submittedCount.error) return jsonError(500, "Supabase error", submittedCount.error.message, submittedCount.error.code);

  if (status !== "tallied") {
    return Response.json({
      status,
      submittedCount: submittedCount.count || 0,
      myVote: myVoteRes.data?.vote || null,
    });
  }

  const rollCall = await sb
    .from("votes")
    .select("team_name, team_id, vote")
    .eq("proposal_version_id", proposalVersionId)
    .order("team_name");
  if (rollCall.error) return jsonError(500, "Supabase error", rollCall.error.message, rollCall.error.code);

  return Response.json({
    status,
    totals: {
      yes: voteSession.data?.yes_count || 0,
      no: voteSession.data?.no_count || 0,
      abstain: 0,
      total: voteSession.data?.total_count || 0,
    },
    passed: voteSession.data?.passed ?? null,
    rollCall: rollCall.data || [],
  });
}
