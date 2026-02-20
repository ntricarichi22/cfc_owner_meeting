import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agendaItemId = req.nextUrl.searchParams.get("agendaItemId");
  if (!agendaItemId) {
    return NextResponse.json({ error: "agendaItemId query parameter is required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("proposals")
    .select("*, proposal_versions(*)")
    .eq("agenda_item_id", agendaItemId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch proposal" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
