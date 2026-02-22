import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const SESSION_TTL_MS = 60_000; // 60 seconds

export async function GET() {
  const sb = getSupabaseServer();
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();

  const { data, error } = await sb
    .from("team_sessions")
    .select("team_id")
    .gte("last_seen_at", cutoff);

  if (error) {
    return NextResponse.json([], { status: 200 });
  }

  const claimedIds = (data ?? []).map((r: { team_id: string }) => r.team_id);
  return NextResponse.json(claimedIds);
}
