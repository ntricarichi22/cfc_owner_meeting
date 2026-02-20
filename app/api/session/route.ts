import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { setSessionCookie, clearSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { teamId, teamName } = await req.json();
  if (!teamId || !teamName) {
    return NextResponse.json(
      { error: "teamId and teamName required" },
      { status: 400 }
    );
  }

  const sb = getSupabaseServer();

  // Check if this team is already claimed in the last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: checkError } = await sb
    .from("team_sessions")
    .select("id")
    .eq("team_id", teamId)
    .gte("created_at", cutoff)
    .limit(1);

  if (checkError) {
    return NextResponse.json(
      { error: "Failed to check team session" },
      { status: 500 }
    );
  }

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "Team already claimed" },
      { status: 409 }
    );
  }

  // Insert a new team_sessions row
  const { error: insertError } = await sb
    .from("team_sessions")
    .insert({ team_id: teamId, team_name: teamName });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }

  await setSessionCookie({
    owner_id: teamId,
    team_name: teamName,
    role: "owner",
    league_id: "",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
