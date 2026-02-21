import { NextRequest } from "next/server";
import { getCurrentTeamSession, jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const yearFilter = req.nextUrl.searchParams.get("year");
  const outcomeFilter = req.nextUrl.searchParams.get("outcome");

  const sb = getSupabaseServer();
  const meetings = await sb
    .from("meetings")
    .select("id, year, title, status, locked")
    .order("year", { ascending: false });
  if (meetings.error) return jsonError(500, "Supabase error", meetings.error.message, meetings.error.code);

  const filteredMeetings = (meetings.data || []).filter((meeting) => !yearFilter || String(meeting.year) === yearFilter);
  const meetingIds = filteredMeetings.map((m) => m.id);

  const proposals = meetingIds.length
    ? await sb.from("proposals").select("id, meeting_id").in("meeting_id", meetingIds)
    : { data: [], error: null };
  if (proposals.error) return jsonError(500, "Supabase error", proposals.error.message, proposals.error.code);

  const proposalIds = (proposals.data || []).map((p) => p.id);
  const activeVersions = proposalIds.length
    ? await sb.from("proposal_versions").select("id, proposal_id").in("proposal_id", proposalIds).eq("is_active", true)
    : { data: [], error: null };
  if (activeVersions.error) return jsonError(500, "Supabase error", activeVersions.error.message, activeVersions.error.code);

  const activeVersionIds = (activeVersions.data || []).map((v) => v.id);
  const voteSessions = activeVersionIds.length
    ? await sb
        .from("proposal_vote_sessions")
        .select("proposal_version_id, passed")
        .in("proposal_version_id", activeVersionIds)
        .eq("status", "tallied")
    : { data: [], error: null };
  if (voteSessions.error) return jsonError(500, "Supabase error", voteSessions.error.message, voteSessions.error.code);

  const proposalToMeeting = new Map((proposals.data || []).map((p) => [p.id, p.meeting_id]));
  const versionToProposal = new Map((activeVersions.data || []).map((v) => [v.id, v.proposal_id]));
  const summaryByMeeting = new Map<string, { passedCount: number; failedCount: number }>();

  for (const voteSession of voteSessions.data || []) {
    const proposalId = versionToProposal.get(voteSession.proposal_version_id);
    const meetingId = proposalId ? proposalToMeeting.get(proposalId) : null;
    if (!meetingId) continue;
    const current = summaryByMeeting.get(meetingId) || { passedCount: 0, failedCount: 0 };
    if (voteSession.passed === true) current.passedCount += 1;
    if (voteSession.passed === false) current.failedCount += 1;
    summaryByMeeting.set(meetingId, current);
  }

  const rows = filteredMeetings
    .map((meeting) => {
      const summary = summaryByMeeting.get(meeting.id) || { passedCount: 0, failedCount: 0 };
      return { ...meeting, ...summary };
    })
    .filter((meeting) => {
      if (outcomeFilter === "passed") return meeting.passedCount > 0;
      if (outcomeFilter === "failed") return meeting.failedCount > 0;
      return true;
    });

  return Response.json(rows);
}

