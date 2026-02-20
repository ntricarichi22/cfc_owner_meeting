import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposalId = req.nextUrl.searchParams.get("proposalId");
  if (!proposalId) {
    return NextResponse.json({ error: "proposalId query parameter is required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("proposal_versions")
    .select("*")
    .eq("proposal_id", proposalId)
    .eq("is_active", true)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch active version" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "No active version found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
