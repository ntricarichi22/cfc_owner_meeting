import { NextRequest } from "next/server";
import mammoth from "mammoth";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { insertAuditEvent, requireCommissionerAuth } from "@/lib/voting";
import { TRANSCRIPT_MARKDOWN_HEADING } from "@/lib/constants";
import { generateAndStoreSummaries } from "@/lib/transcript";

// Upload + summary regeneration can take a while with an LLM configured.
export const maxDuration = 300;

/** Strip WebVTT framing (header, cue ids, timestamp lines, voice tags) to plain text. */
function vttToPlainText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "WEBVTT" || trimmed.startsWith("NOTE")) return false;
      if (/^\d+$/.test(trimmed)) return false; // cue ids
      if (/-->/.test(trimmed)) return false; // timestamp lines
      return true;
    })
    .map((line) => line.replace(/<v\s+([^>]+)>/gi, "$1: ").replace(/<[^>]+>/g, ""))
    .join("\n");
}

/**
 * GET — report whether a transcript exists for this meeting.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("meeting_minutes")
    .select("minutes_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) return jsonError(500, "Supabase error", error.message, error.code);
  const transcript = data?.minutes_markdown ?? "";
  return Response.json({
    has_transcript: !!transcript.trim(),
    length: transcript.length,
  });
}

/**
 * POST — upload (or replace) the meeting transcript after the fact.
 * Accepts .docx, .txt, or .vtt via multipart form-data (field: "transcript").
 * Stores plain text in meeting_minutes.minutes_markdown, preserving the
 * checklist (notes/summaries), then regenerates discussion summaries.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError(400, "Invalid form data");
  }

  const file = formData.get("transcript");
  if (!file || !(file instanceof Blob)) {
    return jsonError(400, "transcript file is required");
  }

  const filename = (file instanceof File ? file.name : "") || "";
  const lower = filename.toLowerCase();

  let transcriptText = "";
  try {
    if (lower.endsWith(".docx") || file.type.includes("officedocument.wordprocessingml")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      transcriptText = result.value.trim();
    } else {
      const raw = (await file.text()).trim();
      transcriptText = lower.endsWith(".vtt") || raw.startsWith("WEBVTT") ? vttToPlainText(raw).trim() : raw;
    }
  } catch {
    return jsonError(400, "Failed to read transcript file. Upload a .docx, .txt, or .vtt file.");
  }

  if (!transcriptText) {
    return jsonError(400, "The transcript file appears to be empty.");
  }

  const sb = getSupabaseServer();

  const meetingRes = await sb
    .from("meetings")
    .select("id, status")
    .eq("id", meetingId)
    .maybeSingle();
  if (meetingRes.error) return jsonError(500, "Supabase error", meetingRes.error.message, meetingRes.error.code);
  if (!meetingRes.data) return jsonError(404, "Meeting not found");

  const minutesMarkdown = `${TRANSCRIPT_MARKDOWN_HEADING}\n\n${transcriptText}`;
  const upsertRes = await sb
    .from("meeting_minutes")
    .upsert({ meeting_id: meetingId, minutes_markdown: minutesMarkdown }, { onConflict: "meeting_id" });
  if (upsertRes.error) return jsonError(500, "Supabase error", upsertRes.error.message, upsertRes.error.code);

  await insertAuditEvent(meetingId, null, "transcript_uploaded", {
    team: auth.teamSession.team_name,
    filename,
    length: transcriptText.length,
  }).catch((err) => console.warn("[transcript] audit event failed:", err));

  // Regenerate summaries inline so the page can refresh with fresh data.
  const generation = await generateAndStoreSummaries(meetingId);

  return Response.json({ ok: true, meetingId, transcript_length: transcriptText.length, generation });
}
