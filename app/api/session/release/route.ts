import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { clearSession, getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (session?.session_id) {
    const sb = getSupabaseServer();
    await sb.from("team_sessions").delete().eq("id", session.session_id);
  } else if (session?.owner_id) {
    const sb = getSupabaseServer();
    await sb.from("team_sessions").delete().eq("team_id", session.owner_id);
  }
  await clearSession();
  return NextResponse.json({ ok: true });
}
