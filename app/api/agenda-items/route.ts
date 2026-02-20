import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId query parameter is required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("agenda_items")
    .select("*, proposals(*)")
    .eq("meeting_id", meetingId)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch agenda items" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
