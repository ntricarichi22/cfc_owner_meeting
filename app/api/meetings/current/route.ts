import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meetings")
    .select("*")
    .eq("league_id", session.league_id)
    .eq("status", "live")
    .order("club_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch meeting" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "No live meeting found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
