import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const sb = getSupabaseServer();
  const { data } = await sb
    .from("owners")
    .select("id, team_name, display_name, role")
    .order("team_name");
  return NextResponse.json(data || []);
}
