import { NextRequest, NextResponse } from "next/server";
import { jsonError, getCurrentTeamSession, isCommissionerTeam } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");
  if (!isCommissionerTeam(auth.session.team_name)) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const body = await req.json().catch(() => null);
  const slideIndex = body?.slide_index;
  if (typeof slideIndex !== "number" || !Number.isFinite(slideIndex) || slideIndex < 0) {
    return jsonError(400, "slide_index must be a non-negative number");
  }

  const sb = getSupabaseServer();
  const { error } = await sb
    .from("meetings")
    .update({ current_slide_index: slideIndex })
    .eq("id", meetingId);

  if (error) return jsonError(500, "Supabase error", error.message, error.code);

  return NextResponse.json({ ok: true });
}
