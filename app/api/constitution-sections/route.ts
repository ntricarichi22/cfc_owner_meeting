import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("constitution_sections")
    .select("id, section_key, title")
    .order("section_key");
  if (error) return NextResponse.json({ error: "Failed to fetch constitution sections" }, { status: 500 });

  return NextResponse.json(data || []);
}
