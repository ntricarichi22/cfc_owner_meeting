import { NextRequest } from "next/server";
import { getCurrentTeamSession, jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const proposalVersionId = req.nextUrl.searchParams.get("proposalVersionId");
  if (!proposalVersionId) return jsonError(400, "proposalVersionId is required");

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("proposal_vote_sessions")
    .select("status, opened_at, closed_at, tallied_at, yes_count, no_count, abstain_count, total_count, passed")
    .eq("proposal_version_id", proposalVersionId)
    .maybeSingle();

  if (error) return jsonError(500, "Supabase error", error.message, error.code);
  if (!data) return Response.json({ status: "not_open" });

  if (data.status !== "tallied") {
    return Response.json({
      status: data.status,
      opened_at: data.opened_at,
      closed_at: data.closed_at,
      tallied_at: data.tallied_at,
    });
  }

  return Response.json({
    status: data.status,
    opened_at: data.opened_at,
    closed_at: data.closed_at,
    tallied_at: data.tallied_at,
    yes_count: data.yes_count,
    no_count: data.no_count,
    abstain_count: data.abstain_count,
    total_count: data.total_count,
    passed: data.passed,
  });
}

