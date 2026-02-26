import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { insertAuditEvent, requireTeamAuth } from "@/lib/voting";

export async function POST(req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireTeamAuth().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const { meetingId } = await params;
  const body = await req.json().catch(() => ({}));
  const { event_type, payload } = body;
  if (typeof event_type !== "string" || !event_type) return jsonError(400, "event_type is required");

  await insertAuditEvent(meetingId, body.proposal_id || null, event_type, {
    ...(typeof payload === "object" && payload !== null ? payload : {}),
    team: auth.teamSession.team_name,
  });

  return Response.json({ ok: true });
}
