import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireCommissionerAuth } from "@/lib/voting";
import {
  assignUtterancesToSlides,
  buildSlideWindowsFromAudit,
  generateDiscussionSummary,
  mergeDiscussionSummaries,
  parseTranscript,
  stripHtmlServer,
  type DiscussionSummary,
  type SlideContext,
} from "@/lib/transcript";

interface ProposalRow {
  id: string;
  title: string;
  order_index: number | null;
  proposal_type: string | null;
  summary: string | null;
  created_at: string;
}

interface VoteSessionRow {
  proposal_id: string;
  proposal_version_id: string;
  status: string | null;
  yes_count: number | null;
  no_count: number | null;
  total_count: number | null;
  passed: boolean | null;
}

/**
 * Generate per-slide discussion summaries from the uploaded Teams transcript.
 *
 * - Reads transcript text from meeting_minutes.minutes_markdown.
 * - Parses utterances + recording window.
 * - Builds slide windows from audit_events (filtered to recording window ± 5 min).
 * - Assigns utterances to slides (timestamp first, then semantic fallback).
 * - Generates a discussion summary per slide (OpenAI if configured, else heuristic).
 * - Persists the result under meeting_minutes.checklist_markdown JSON key
 *   `discussion_summaries`, preserving `slide_notes` and `commissioner_notes`.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const auth = await requireCommissionerAuth().catch(() => null);
  if (!auth) return jsonError(403, "Forbidden");

  const { meetingId } = await params;
  const sb = getSupabaseServer();

  const minutesRes = await sb
    .from("meeting_minutes")
    .select("minutes_markdown, checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (minutesRes.error) {
    console.error("[discussion-summaries] meeting_minutes query failed:", minutesRes.error.code, minutesRes.error.message);
    return jsonError(500, "Supabase error", minutesRes.error.message, minutesRes.error.code);
  }
  const transcriptRaw = minutesRes.data?.minutes_markdown ?? "";
  if (!transcriptRaw.trim()) {
    return jsonError(400, "No transcript uploaded for this meeting");
  }

  const proposalsRes = await sb
    .from("proposals")
    .select("id, title, order_index, proposal_type, summary, created_at")
    .eq("meeting_id", meetingId)
    .order("order_index")
    .order("created_at");
  if (proposalsRes.error) {
    console.error("[discussion-summaries] proposals query failed:", proposalsRes.error.code, proposalsRes.error.message);
    return jsonError(500, "Supabase error", proposalsRes.error.message, proposalsRes.error.code);
  }
  const proposals = (proposalsRes.data || []) as ProposalRow[];
  if (proposals.length === 0) return Response.json({ ok: true, summaries: {} });

  const voteSessionsRes = await sb
    .from("proposal_vote_sessions")
    .select("proposal_id, proposal_version_id, status, yes_count, no_count, total_count, passed")
    .in("proposal_id", proposals.map((p) => p.id));
  const voteSessions: VoteSessionRow[] = voteSessionsRes.error ? [] : (voteSessionsRes.data || []) as VoteSessionRow[];

  const parsed = parseTranscript(transcriptRaw);
  const proposalIdsByOrder = proposals.map((p) => p.id);
  const windows = await buildSlideWindowsFromAudit({
    meetingId,
    proposalIdsByOrder,
    recordingStartMs: parsed.recordingStartMs,
    recordingEndMs: parsed.recordingEndMs,
  });

  const slides: SlideContext[] = proposals.map((p, idx) => {
    const vs = voteSessions.find((v) => v.proposal_id === p.id);
    const voteSummary = vs && vs.status === "tallied"
      ? `${vs.passed ? "PASSED" : "FAILED"} (YES ${vs.yes_count ?? 0}, NO ${vs.no_count ?? 0}, TOTAL ${vs.total_count ?? 0})`
      : null;
    return {
      proposalId: p.id,
      orderIndex: p.order_index ?? idx,
      slideIndex: idx + 1, // 0 = title slide
      title: p.title,
      category: p.proposal_type ?? "proposal",
      contextText: stripHtmlServer(p.summary ?? ""),
      voteSummary,
    };
  });

  const { utterancesByProposal } = assignUtterancesToSlides(parsed, slides, windows);

  const summaries: Record<string, DiscussionSummary> = {};
  for (const slide of slides) {
    const utterances = utterancesByProposal.get(slide.proposalId) ?? [];
    summaries[slide.proposalId] = await generateDiscussionSummary(slide, utterances);
  }

  const newChecklist = mergeDiscussionSummaries(minutesRes.data?.checklist_markdown ?? "", summaries);
  const upsertRes = await sb
    .from("meeting_minutes")
    .upsert({ meeting_id: meetingId, checklist_markdown: newChecklist }, { onConflict: "meeting_id" });
  if (upsertRes.error) {
    console.error("[discussion-summaries] checklist upsert failed:", upsertRes.error.code, upsertRes.error.message);
    return jsonError(500, "Supabase error", upsertRes.error.message, upsertRes.error.code);
  }

  return Response.json({
    ok: true,
    count: Object.keys(summaries).length,
    recording_window: {
      start_ms: parsed.recordingStartMs,
      end_ms: parsed.recordingEndMs,
    },
    utterance_count: parsed.utterances.length,
  });
}
