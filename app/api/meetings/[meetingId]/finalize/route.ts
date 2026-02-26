import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { insertAuditEvent, requireCommissionerAuth } from "@/lib/voting";

export async function POST(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const sb = getSupabaseServer();

  const meetingRes = await sb
    .from("meetings")
    .select("id, status, locked")
    .eq("id", meetingId)
    .maybeSingle();
  if (meetingRes.error) return jsonError(500, "Supabase error", meetingRes.error.message, meetingRes.error.code);
  if (!meetingRes.data) return jsonError(404, "Meeting not found");
  if (meetingRes.data.status === "finalized") return jsonError(409, "Meeting is already finalized");

  const now = new Date().toISOString();
  const updateRes = await sb
    .from("meetings")
    .update({ status: "finalized", finalized_at: now, locked: true })
    .eq("id", meetingId);
  if (updateRes.error) return jsonError(500, "Supabase error", updateRes.error.message, updateRes.error.code);

  await insertAuditEvent(meetingId, null, "meeting_finalized", {
    team: auth.teamSession.team_name,
    finalized_at: now,
  });

  return Response.json({ ok: true, meetingId });
}
