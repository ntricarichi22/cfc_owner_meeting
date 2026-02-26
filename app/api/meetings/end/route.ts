import { NextRequest } from "next/server";
import mammoth from "mammoth";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { insertAuditEvent, requireCommissionerAuth } from "@/lib/voting";
import { TRANSCRIPT_MARKDOWN_HEADING } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError(400, "Invalid form data");
  }

  const transcriptFile = formData.get("transcript");
  if (!transcriptFile || !(transcriptFile instanceof Blob)) {
    return jsonError(400, "transcript file is required");
  }

  const meetingId = formData.get("meetingId");
  if (!meetingId || typeof meetingId !== "string") {
    return jsonError(400, "meetingId is required");
  }

  // Convert .docx transcript to plain text using mammoth
  const buffer = Buffer.from(await transcriptFile.arrayBuffer());
  let transcriptText = "";
  try {
    const result = await mammoth.extractRawText({ buffer });
    transcriptText = result.value.trim();
  } catch {
    return jsonError(400, "Failed to read transcript file. Please upload a valid .docx file.");
  }

  const sb = getSupabaseServer();

  // Verify the meeting exists and belongs to this finalization request
  const meetingRes = await sb
    .from("meetings")
    .select("id, status, locked")
    .eq("id", meetingId)
    .maybeSingle();
  if (meetingRes.error) {
    console.error("[end] meetings lookup failed:", meetingRes.error.code, meetingRes.error.message);
    return jsonError(500, "Supabase error", meetingRes.error.message, meetingRes.error.code);
  }
  if (!meetingRes.data) return jsonError(404, "Meeting not found");
  if (meetingRes.data.locked) return jsonError(409, "Meeting is already locked");

  const now = new Date().toISOString();

  // Lock the meeting — only write fields that exist and pass the DB check constraint.
  // Do NOT set status; the live DB constraint only allows 'draft' and 'live'.
  const updateRes = await sb
    .from("meetings")
    .update({ locked: true })
    .eq("id", meetingId);
  if (updateRes.error) {
    console.error("[end] meetings update failed:", updateRes.error.code, updateRes.error.message);
    return jsonError(500, "Supabase error", updateRes.error.message, updateRes.error.code);
  }

  // Store transcript in meeting_minutes — finalized_at & finalized_by_team exist here (pr4_voting_minutes.sql)
  const minutesMarkdown = `${TRANSCRIPT_MARKDOWN_HEADING}\n\n${transcriptText}`;
  const minutesRes = await sb
    .from("meeting_minutes")
    .upsert(
      {
        meeting_id: meetingId,
        minutes_markdown: minutesMarkdown,
        finalized_at: now,
        finalized_by_team: auth.teamSession.team_name,
      },
      { onConflict: "meeting_id" }
    );
  if (minutesRes.error) {
    console.error("[end] meeting_minutes upsert failed:", minutesRes.error.code, minutesRes.error.message);
    return jsonError(500, "Supabase error", minutesRes.error.message, minutesRes.error.code);
  }

  // Audit event
  await insertAuditEvent(meetingId, null, "meeting_ended", {
    team: auth.teamSession.team_name,
    finalized_at: now,
  });

  return Response.json({ ok: true, meetingId });
}
