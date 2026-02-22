import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (session?.session_id) {
    const sb = getSupabaseServer();
    await sb
      .from("team_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session.session_id);
  }
  return NextResponse.json({ ok: true });
}
