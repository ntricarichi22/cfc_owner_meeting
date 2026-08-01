import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireCommissionerAuth } from "@/lib/voting";
import {
  generateRecommendations,
  readStoredRecommendations,
  saveRecommendations,
  type ConstitutionRecommendations,
} from "@/lib/recommendations";

// Generation calls an LLM per passed proposal; allow up to 5 minutes.
export const maxDuration = 300;

/** GET — return the stored recommendations (or null when none generated yet). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meeting_minutes")
    .select("checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) return jsonError(500, "Supabase error", error.message, error.code);
  return Response.json({ recommendations: readStoredRecommendations(data?.checklist_markdown) });
}

/** POST — (re)generate recommendations from passed proposals. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const result = await generateRecommendations(meetingId);
  if (!result.ok) {
    const status = result.error.startsWith("Supabase") ? 500 : 400;
    return jsonError(status, result.error);
  }
  return Response.json({ recommendations: result.recommendations });
}

/** PATCH — save commissioner edits to the recommendations. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const body = await req.json().catch(() => null);
  const recommendations = body?.recommendations as ConstitutionRecommendations | undefined;
  if (!recommendations || !Array.isArray(recommendations.items)) {
    return jsonError(400, "recommendations payload is required");
  }
  const saveError = await saveRecommendations(meetingId, recommendations);
  if (saveError) return jsonError(500, "Supabase error", saveError);
  return Response.json({ ok: true });
}
