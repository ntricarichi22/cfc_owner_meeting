import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MeetingPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("cfc_team_session");

  if (!sessionCookie?.value || !UUID_RE.test(sessionCookie.value)) {
    redirect("/");
  }

  const sb = getSupabaseServer();
  const { data: session } = await sb
    .from("team_sessions")
    .select("team_name")
    .eq("id", sessionCookie.value)
    .single();

  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <h1 className="text-4xl font-bold">Welcome, {session.team_name}</h1>
    </main>
  );
}
