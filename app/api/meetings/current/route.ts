import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meetings")
    .select("*")
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Supabase error", details: error.message, code: error.code }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "No active meeting" }, { status: 404 });
  }

  return NextResponse.json(data);
}
