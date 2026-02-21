import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireCommissionerAuth, requireTeamAuth } from "@/lib/voting";

export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireTeamAuth().catch(() => null);
  if (!auth) return jsonError(401, "Unauthorized");

  const { meetingId } = await params;
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meeting_minutes")
    .select("*")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) return jsonError(500, "Supabase error", error.message, error.code);
  return Response.json(data || { meeting_id: meetingId, minutes_markdown: "", checklist_markdown: "" });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const body = await req.json().catch(() => ({}));
  const updates: { checklist_markdown?: string; minutes_markdown?: string } = {};
  if (typeof body.checklist_markdown === "string") updates.checklist_markdown = body.checklist_markdown;
  if (typeof body.minutes_markdown === "string") updates.minutes_markdown = body.minutes_markdown;
  if (!Object.keys(updates).length) return jsonError(400, "No valid fields to update");

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meeting_minutes")
    .upsert({ meeting_id: meetingId, ...updates }, { onConflict: "meeting_id" })
    .select("*")
    .maybeSingle();
  if (error) return jsonError(500, "Supabase error", error.message, error.code);
  return Response.json(data);
}

