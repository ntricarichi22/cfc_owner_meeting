import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const projectRef = url.replace(/^https?:\/\//, "").split(".")[0] || null;
  let hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (hasServiceRole) {
    const sb = getSupabaseServer();
    const probe = await sb.from("meetings").select("id", { count: "exact", head: true }).limit(1);
    if (probe.error) hasServiceRole = false;
  }
  return NextResponse.json({ ok: true, projectRef, hasServiceRole });
}
