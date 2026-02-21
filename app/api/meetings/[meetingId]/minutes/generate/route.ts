import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireCommissionerAuth } from "@/lib/voting";

export async function POST(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const sb = getSupabaseServer();

  const meeting = await sb.from("meetings").select("id, year, title").eq("id", meetingId).maybeSingle();
  if (meeting.error) return jsonError(500, "Supabase error", meeting.error.message, meeting.error.code);
  if (!meeting.data) return jsonError(404, "Meeting not found");

  const [agendaItemsRes, proposalsRes, versionsRes, voteSessionsRes] = await Promise.all([
    sb.from("agenda_items").select("id, title, category, order_index").eq("meeting_id", meetingId).order("order_index"),
    sb.from("proposals").select("id, meeting_id, agenda_item_id, title, effective_date").eq("meeting_id", meetingId),
    sb.from("proposal_versions").select("id, proposal_id, version_number, full_text, is_active"),
    sb
      .from("proposal_vote_sessions")
      .select("proposal_id, proposal_version_id, status, opened_at, closed_at, tallied_at, yes_count, no_count, abstain_count, total_count, passed")
      .eq("meeting_id", meetingId),
  ]);

  if (agendaItemsRes.error) return jsonError(500, "Supabase error", agendaItemsRes.error.message, agendaItemsRes.error.code);
  if (proposalsRes.error) return jsonError(500, "Supabase error", proposalsRes.error.message, proposalsRes.error.code);
  if (versionsRes.error) return jsonError(500, "Supabase error", versionsRes.error.message, versionsRes.error.code);
  if (voteSessionsRes.error) return jsonError(500, "Supabase error", voteSessionsRes.error.message, voteSessionsRes.error.code);

  const talliedVersionIds = (voteSessionsRes.data || [])
    .filter((s) => s.status === "tallied")
    .map((s) => s.proposal_version_id);
  const rollCalls = talliedVersionIds.length
    ? await sb.from("votes").select("proposal_version_id, team_id, team_name, vote").in("proposal_version_id", talliedVersionIds).order("team_name")
    : { data: [], error: null };
  if (rollCalls.error) return jsonError(500, "Supabase error", rollCalls.error.message, rollCalls.error.code);

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
    const voteSession = (voteSessionsRes.data || []).find((v) => v.proposal_id === proposal.id);

    markdown += `\n### ${proposal.title}\n`;
    if (proposal.effective_date) markdown += `- Effective date: ${proposal.effective_date}\n`;
    if (activeVersion) {
      markdown += `- Active version: v${activeVersion.version_number}\n\n`;
      markdown += `${activeVersion.full_text}\n\n`;
    }

    if (voteSession?.status === "tallied") {
      markdown += `- Vote result: ${voteSession.passed ? "PASSED" : "FAILED"}\n`;
      markdown += `- Totals: YES ${voteSession.yes_count}, NO ${voteSession.no_count}, ABSTAIN ${voteSession.abstain_count}, TOTAL ${voteSession.total_count}\n`;
      if (voteSession.opened_at) markdown += `- Voting opened: ${voteSession.opened_at}\n`;
      if (voteSession.closed_at) markdown += `- Voting closed: ${voteSession.closed_at}\n`;
      if (voteSession.tallied_at) markdown += `- Voting tallied: ${voteSession.tallied_at}\n`;
      markdown += `- Roll call:\n`;
      for (const vote of (rollCalls.data || []).filter((r) => r.proposal_version_id === voteSession.proposal_version_id)) {
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
  if (upsert.error) return jsonError(500, "Supabase error", upsert.error.message, upsert.error.code);

  return Response.json(upsert.data);
}
