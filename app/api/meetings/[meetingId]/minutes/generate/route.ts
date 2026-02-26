import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireCommissionerAuth } from "@/lib/voting";
import type { Vote } from "@/lib/types";

export async function POST(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const sb = getSupabaseServer();

  const meeting = await sb.from("meetings").select("id, year, title").eq("id", meetingId).maybeSingle();
  if (meeting.error) {
    console.error("[generate] meetings query failed:", meeting.error.code, meeting.error.message);
    return jsonError(500, "Supabase error", meeting.error.message, meeting.error.code);
  }
  if (!meeting.data) return jsonError(404, "Meeting not found");

  const [agendaItemsRes, proposalsRes, versionsRes, voteSessionsRes] = await Promise.all([
    sb.from("agenda_items").select("id, title, category, order_index").eq("meeting_id", meetingId).order("order_index"),
    sb.from("proposals").select("id, meeting_id, agenda_item_id, title, effective_date").eq("meeting_id", meetingId),
    sb.from("proposal_versions").select("id, proposal_id, version_number, full_text, is_active"),
    sb
      .from("proposal_vote_sessions")
      .select("proposal_id, proposal_version_id, status, opened_at, closed_at, tallied_at, yes_count, no_count, total_count, passed")
      .eq("meeting_id", meetingId),
  ]);

  if (agendaItemsRes.error) {
    console.error("[generate] agenda_items query failed:", agendaItemsRes.error.code, agendaItemsRes.error.message);
    return jsonError(500, "Supabase error", agendaItemsRes.error.message, agendaItemsRes.error.code);
  }
  if (proposalsRes.error) {
    console.error("[generate] proposals query failed:", proposalsRes.error.code, proposalsRes.error.message);
    return jsonError(500, "Supabase error", proposalsRes.error.message, proposalsRes.error.code);
  }
  if (versionsRes.error) {
    console.error("[generate] proposal_versions query failed:", versionsRes.error.code, versionsRes.error.message);
    return jsonError(500, "Supabase error", versionsRes.error.message, versionsRes.error.code);
  }
  // proposal_vote_sessions may not exist if the pr4_voting_minutes.sql migration (adds the table) hasn't been applied — non-fatal
  if (voteSessionsRes.error) {
    console.error("[generate] proposal_vote_sessions query failed (continuing without tallies):", voteSessionsRes.error.code, voteSessionsRes.error.message);
  }

  const voteSessions = voteSessionsRes.error ? [] : (voteSessionsRes.data || []);
  const talliedVersionIds = voteSessions
    .filter((s) => s.status === "tallied")
    .map((s) => s.proposal_version_id);
  let rollCallData: Pick<Vote, "proposal_version_id" | "team_id" | "team_name" | "vote">[] = [];
  if (talliedVersionIds.length) {
    const rollCallsRes = await sb
      .from("votes")
      .select("proposal_version_id, team_id, team_name, vote")
      .in("proposal_version_id", talliedVersionIds)
      .order("team_name");
    if (rollCallsRes.error) {
      console.error("[generate] votes query failed (continuing without roll calls):", rollCallsRes.error.code, rollCallsRes.error.message);
    } else {
      rollCallData = rollCallsRes.data || [];
    }
  }

  const generatedAt = new Date().toISOString();
  let markdown = `# ${meeting.data.title}\n\n`;
  markdown += `- Year: ${meeting.data.year}\n`;
  markdown += `- Generated: ${generatedAt}\n\n`;
  markdown += `## Agenda\n`;

  for (const item of agendaItemsRes.data || []) {
    markdown += `- ${item.order_index}. ${item.title} (${item.category})\n`;
  }

  markdown += "\n## Proposals\n";
  const versionsByProposal = new Map<string, typeof versionsRes.data>();
  for (const version of versionsRes.data || []) {
    const list = versionsByProposal.get(version.proposal_id) || [];
    list.push(version);
    versionsByProposal.set(version.proposal_id, list);
  }

  for (const proposal of proposalsRes.data || []) {
    const proposalVersions = versionsByProposal.get(proposal.id) || [];
    const activeVersion =
      proposalVersions.find((v) => v.is_active) ||
      proposalVersions[0];
    const voteSession = voteSessions.find((v) => v.proposal_id === proposal.id);

    markdown += `\n### ${proposal.title}\n`;
    if (proposal.effective_date) markdown += `- Effective date: ${proposal.effective_date}\n`;
    if (activeVersion) {
      markdown += `- Active version: v${activeVersion.version_number}\n\n`;
      markdown += `${activeVersion.full_text}\n\n`;
    }

    if (voteSession?.status === "tallied") {
      markdown += `- Vote result: ${voteSession.passed ? "PASSED" : "FAILED"}\n`;
      markdown += `- Totals: YES ${voteSession.yes_count}, NO ${voteSession.no_count}, TOTAL ${voteSession.total_count}\n`;
      if (voteSession.opened_at) markdown += `- Voting opened: ${voteSession.opened_at}\n`;
      if (voteSession.closed_at) markdown += `- Voting closed: ${voteSession.closed_at}\n`;
      if (voteSession.tallied_at) markdown += `- Voting tallied: ${voteSession.tallied_at}\n`;
      markdown += `- Roll call:\n`;
      for (const vote of rollCallData.filter((r) => r.proposal_version_id === voteSession.proposal_version_id)) {
        markdown += `  - ${vote.team_name} (${vote.team_id}): ${String(vote.vote).toUpperCase()}\n`;
      }
    } else {
      markdown += "- Vote result: Not tallied\n";
    }
  }

  const upsert = await sb
    .from("meeting_minutes")
    .upsert({ meeting_id: meetingId, minutes_markdown: markdown }, { onConflict: "meeting_id" })
    .select("*")
    .maybeSingle();
  if (upsert.error) {
    console.error("[generate] meeting_minutes upsert failed:", upsert.error.code, upsert.error.message);
    return jsonError(500, "Supabase error", upsert.error.message, upsert.error.code);
  }

  return Response.json(upsert.data);
}
