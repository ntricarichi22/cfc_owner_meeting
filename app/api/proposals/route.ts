import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getCurrentTeamSession, isCommissionerTeam } from "@/lib/api";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId query parameter is required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("proposals")
    .select("*, proposal_versions(*)")
    .eq("meeting_id", meetingId);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch proposals" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth || !isCommissionerTeam(auth.teamSession.team_name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { proposalId, summary } = await req.json().catch(() => ({}));
  if (!proposalId || typeof summary !== "string") {
    return NextResponse.json({ error: "proposalId and summary are required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { error } = await sb.from("proposals").update({ summary }).eq("id", proposalId);
  if (error) {
    return NextResponse.json({ error: "Failed to update proposal summary" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
