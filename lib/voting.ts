import { getSupabaseServer } from "@/lib/supabase-server";
import { getCurrentTeamSession, isCommissionerTeam } from "@/lib/api";

export function normalizeVote(input: string) {
  const normalized = input.trim().toLowerCase();
  if (normalized === "yes" || normalized === "no") return normalized;
  return null;
}

export async function requireTeamAuth() {
  return getCurrentTeamSession();
}

export async function requireCommissionerAuth() {
  const auth = await getCurrentTeamSession();
  if (!auth || !isCommissionerTeam(auth.teamSession.team_name)) return null;
  return auth;
}

export async function getProposalVersionContext(proposalVersionId: string) {
  const sb = getSupabaseServer();

  const version = await sb
    .from("proposal_versions")
    .select("id, proposal_id, is_active")
    .eq("id", proposalVersionId)
    .maybeSingle();
  if (version.error) throw version.error;
  if (!version.data) return null;

  const proposal = await sb
    .from("proposals")
    .select("id, meeting_id")
    .eq("id", version.data.proposal_id)
    .maybeSingle();
  if (proposal.error) throw proposal.error;
  if (!proposal.data) return null;

  const meeting = await sb
    .from("meetings")
    .select("id, locked")
    .eq("id", proposal.data.meeting_id)
    .maybeSingle();
  if (meeting.error) throw meeting.error;
  if (!meeting.data) return null;

  return { version: version.data, proposal: proposal.data, meeting: meeting.data };
}

export async function insertAuditEvent(meetingId: string, proposalId: string | null, eventType: string, payload: Record<string, unknown>) {
  const sb = getSupabaseServer();
  const { error } = await sb.from("audit_events").insert({
    meeting_id: meetingId,
    proposal_id: proposalId,
    event_type: eventType,
    payload_json: payload,
  });
  if (error) throw error;
}
