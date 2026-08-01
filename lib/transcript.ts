/**
 * Teams transcript parsing + slide-window matching + per-slide discussion summary generation.
 *
 * This module powers the Minutes Review "Discussion Summary" by mapping the uploaded
 * Teams transcript onto each slide/proposal using audit_events as timing anchors.
 *
 * Notes:
 *  - Schema is unchanged. Generated summaries are persisted inside
 *    `meeting_minutes.checklist_markdown` under the `discussion_summaries` key
 *    alongside the existing `slide_notes` / `commissioner_notes`.
 *  - If `OPENAI_API_KEY` is not set, a deterministic heuristic summary is produced
 *    directly from the matched transcript excerpt so the feature still works.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { TRANSCRIPT_MARKDOWN_HEADING } from "@/lib/constants";
import { callLLM, extractJson, llmProvider } from "@/lib/llm";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface Utterance {
  speaker: string;
  /** Seconds from start of recording. */
  relativeSeconds: number;
  /** Absolute timestamp in ms-since-epoch when recording start is known, else null. */
  absoluteMs: number | null;
  text: string;
}

export interface ParsedTranscript {
  /** Detected recording start (ms since epoch) if parseable from the header. */
  recordingStartMs: number | null;
  /** Inferred recording end based on last utterance, ms since epoch. */
  recordingEndMs: number | null;
  utterances: Utterance[];
}

export interface DiscussionSummary {
  /** Plain-text bullet-point summary (newline-separated lines). */
  summary: string;
  /** Heuristic coverage signal: "high" | "medium" | "low" | "none". */
  confidence: "high" | "medium" | "low" | "none";
  /** Raw transcript excerpt assigned to this slide (plain text). */
  transcript_excerpt: string;
  /** Generation source: "ai" | "heuristic" | "none". */
  source: "ai" | "heuristic" | "none";
}

export interface SlideContext {
  proposalId: string;
  orderIndex: number;
  slideIndex: number; // index in the meeting carousel (1-based; 0 = title)
  title: string;
  category: string; // "admin" | "proposal" | ...
  /** Optional plain-text context already stripped of HTML. */
  contextText: string;
  /** Optional vote result/roll-call summary string. */
  voteSummary: string | null;
}

interface AuditEventRow {
  proposal_id: string | null;
  event_type: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
}

interface SlideWindow {
  proposalId: string;
  slideIndex: number;
  startMs: number;
  endMs: number;
}

/* ------------------------------------------------------------------ *
 * Transcript parsing
 * ------------------------------------------------------------------ */

const TRANSCRIPT_HEADING_RE = new RegExp(
  `^\\s*${escapeRegExp(TRANSCRIPT_MARKDOWN_HEADING)}\\s*$`,
  "m",
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip our "## Meeting Transcript" heading + leading blank lines, if present. */
export function stripTranscriptHeading(raw: string): string {
  if (!raw) return "";
  return raw.replace(TRANSCRIPT_HEADING_RE, "").replace(/^\s+/, "");
}

/**
 * Attempt to parse a date/time line from the first ~10 non-empty lines of the transcript.
 * Returns ms-since-epoch in America/New_York if no timezone is supplied (per spec).
 *
 * Recognized examples:
 *   "Recording started: 9/15/2025, 7:00:12 PM"
 *   "Started 2025-09-15 19:00"
 *   "September 15, 2025 7:00 PM"
 *   "2025-09-15T19:00:00"
 *   "9/15/2025 7:00 PM"
 */
export function parseRecordingStart(transcript: string): number | null {
  const lines = transcript.split(/\r?\n/).slice(0, 15);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // ISO-ish with explicit timezone or Z — let Date handle it directly.
    const iso = trimmed.match(/\b(\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\b/);
    if (iso) {
      const d = new Date(iso[1].includes("T") ? iso[1] : iso[1].replace(" ", "T"));
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }

    // US-style "M/D/YYYY[,] H:MM[:SS] [AM|PM]"
    const us = trimmed.match(
      /\b(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/,
    );
    if (us) {
      const [, mm, dd, yyyy, h, mi, ss, ap] = us;
      const ms = buildEasternMs(
        Number(yyyy), Number(mm), Number(dd),
        applyAmPm(Number(h), ap), Number(mi), ss ? Number(ss) : 0,
      );
      if (ms != null) return ms;
    }

    // "Month Day, Year H:MM [AM|PM]"
    const long = trimmed.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})(?:[,\s]+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/,
    );
    if (long) {
      const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
      const monthIdx = months.indexOf(long[1].toLowerCase()) + 1;
      const ms = buildEasternMs(
        Number(long[3]), monthIdx, Number(long[2]),
        long[4] ? applyAmPm(Number(long[4]), long[7]) : 12,
        long[5] ? Number(long[5]) : 0,
        long[6] ? Number(long[6]) : 0,
      );
      if (ms != null) return ms;
    }
  }
  return null;
}

function applyAmPm(hour: number, ap?: string): number {
  if (!ap) return hour;
  const lower = ap.toLowerCase();
  if (lower === "pm" && hour < 12) return hour + 12;
  if (lower === "am" && hour === 12) return 0;
  return hour;
}

/**
 * Build a ms-since-epoch from local America/New_York wall-clock components.
 * Uses Intl to determine the correct EST/EDT offset for that instant
 * without pulling in a tz library.
 */
function buildEasternMs(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
): number | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  // Start with a naive UTC interpretation, then correct by the NY offset at that instant.
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = getNYOffsetMinutes(naiveUtc);
  return naiveUtc - offsetMinutes * 60_000;
}

function getNYOffsetMinutes(ts: number): number {
  // Format the same instant in NY and UTC, then diff.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(ts));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asNy = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute), Number(map.second),
  );
  return Math.round((asNy - ts) / 60_000);
}

/**
 * Parse relative timestamp like "10:49", "1:10:49", "0:30" → seconds.
 * Returns null if not a recognizable timestamp.
 */
function parseRelativeTimestamp(raw: string): number | null {
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] != null ? Number(m[3]) : null;
  if (b > 59 || (c != null && c > 59)) return null;
  return c != null ? a * 3600 + b * 60 + c : a * 60 + b;
}

/**
 * Parse a Microsoft Teams transcript (plain text extracted from .docx).
 *
 * Handles common shapes:
 *   Speaker Name   10:49
 *   text spoken...
 *
 *   10:49 Speaker Name: text spoken...
 *
 *   Speaker Name 10:49
 *   text...
 */
export function parseTranscript(raw: string): ParsedTranscript {
  const text = stripTranscriptHeading(raw || "");
  if (!text.trim()) {
    return { recordingStartMs: null, recordingEndMs: null, utterances: [] };
  }

  const recordingStartMs = parseRecordingStart(text);
  const lines = text.split(/\r?\n/);
  const utterances: Utterance[] = [];

  // State for the "Speaker line; timestamp line; text lines" pattern.
  let currentSpeaker = "Unknown";
  let currentSeconds: number | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (currentSeconds != null && body) {
      utterances.push({
        speaker: currentSpeaker || "Unknown",
        relativeSeconds: currentSeconds,
        absoluteMs: recordingStartMs != null ? recordingStartMs + currentSeconds * 1000 : null,
        text: body,
      });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Pattern D (Teams .docx export): "Speaker Name   0:03Text runs on..."
    //   — speaker, 2+ spaces (or tab), timestamp, then the utterance text glued
    //   directly onto the timestamp with no separator.
    const speakerTimeInline = line.match(/^(.{1,80}?)(?:\s{2,}|\t)(\d{1,2}:\d{2}(?::\d{2})?)(.*)$/);
    if (speakerTimeInline) {
      const candidateSpeaker = speakerTimeInline[1].trim();
      const seconds = parseRelativeTimestamp(speakerTimeInline[2]);
      const rest = (speakerTimeInline[3] ?? "").trim();
      if (seconds != null && candidateSpeaker.length > 0 && !/[.!?]/.test(candidateSpeaker)) {
        flush();
        currentSpeaker = candidateSpeaker;
        currentSeconds = seconds;
        if (rest) buffer.push(rest);
        continue;
      }
    }

    // Pattern A: "Speaker Name 10:49" or "Speaker Name    10:49" on a single line
    //   where 10:49 is at the END of the line.
    const speakerWithTime = line.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*$/);
    // Pattern B: "10:49 Speaker Name: text..." or "10:49 Speaker Name"
    const leadingTime = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
    // Pattern C: bare timestamp on its own line
    const bareTime = parseRelativeTimestamp(line);

    if (bareTime != null) {
      flush();
      currentSeconds = bareTime;
      continue;
    }

    if (speakerWithTime) {
      const candidateSpeaker = speakerWithTime[1].trim();
      const seconds = parseRelativeTimestamp(speakerWithTime[2]);
      // Treat as a speaker/time header only if the speaker portion looks like a name
      // (no sentence punctuation, reasonable length).
      if (
        seconds != null
        && candidateSpeaker.length > 0
        && candidateSpeaker.length <= 80
        && !/[.!?]/.test(candidateSpeaker)
      ) {
        flush();
        currentSpeaker = candidateSpeaker;
        currentSeconds = seconds;
        continue;
      }
    }

    if (leadingTime) {
      const seconds = parseRelativeTimestamp(leadingTime[1]);
      if (seconds != null) {
        flush();
        currentSeconds = seconds;
        // Try to extract "Speaker Name: rest"
        const rest = leadingTime[2];
        const speakerSplit = rest.match(/^([^:]{1,80}):\s*(.*)$/);
        if (speakerSplit && !/[.!?]/.test(speakerSplit[1])) {
          currentSpeaker = speakerSplit[1].trim();
          if (speakerSplit[2]) buffer.push(speakerSplit[2]);
        } else {
          buffer.push(rest);
        }
        continue;
      }
    }

    // Otherwise it is body text for the current utterance.
    buffer.push(line);
  }
  flush();

  const recordingEndMs = utterances.length > 0 && recordingStartMs != null
    ? recordingStartMs + utterances[utterances.length - 1].relativeSeconds * 1000 + 30_000
    : null;

  return { recordingStartMs, recordingEndMs, utterances };
}

/* ------------------------------------------------------------------ *
 * HTML stripping (server-safe — no DOMParser)
 * ------------------------------------------------------------------ */

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtmlServer(input: string | null | undefined): string {
  if (!input) return "";
  let s = input
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
  // Iteratively remove tags (handles malformed/nested).
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/<[^>]*>/g, "");
  }
  // Replace common entities, numeric entities, and remaining &nbsp; references.
  s = s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => HTML_ENTITY_MAP[m] || " ");
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCharCode(code) : "";
  });
  return s.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------ *
 * Audit-event → slide-window mapping
 * ------------------------------------------------------------------ */

const RECORDING_WINDOW_BUFFER_MS = 5 * 60 * 1000;

interface BuildWindowsArgs {
  meetingId: string;
  /** Ordered list of proposal IDs as they appear in the carousel. */
  proposalIdsByOrder: string[];
  recordingStartMs: number | null;
  recordingEndMs: number | null;
}

/**
 * Build [startMs, endMs] windows per proposal/admin slide using audit_events.
 *
 * - Filters audit events to within [recordingStart - 5m, recordingEnd + 5m]
 *   when the recording window is known. This drops noise from later
 *   reopens of the meeting.
 * - Anchors per slide are, in priority order:
 *     1. slide_changed events whose payload.slide maps to that proposal
 *     2. voting_opened (start) and voting_tallied / voting_closed (end)
 */
export async function buildSlideWindowsFromAudit(
  args: BuildWindowsArgs,
): Promise<Map<string, SlideWindow>> {
  const { meetingId, proposalIdsByOrder, recordingStartMs, recordingEndMs } = args;
  const sb = getSupabaseServer();
  const res = await sb
    .from("audit_events")
    .select("proposal_id, event_type, payload_json, created_at")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (res.error) {
    console.error("[transcript] audit_events query failed:", res.error.code, res.error.message);
    return new Map();
  }

  const lowerBound = recordingStartMs != null ? recordingStartMs - RECORDING_WINDOW_BUFFER_MS : -Infinity;
  const upperBound = recordingEndMs != null ? recordingEndMs + RECORDING_WINDOW_BUFFER_MS : Infinity;

  const events = (res.data as AuditEventRow[] | null ?? [])
    .map((e) => ({ ...e, _ts: new Date(e.created_at).getTime() }))
    .filter((e) => Number.isFinite(e._ts) && e._ts >= lowerBound && e._ts <= upperBound);

  // Walk slide_changed events to assemble enter→nextEnter spans.
  const slideEnters: { proposalId: string | null; ts: number }[] = [];
  for (const e of events) {
    if (e.event_type !== "slide_changed") continue;
    const payload = e.payload_json ?? {};
    const rawSlide = (payload as Record<string, unknown>).slide
      ?? (payload as Record<string, unknown>).current_slide
      ?? (payload as Record<string, unknown>).slide_index;
    const slideIdx = typeof rawSlide === "number" ? rawSlide
      : typeof rawSlide === "string" && /^\d+$/.test(rawSlide) ? Number(rawSlide)
      : null;
    if (slideIdx == null) continue;

    // Carousel layout: 0 = title, 1..N = proposals[0..N-1], N+1 = closing.
    const proposalIdx = slideIdx - 1;
    const proposalId = proposalIdx >= 0 && proposalIdx < proposalIdsByOrder.length
      ? proposalIdsByOrder[proposalIdx]
      : null;
    slideEnters.push({ proposalId, ts: e._ts });
  }

  const windows = new Map<string, SlideWindow>();

  // Helper: union [start,end] into the existing window for proposalId.
  const merge = (proposalId: string, slideIndex: number, startMs: number, endMs: number) => {
    if (!(endMs > startMs)) return;
    const existing = windows.get(proposalId);
    if (existing) {
      windows.set(proposalId, {
        proposalId,
        slideIndex,
        startMs: Math.min(existing.startMs, startMs),
        endMs: Math.max(existing.endMs, endMs),
      });
    } else {
      windows.set(proposalId, { proposalId, slideIndex, startMs, endMs });
    }
  };

  for (let i = 0; i < slideEnters.length; i++) {
    const cur = slideEnters[i];
    if (!cur.proposalId) continue;
    const next = slideEnters[i + 1];
    const endMs = next ? next.ts : cur.ts + 30 * 60 * 1000; // cap orphan at +30min
    const slideIdx = proposalIdsByOrder.indexOf(cur.proposalId) + 1;
    merge(cur.proposalId, slideIdx, cur.ts, Math.min(endMs, upperBound));
  }

  // Voting events as additional anchors per proposal.
  const votingStarts = new Map<string, number>();
  const votingEnds = new Map<string, number>();
  for (const e of events) {
    if (!e.proposal_id) continue;
    if (e.event_type === "voting_opened") {
      const prev = votingStarts.get(e.proposal_id);
      if (prev == null || e._ts < prev) votingStarts.set(e.proposal_id, e._ts);
    } else if (e.event_type === "voting_tallied" || e.event_type === "voting_closed") {
      const prev = votingEnds.get(e.proposal_id);
      if (prev == null || e._ts > prev) votingEnds.set(e.proposal_id, e._ts);
    }
  }
  for (const [proposalId, startMs] of votingStarts) {
    const endMs = votingEnds.get(proposalId) ?? startMs + 5 * 60 * 1000;
    const slideIdx = proposalIdsByOrder.indexOf(proposalId) + 1;
    if (slideIdx > 0) merge(proposalId, slideIdx, startMs, endMs);
  }

  return windows;
}

/* ------------------------------------------------------------------ *
 * Utterance assignment & semantic fallback
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","for","in","on","at","by","with","from",
  "is","are","be","this","that","it","as","we","our","you","your","i","my",
  "shall","will","would","may","can","should","do","does","did","not","no",
  "amendment","proposal","section","article","rule","rules",
]);

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function keywordScore(text: string, keywords: Set<string>): number {
  if (keywords.size === 0) return 0;
  let hits = 0;
  for (const tok of tokenize(text)) if (keywords.has(tok)) hits++;
  return hits;
}

interface AssignmentResult {
  /** Utterances assigned to each proposal id. */
  utterancesByProposal: Map<string, Utterance[]>;
}

/**
 * Assign each utterance to a proposal slide.
 * Strategy:
 *   1. If we have an absolute timestamp AND a slide window that contains it → assign.
 *   2. Otherwise, fall back to keyword overlap with slide title/context (semantic match).
 *      Requires a minimum overlap to count.
 */
export function assignUtterancesToSlides(
  parsed: ParsedTranscript,
  slides: SlideContext[],
  windows: Map<string, SlideWindow>,
): AssignmentResult {
  const byProposal = new Map<string, Utterance[]>();
  for (const s of slides) byProposal.set(s.proposalId, []);

  const slideKeywords = new Map<string, Set<string>>();
  for (const s of slides) {
    const tokens = new Set<string>([
      ...tokenize(s.title),
      ...tokenize(s.contextText).slice(0, 60),
    ]);
    slideKeywords.set(s.proposalId, tokens);
  }

  for (const u of parsed.utterances) {
    // Step 1: timestamp-based.
    if (u.absoluteMs != null) {
      let assignedProposalId: string | null = null;
      for (const w of windows.values()) {
        if (u.absoluteMs >= w.startMs && u.absoluteMs <= w.endMs) {
          assignedProposalId = w.proposalId;
          break;
        }
      }
      if (assignedProposalId) {
        byProposal.get(assignedProposalId)?.push(u);
        continue;
      }
    }

    // Step 2: semantic keyword match (only if we have keywords + meaningful score).
    let bestId: string | null = null;
    let bestScore = 0;
    for (const s of slides) {
      const score = keywordScore(u.text, slideKeywords.get(s.proposalId) ?? new Set());
      if (score > bestScore) {
        bestScore = score;
        bestId = s.proposalId;
      }
    }
    if (bestId && bestScore >= 2) byProposal.get(bestId)?.push(u);
  }

  return { utterancesByProposal: byProposal };
}

/* ------------------------------------------------------------------ *
 * AI transcript segmentation (primary assignment when an LLM is configured)
 *
 * The timestamp/keyword assignment above depends on audit-event timing lining
 * up with the recording header, which is fragile in practice. When an LLM is
 * available we instead ask it to segment the numbered transcript by agenda
 * item directly — far more robust for real Teams transcripts.
 * ------------------------------------------------------------------ */

interface AiSegment {
  slide: number; // 1-based index into the slides array; 0 = no slide
  start: number; // first utterance index (0-based, inclusive)
  end: number;   // last utterance index (0-based, inclusive)
}

export async function aiAssignUtterancesToSlides(
  parsed: ParsedTranscript,
  slides: SlideContext[],
): Promise<Map<string, Utterance[]> | null> {
  if (parsed.utterances.length === 0 || slides.length === 0) return null;

  const slideList = slides
    .map((s, i) => {
      const context = s.contextText ? ` — ${s.contextText.slice(0, 200)}` : "";
      return `${i + 1}. [${s.category}] ${s.title}${context}`;
    })
    .join("\n");

  const numbered = parsed.utterances
    .map((u, i) => {
      const m = Math.floor(u.relativeSeconds / 60);
      const s = String(u.relativeSeconds % 60).padStart(2, "0");
      return `#${i} [${m}:${s}] ${u.speaker}: ${u.text}`;
    })
    .join("\n");

  const system = [
    "You segment a fantasy-football league owners' meeting transcript by agenda item.",
    "You are given the ordered agenda (slides) and the full transcript as numbered utterances.",
    "Assign each contiguous stretch of the transcript to the agenda item it discusses.",
    "The meeting generally follows agenda order, but tangents and revisits happen — assign by content, not just position.",
    "Small talk, logistics, and banter that belong to no agenda item get slide 0.",
    'Respond with ONLY a JSON array of segments: [{"slide": <agenda number, 0 for none>, "start": <first utterance #>, "end": <last utterance #, inclusive>}].',
    "Segments must be in transcript order, must not overlap, and together should cover every utterance index.",
  ].join(" ");

  const user = `Agenda items:\n${slideList}\n\nTranscript (${parsed.utterances.length} utterances):\n${numbered}`;

  const raw = await callLLM(system, user, 4000);
  const segments = extractJson<AiSegment[]>(raw);
  if (!segments || !Array.isArray(segments) || segments.length === 0) return null;

  const byProposal = new Map<string, Utterance[]>();
  for (const s of slides) byProposal.set(s.proposalId, []);

  let assigned = 0;
  for (const seg of segments) {
    if (
      typeof seg?.slide !== "number" || typeof seg?.start !== "number" || typeof seg?.end !== "number"
    ) continue;
    if (seg.slide < 1 || seg.slide > slides.length) continue;
    const proposalId = slides[seg.slide - 1].proposalId;
    const start = Math.max(0, Math.floor(seg.start));
    const end = Math.min(parsed.utterances.length - 1, Math.floor(seg.end));
    for (let i = start; i <= end; i++) {
      byProposal.get(proposalId)?.push(parsed.utterances[i]);
      assigned++;
    }
  }

  // Sanity check: if the model assigned almost nothing, treat as failure so
  // the caller can fall back to timestamp/keyword assignment.
  if (assigned < Math.min(3, parsed.utterances.length)) return null;
  return byProposal;
}

/* ------------------------------------------------------------------ *
 * Summary generation (AI preferred, heuristic fallback)
 * ------------------------------------------------------------------ */

function formatExcerpt(utterances: Utterance[]): string {
  return utterances
    .map((u) => {
      const m = Math.floor(u.relativeSeconds / 60);
      const s = String(u.relativeSeconds % 60).padStart(2, "0");
      return `[${m}:${s}] ${u.speaker}: ${u.text}`;
    })
    .join("\n");
}

function heuristicSummary(slide: SlideContext, utterances: Utterance[]): string {
  if (utterances.length === 0) return "";

  const speakers = Array.from(new Set(utterances.map((u) => u.speaker))).slice(0, 6);
  const lines: string[] = [];

  // Most distinctive utterances: pick first, middle, last + any with vote/decision keywords.
  const decisionRe = /\b(decide|decided|pass|passes|fail|fails|approve|approved|reject|rejected|table|tabled|vote|motion|agree|pick|round|draft|order)\b/i;
  const flagged = utterances.filter((u) => decisionRe.test(u.text)).slice(0, 3);
  const sampled: Utterance[] = [];
  const pickIdxs = utterances.length <= 3
    ? utterances.map((_, i) => i)
    : [0, Math.floor(utterances.length / 2), utterances.length - 1];
  for (const i of pickIdxs) sampled.push(utterances[i]);
  for (const u of flagged) if (!sampled.includes(u)) sampled.push(u);

  for (const u of sampled.slice(0, 5)) {
    const truncated = u.text.length > 220 ? u.text.slice(0, 217).trimEnd() + "…" : u.text;
    lines.push(`${u.speaker}: ${truncated}`);
  }

  const header = slide.category === "admin"
    ? `Discussion led by ${speakers.join(", ") || "owners"}.`
    : `Owners discussed ${slide.title.toLowerCase()}; speakers: ${speakers.join(", ") || "n/a"}.`;
  return [header, ...lines].join("\n");
}

/**
 * Build a per-slide discussion summary.
 * Primary source: transcript text assigned to that slide window.
 * Secondary context only: slide title/details (already HTML-stripped).
 */
export async function generateDiscussionSummary(
  slide: SlideContext,
  utterances: Utterance[],
): Promise<DiscussionSummary> {
  const excerpt = formatExcerpt(utterances);

  if (utterances.length === 0) {
    return {
      summary: "No transcript discussion detected for this slide.",
      confidence: "none",
      transcript_excerpt: "",
      source: "none",
    };
  }

  // Try AI generation first when configured.
  const system = [
    "You are summarizing a fantasy-football league owners' meeting.",
    "Use ONLY the transcript excerpt as the source of the discussion.",
    "The slide title and context are background only — do NOT summarize the slide text itself.",
    "Output 3-6 concise bullet lines (one per line, no leading dashes).",
    "Capture key owner viewpoints, back-and-forth, and the ACTUAL DECISION made — especially for admin items like draft order, where you should list which team got which pick if the transcript states it.",
    "Use natural sentences. Never output HTML, tags, or entity references like &nbsp;.",
    "If the transcript excerpt does not contain enough information, output exactly: No transcript discussion detected for this slide.",
  ].join(" ");

  const user = [
    `Slide title: ${slide.title}`,
    `Slide type: ${slide.category}`,
    slide.voteSummary ? `Vote result: ${slide.voteSummary}` : null,
    slide.contextText ? `Slide context (background only):\n${slide.contextText.slice(0, 1200)}` : null,
    `Transcript excerpt for this slide:\n${excerpt.slice(0, 6000)}`,
  ].filter(Boolean).join("\n\n");

  const aiText = await callLLM(system, user, 600);

  const confidence: DiscussionSummary["confidence"] =
    utterances.length >= 8 ? "high"
    : utterances.length >= 3 ? "medium"
    : "low";

  if (aiText && aiText.length > 0) {
    // Strip HTML defensively in case the model returns any.
    const cleaned = stripHtmlServer(aiText).trim();
    if (cleaned) {
      return {
        summary: cleaned,
        confidence,
        transcript_excerpt: excerpt,
        source: "ai",
      };
    }
  }

  return {
    summary: heuristicSummary(slide, utterances),
    confidence,
    transcript_excerpt: excerpt,
    source: "heuristic",
  };
}

/* ------------------------------------------------------------------ *
 * Storage helpers — persist inside meeting_minutes.checklist_markdown
 * without disturbing existing keys.
 * ------------------------------------------------------------------ */

export interface StoredDiscussionSummariesBlob {
  slide_notes?: Record<string, string>;
  commissioner_notes?: Record<string, string>;
  discussion_summaries?: Record<string, DiscussionSummary>;
  [key: string]: unknown;
}

export function parseChecklist(raw: string | null | undefined): StoredDiscussionSummariesBlob {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as StoredDiscussionSummariesBlob : {};
  } catch {
    return {};
  }
}

export function mergeDiscussionSummaries(
  existingChecklistRaw: string | null | undefined,
  summaries: Record<string, DiscussionSummary>,
): string {
  const blob = parseChecklist(existingChecklistRaw);
  blob.discussion_summaries = summaries;
  return JSON.stringify(blob);
}

/* ------------------------------------------------------------------ *
 * End-to-end pipeline: transcript → per-slide summaries → persisted
 * ------------------------------------------------------------------ */

export interface GenerateSummariesResult {
  ok: boolean;
  error?: string;
  count?: number;
  utterance_count?: number;
  assigned_count?: number;
  assignment_source?: "ai" | "timestamps" | "none";
  provider?: string | null;
}

interface ProposalRowForSummaries {
  id: string;
  title: string;
  order_index: number | null;
  proposal_type: string | null;
  summary: string | null;
  created_at: string;
}

/**
 * Generate per-slide discussion summaries for a meeting from its uploaded
 * transcript and persist them under meeting_minutes.checklist_markdown.
 * Safe to re-run — summaries are regenerated and replaced each time.
 */
export async function generateAndStoreSummaries(meetingId: string): Promise<GenerateSummariesResult> {
  const sb = getSupabaseServer();

  const minutesRes = await sb
    .from("meeting_minutes")
    .select("minutes_markdown, checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (minutesRes.error) {
    console.error("[transcript] meeting_minutes query failed:", minutesRes.error.message);
    return { ok: false, error: `Supabase error: ${minutesRes.error.message}` };
  }
  const transcriptRaw = minutesRes.data?.minutes_markdown ?? "";
  if (!transcriptRaw.trim()) {
    return { ok: false, error: "No transcript uploaded for this meeting" };
  }

  const proposalsRes = await sb
    .from("proposals")
    .select("id, title, order_index, proposal_type, summary, created_at")
    .eq("meeting_id", meetingId)
    .order("order_index")
    .order("created_at");
  if (proposalsRes.error) {
    return { ok: false, error: `Supabase error: ${proposalsRes.error.message}` };
  }
  const proposals = (proposalsRes.data || []) as ProposalRowForSummaries[];
  if (proposals.length === 0) return { ok: true, count: 0, utterance_count: 0 };

  const voteSessionsRes = await sb
    .from("proposal_vote_sessions")
    .select("proposal_id, status, yes_count, no_count, total_count, passed")
    .in("proposal_id", proposals.map((p) => p.id));
  const voteSessions = voteSessionsRes.error ? [] : (voteSessionsRes.data || []);

  const parsed = parseTranscript(transcriptRaw);
  if (parsed.utterances.length === 0) {
    return { ok: false, error: "Could not parse any utterances from the transcript. Check the file format." };
  }

  const slides: SlideContext[] = proposals.map((p, idx) => {
    const vs = voteSessions.find((v) => v.proposal_id === p.id);
    const voteSummary = vs && vs.status === "tallied"
      ? `${vs.passed ? "PASSED" : "FAILED"} (YES ${vs.yes_count ?? 0}, NO ${vs.no_count ?? 0}, TOTAL ${vs.total_count ?? 0})`
      : null;
    return {
      proposalId: p.id,
      orderIndex: p.order_index ?? idx,
      slideIndex: idx + 1,
      title: p.title,
      category: p.proposal_type ?? "proposal",
      contextText: stripHtmlServer(p.summary ?? ""),
      voteSummary,
    };
  });

  // Primary: AI segmentation. Fallback: audit-event windows + keyword matching.
  let utterancesByProposal: Map<string, Utterance[]> | null = null;
  let assignmentSource: GenerateSummariesResult["assignment_source"] = "none";

  if (llmProvider()) {
    utterancesByProposal = await aiAssignUtterancesToSlides(parsed, slides);
    if (utterancesByProposal) assignmentSource = "ai";
  }
  if (!utterancesByProposal) {
    const windows = await buildSlideWindowsFromAudit({
      meetingId,
      proposalIdsByOrder: proposals.map((p) => p.id),
      recordingStartMs: parsed.recordingStartMs,
      recordingEndMs: parsed.recordingEndMs,
    });
    utterancesByProposal = assignUtterancesToSlides(parsed, slides, windows).utterancesByProposal;
    assignmentSource = "timestamps";
  }

  const assignedCount = Array.from(utterancesByProposal.values()).reduce((n, u) => n + u.length, 0);

  // Generate all per-slide summaries concurrently.
  const entries = await Promise.all(
    slides.map(async (slide) => {
      const utterances = utterancesByProposal!.get(slide.proposalId) ?? [];
      const summary = await generateDiscussionSummary(slide, utterances);
      return [slide.proposalId, summary] as const;
    }),
  );
  const summaries: Record<string, DiscussionSummary> = Object.fromEntries(entries);

  // Re-read the checklist just before writing to minimize clobbering concurrent note edits.
  const freshMinutes = await sb
    .from("meeting_minutes")
    .select("checklist_markdown")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  const baseChecklist = freshMinutes.data?.checklist_markdown ?? minutesRes.data?.checklist_markdown ?? "";
  const newChecklist = mergeDiscussionSummaries(baseChecklist, summaries);
  const upsertRes = await sb
    .from("meeting_minutes")
    .upsert({ meeting_id: meetingId, checklist_markdown: newChecklist }, { onConflict: "meeting_id" });
  if (upsertRes.error) {
    return { ok: false, error: `Supabase error: ${upsertRes.error.message}` };
  }

  return {
    ok: true,
    count: Object.keys(summaries).length,
    utterance_count: parsed.utterances.length,
    assigned_count: assignedCount,
    assignment_source: assignmentSource,
    provider: llmProvider(),
  };
}
