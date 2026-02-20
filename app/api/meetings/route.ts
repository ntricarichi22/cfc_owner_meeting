import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json([]);

  const sb = getSupabaseServer();
  const { data } = await sb
    .from("meetings")
    .select("id, club_year, status, meeting_date")
    .eq("league_id", session.league_id)
    .order("club_year", { ascending: false });
  return NextResponse.json(data || []);
}
