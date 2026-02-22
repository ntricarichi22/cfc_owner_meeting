import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import ImportForm from "./ImportForm";

export default async function ConstitutionImportPage() {
  const session = await getSession();

  // No valid cookie → redirect to home
  if (!session || !session.session_id) {
    redirect("/");
  }

  // Verify the session row still exists in team_sessions
  const sb = getSupabaseServer();
  const { data: row } = await sb
    .from("team_sessions")
    .select("id, team_name")
    .eq("id", session.session_id)
    .maybeSingle();

  if (!row) {
    redirect("/");
  }

  // Only the commissioner team may use the importer
  if (row.team_name !== COMMISSIONER_TEAM_NAME) {
    redirect("/constitution");
  }

  return <ImportForm teamName={row.team_name} isCommissioner />;
}
