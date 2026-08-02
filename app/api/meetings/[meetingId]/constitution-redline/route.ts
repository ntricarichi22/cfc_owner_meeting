import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireCommissionerAuth } from "@/lib/voting";
import { readStoredRecommendations } from "@/lib/recommendations";
import { applyTrackedChangesToDocx, type DocxAmendment } from "@/lib/redline-docx";

export const maxDuration = 60;

/**
 * POST — upload the league's original constitution .docx and receive it back
 * with the approved amendments applied as Word tracked changes, plus a
 * comment on each amended section explaining the change. Original formatting
 * is preserved: only amended text is touched.
 *
 * Multipart form-data, field "document". Uses the saved constitution
 * recommendations (generate/edit them first on the Constitution Updates page).
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
  const file = formData.get("document");
  if (!file || !(file instanceof Blob)) {
    return jsonError(400, "document file is required (.docx)");
  }

  const sb = getSupabaseServer();
  const minutesRes = await sb
    .from("meeting_minutes")
    .select("checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (minutesRes.error) return jsonError(500, "Supabase error", minutesRes.error.message);
  const recommendations = readStoredRecommendations(minutesRes.data?.checklist_markdown);
  if (!recommendations || recommendations.items.length === 0) {
    return jsonError(400, "No constitution recommendations saved. Generate them first, then upload the doc.");
  }

  const meetingRes = await sb
    .from("meetings")
    .select("title, year")
    .eq("id", meetingId)
    .maybeSingle();
  const year = meetingRes.data?.year ?? new Date().getFullYear();

  const amendments: DocxAmendment[] = [];
  for (const item of recommendations.items) {
    for (const sec of item.sections) {
      if (!sec.current_body.trim() || !sec.recommended_body.trim()) continue;
      if (sec.current_body.trim() === sec.recommended_body.trim()) continue;
      amendments.push({
        label: `${item.title} → ${sec.label}`,
        oldBody: sec.current_body,
        newBody: sec.recommended_body,
        commentLines: [
          `Amendment: ${item.title} (${item.vote})`,
          ...(item.effective_date ? [`Effective: ${item.effective_date}`] : []),
          ...(item.change_summary ? [`Change: ${item.change_summary}`] : []),
          ...(item.commissioner_notes ? [`Commissioner notes: ${item.commissioner_notes}`] : []),
        ],
      });
    }
  }
  if (amendments.length === 0) {
    return jsonError(400, "No amendments with recommended text to apply. Fill in recommended text first.");
  }

  let result;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    result = await applyTrackedChangesToDocx(input, amendments);
  } catch (err) {
    console.error("[redline] docx processing failed:", err);
    return jsonError(400, "Could not process the uploaded file. Make sure it is the constitution .docx.");
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="CFC-Constitution-Redline-${year}.docx"`,
      "X-Redline-Applied": String(result.applied.length),
      "X-Redline-Warnings": encodeURIComponent(JSON.stringify(result.warnings)),
    },
  });
}
