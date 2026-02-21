import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { insertAuditEvent, requireCommissionerAuth } from "@/lib/voting";

export async function POST(req: NextRequest) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { locked } = await req.json().catch(() => ({}));
  if (typeof locked !== "boolean") return jsonError(400, "locked boolean is required");

  const sb = getSupabaseServer();
  const meeting = await sb.from("meetings").select("id").eq("status", "live").maybeSingle();
  if (meeting.error) return jsonError(500, "Supabase error", meeting.error.message, meeting.error.code);
  if (!meeting.data) return jsonError(404, "No live meeting");

  const update = await sb.from("meetings").update({ locked }).eq("id", meeting.data.id);
  if (update.error) return jsonError(500, "Supabase error", update.error.message, update.error.code);

  await insertAuditEvent(
    meeting.data.id,
    null,
    locked ? "meeting_locked" : "meeting_unlocked",
    { locked, team: auth.teamSession.team_name }
  );
  return Response.json({ ok: true, locked });
}

