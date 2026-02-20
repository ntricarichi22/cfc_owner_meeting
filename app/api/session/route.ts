import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase-server";
import { setSessionCookie, clearSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { team_name } = await req.json();
  if (!team_name) {
    return NextResponse.json({ error: "team_name required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data: owner, error } = await sb
    .from("owners")
    .select("id, league_id, team_name, role, display_name")
    .eq("team_name", team_name)
    .single();

  if (error || !owner) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Create a team_sessions row
  const { data: session, error: sessionError } = await sb
    .from("team_sessions")
    .insert({ team_id: owner.id, team_name: owner.team_name })
    .select("id")
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Set the cfc_team_session httpOnly cookie with the session id
  const cookieStore = await cookies();
  cookieStore.set("cfc_team_session", session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  await setSessionCookie({
    owner_id: owner.id,
    team_name: owner.team_name,
    role: owner.role,
    league_id: owner.league_id,
  });

  return NextResponse.json({
    owner_id: owner.id,
    team_name: owner.team_name,
    display_name: owner.display_name,
    role: owner.role,
    league_id: owner.league_id,
  });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
