import { NextResponse } from "next/server";
import { getCurrentTeamSession, jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const auth = await getCurrentTeamSession().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meetings")
    .select("*")
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return jsonError(500, "Supabase error", error.message, error.code);
  }

  if (!data) {
    return jsonError(404, "No live meeting");
  }

  return NextResponse.json(data);
}
