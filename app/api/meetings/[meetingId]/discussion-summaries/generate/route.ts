import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCommissionerAuth } from "@/lib/voting";
import { generateAndStoreSummaries } from "@/lib/transcript";

// Summary generation makes multiple LLM calls; allow up to 5 minutes.
export const maxDuration = 300;

/**
 * Generate per-slide discussion summaries from the uploaded transcript.
 * Re-runnable: replaces any previously generated summaries while preserving
 * slide notes and commissioner notes.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const result = await generateAndStoreSummaries(meetingId);
  if (!result.ok) {
    const status = result.error?.startsWith("Supabase") ? 500 : 400;
    return jsonError(status, result.error || "Summary generation failed");
  }
  return Response.json(result);
}
