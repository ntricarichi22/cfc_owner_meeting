import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";

export function jsonError(status: number, error: string, details?: string, code?: string) {
  return Response.json({ error, ...(details ? { details } : {}), ...(code ? { code } : {}) }, { status });
}

export async function getCurrentTeamSession() {
  const session = await getSession();
  if (!session) return null;

  const sb = getSupabaseServer();
  const byId = await sb
    .from("team_sessions")
    .select("team_id, team_name")
    .eq("team_id", session.owner_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byId.error) {
    throw byId.error;
  }

  if (byId.data) {
    return { session, teamSession: byId.data };
  }

  const byName = await sb
    .from("team_sessions")
    .select("team_id, team_name")
    .eq("team_name", session.team_name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byName.error) {
    throw byName.error;
  }

  if (!byName.data) return null;
  return { session, teamSession: byName.data };
}

export function isCommissionerTeam(teamName: string | null | undefined) {
  return teamName === COMMISSIONER_TEAM_NAME;
}
