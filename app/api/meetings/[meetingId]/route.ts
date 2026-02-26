import { NextRequest } from "next/server";
import { jsonError, getCurrentTeamSession } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const { meetingId } = await params;
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meetings")
    .select("id, year, title, status, locked, ended_at, finalized_at")
    .eq("id", meetingId)
    .maybeSingle();
  if (error) return jsonError(500, "Supabase error", error.message, error.code);
  if (!data) return jsonError(404, "Meeting not found");
  return Response.json(data);
}
