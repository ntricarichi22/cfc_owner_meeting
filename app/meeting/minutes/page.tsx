"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";

/* ---------- Types ---------- */

interface SlideVote {
  team_name: string;
  vote: "yes" | "no";
}

interface SlideVoteSession {
  yes_count: number;
  no_count: number;
  total_count: number;
  passed: boolean | null;
  status: string;
}

interface SlideProposal {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  commissioner_notes?: string | null;
}

interface Slide {
  id: string;
  order_index: number;
  title: string;
  category: string;
  proposed_by: string | null;
  effective_date: string | null;
  article_sections: string[];
  proposal: SlideProposal | null;
  voteSession: SlideVoteSession | null;
  votes: SlideVote[];
  /** Plain-text transcript excerpt assigned to this slide (when available). */
  transcript_excerpt?: string | null;
  /** Confidence score for the generated discussion summary. */
  summary_confidence?: "high" | "medium" | "low" | "none" | null;
  /** Source of the discussion summary: "ai" | "heuristic" | "none". */
  summary_source?: "ai" | "heuristic" | "none" | null;
}

interface MeetingInfo {
  id: string;
  title: string;
  year: number;
  status: string;
  ended_at: string | null;
  finalized_at: string | null;
}

interface ConstitutionSectionInfo {
  id: string;
  section_key?: string;
  title?: string;
  section_num?: string;
  section_title?: string;
  anchor?: string;
  article_num?: number | null;
  article_title?: string | null;
}

/* ---------- Helpers ---------- */

type SlideBadge = "approved" | "approved_with_mods" | "rejected" | "tabled" | "admin" | null;

function getSlideBadge(slide: Slide): SlideBadge {
  // Admin slides always get the Admin badge regardless of any other fields.
  if (slide.category === "admin") return "admin";
  // For proposal slides, the tallied vote session is the authoritative source of truth.
  if (slide.voteSession?.status === "tallied") {
    if (slide.voteSession.passed && slide.proposal?.commissioner_notes) {
      return "approved_with_mods";
    }
    return slide.voteSession.passed ? "approved" : "rejected";
  }
  return null;
}

/** Strip HTML tags and decode entities, returning plain text.
 *  Uses DOMParser in the browser for robustness; falls back to regex (e.g. during SSR). */
function stripHtml(html: string): string {
  if (!html) return "";
  if (typeof window !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      // Replace non-breaking spaces with regular spaces, then collapse whitespace
      return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    } catch {
      // fall through to regex
    }
  }
  // Regex fallback for SSR or if DOMParser is unavailable.
  // Iteratively strip tags (handles malformed/nested cases) — same approach as isEmptyHtml.
  let result = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n");
  let prev = "";
  while (result !== prev) {
    prev = result;
    result = result.replace(/<[^>]*>/g, "");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function parseSlideNotes(checklist: string): Record<string, string> {
  try {
    const parsed = JSON.parse(checklist);
    if (parsed && typeof parsed === "object" && parsed.slide_notes) {
      return parsed.slide_notes as Record<string, string>;
    }
  } catch {
    // Legacy plain-text checklist – ignore
  }
  return {};
}

function parseCommissionerNotes(checklist: string): Record<string, string> {
  try {
    const parsed = JSON.parse(checklist);
    if (parsed && typeof parsed === "object" && parsed.commissioner_notes) {
      return parsed.commissioner_notes as Record<string, string>;
    }
  } catch {
    // ignore
  }
  return {};
}

function formatEndTime(ended_at: string): string {
  const d = new Date(ended_at);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatMeetingDate(ended_at: string | null, year: number): string {
  if (!ended_at) return `${year}`;
  const d = new Date(ended_at);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* ---------- Sub-components ---------- */

function SlideBadgeChip({ type, selected = false }: { type: SlideBadge; selected?: boolean }) {
  if (!type) return null;
  if (type === "admin") {
    return (
      <span
        className={`inline-block px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase border rounded ${
          selected ? "border-white/50 text-white/70" : "border-[#111827] text-[#0B0B0F]"
        }`}
      >
        ADMIN
      </span>
    );
  }
  const styles: Record<string, string> = {
    approved: "bg-[#16A34A] text-white border border-[#111827]",
    approved_with_mods: "bg-[#16A34A] text-white border border-[#111827]",
    rejected: "bg-[#DC2626] text-white border border-[#111827]",
    tabled: "bg-[#D97706] text-white border border-[#111827]",
  };
  const labels: Record<string, string> = {
    approved: "APPROVED",
    approved_with_mods: "APPROVED WITH MODS",
    rejected: "REJECTED",
    tabled: "TABLED",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function VoteChip({
  label,
  count,
  teams,
  variant,
}: {
  label: string;
  count: number;
  teams: string[];
  variant: "for" | "against";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`flex items-center gap-2 px-5 py-2 text-white font-bold text-sm border-2 border-[#111827] shadow-[3px_3px_0_#000] rounded transition-transform hover:-translate-y-0.5 ${
          variant === "for" ? "bg-[#DC2626]" : "bg-[#16A34A]"
        }`}
      >
        {label} <span className="text-lg font-black">{count}</span>
      </button>
      {open && teams.length > 0 && (
        <div className="absolute top-full left-0 mt-1.5 z-20 bg-[#0B0B0F] text-white text-xs border-2 border-[#111827] rounded shadow-[4px_4px_0_#000] p-2 min-w-[160px]">
          <div className="font-bold text-[10px] uppercase tracking-wider text-white/60 mb-1.5">
            {variant === "for" ? "Voted For" : "Voted Against"}
          </div>
          {teams.map((t) => (
            <div key={t} className="py-0.5">
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptModal({
  transcript,
  slideTitle,
  onClose,
}: {
  transcript: string;
  slideTitle: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(11,11,15,0.6)] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border-4 border-[#111827] bg-[#F6F1E7] shadow-[6px_6px_0_#000]">
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-[#111827] shrink-0">
          <div>
            <div className="text-xs font-bold tracking-[0.15em] uppercase text-[#0B0B0F]/60">
              Transcript Excerpt
            </div>
            <div className="font-bold text-lg text-[#0B0B0F]">{slideTitle}</div>
          </div>
          <button
            onClick={onClose}
            className="text-[#0B0B0F]/50 hover:text-[#0B0B0F] transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">
          <pre className="whitespace-pre-wrap text-sm font-mono text-[#0B0B0F] leading-relaxed">
            {transcript || "No transcript available."}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function MeetingMinutesPage() {
  const { session, loading, isCommissioner, logout } = useSession();
  const searchParams = useSearchParams();

  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedSlide, setSelectedSlide] = useState<Slide | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [commissionerNotes, setCommissionerNotes] = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState<string>("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [constitutionSections, setConstitutionSections] = useState<ConstitutionSectionInfo[]>([]);

  const notesRef = useRef<Record<string, string>>({});
  const commissionerNotesRef = useRef<Record<string, string>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state for closures
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    commissionerNotesRef.current = commissionerNotes;
  }, [commissionerNotes]);

  // Load constitution sections once for chip resolution
  useEffect(() => {
    if (!session) return;
    fetch("/api/constitution-sections")
      .then((r) => r.json())
      .then((data) => setConstitutionSections(Array.isArray(data) ? data : []))
      .catch(() => setConstitutionSections([]));
  }, [session]);

  // Load meeting + slides + minutes data
  useEffect(() => {
    if (!session) return;

    const loadAll = async (id: string) => {
      setMeetingId(id);

      const [meetingRes, slidesRes, minutesRes] = await Promise.all([
        fetch(`/api/meetings/${id}`),
        fetch(`/api/meetings/${id}/slides`),
        fetch(`/api/meetings/${id}/minutes`),
      ]);

      if (meetingRes.ok) {
        const m = await meetingRes.json();
        setMeeting(m);
      }

      let cnMap: Record<string, string> = {};
      if (minutesRes.ok) {
        const m = await minutesRes.json();
        const parsed = parseSlideNotes(m?.checklist_markdown || "");
        setNotes(parsed);
        notesRef.current = parsed;
        setTranscript(m?.minutes_markdown || "");
        cnMap = parseCommissionerNotes(m?.checklist_markdown || "");
        setCommissionerNotes(cnMap);
        commissionerNotesRef.current = cnMap;
      }

      if (slidesRes.ok) {
        const s = await slidesRes.json();
        const slideList: Slide[] = s.slides || [];
        // Augment slides with commissioner_notes from meeting_minutes checklist
        const augmented = slideList.map((slide) => ({
          ...slide,
          proposal: slide.proposal
            ? { ...slide.proposal, commissioner_notes: cnMap[slide.proposal.id] ?? null }
            : null,
        }));
        setSlides(augmented);
        if (augmented.length > 0) setSelectedSlide(augmented[0]);
      }
    };

    const paramId = searchParams.get("meetingId");
    if (paramId) {
      loadAll(paramId).catch(() => setMessage("Failed to load minutes data"));
    } else {
      fetch("/api/meetings/current")
        .then((r) => r.json())
        .then((m) => {
          if (m?.id) return loadAll(m.id);
        })
        .catch(() => setMessage("Failed to load minutes data"));
    }
  }, [session, searchParams]);

  // Persist notes to server
  const saveNotes = useCallback(
    async (updatedNotes: Record<string, string>) => {
      if (!meetingId) return;
      const res = await fetch(`/api/meetings/${meetingId}/minutes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_markdown: JSON.stringify({
            slide_notes: updatedNotes,
            commissioner_notes: commissionerNotesRef.current,
          }),
        }),
      });
      if (res.ok) {
        setNoteSaved(true);
        setTimeout(() => setNoteSaved(false), 2000);
      }
    },
    [meetingId],
  );

  const handleNoteChange = (slideId: string, value: string) => {
    const updated = { ...notesRef.current, [slideId]: value };
    notesRef.current = updated;
    setNotes(updated);
    setNoteSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNotes(updated), 1500);
  };

  const handleNoteBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveNotes(notesRef.current);
  };

  const finalizeMinutes = async () => {
    if (!meetingId || finalizing) return;
    setFinalizing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/finalize`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = [data?.error, data?.details, data?.code].filter(Boolean).join(" | ");
        setMessage(detail || "Finalize failed");
        return;
      }
      setMeeting((prev) => (prev ? { ...prev, status: "finalized" } : prev));
      setMessage("Meeting finalized and moved to history.");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[var(--paper-bg)]" />;
  if (!session)
    return (
      <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] p-8">Not logged in.</div>
    );

  const isFinalized = meeting?.status === "finalized";
  const selectedBadge = selectedSlide ? getSlideBadge(selectedSlide) : null;
  const yesTeams = selectedSlide?.votes.filter((v) => v.vote === "yes").map((v) => v.team_name) ?? [];
  const noTeams = selectedSlide?.votes.filter((v) => v.vote === "no").map((v) => v.team_name) ?? [];
  // Strip HTML from summary before rendering – proposals use a rich-text editor that stores HTML,
  // and transcript-derived summaries are already plain text but we strip defensively.
  const cleanSummary = stripHtml(selectedSlide?.proposal?.summary ?? "");
  // A sentinel summary value emitted by the transcript pipeline when no utterances mapped.
  const NO_DISCUSSION_SENTINEL = "No transcript discussion detected for this slide.";
  const noDiscussionDetected = cleanSummary === NO_DISCUSSION_SENTINEL;
  const hasSummary = !!cleanSummary && !noDiscussionDetected;
  const summaryLines = hasSummary
    ? cleanSummary
        .split("\n")
        .map((l) => l.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
    : [];
  const confidenceLabel: Record<string, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
    none: "None",
  };
  const summaryConfidence = selectedSlide?.summary_confidence;
  const selectedNotes = selectedSlide ? (notes[selectedSlide.id] ?? "") : "";

  // Build constitution section lookup for chip rendering
  const sectionMap = new Map(constitutionSections.map((s) => [s.id, s]));
  const linkedSections = (selectedSlide?.article_sections ?? [])
    .map((id) => sectionMap.get(id))
    .filter((s): s is ConstitutionSectionInfo => !!s);

  function sectionChipLabel(s: ConstitutionSectionInfo): string {
    const num = s.section_num || s.section_key || "";
    const title = s.section_title || s.title || "";
    const artLabel = s.article_title
      ? `Art. ${s.article_num} – ${s.article_title}`
      : s.article_num != null
        ? `Art. ${s.article_num}`
        : "";
    if (artLabel && title) return `${artLabel}, §${num} ${title}`;
    if (artLabel) return `${artLabel}, §${num}`;
    if (title) return `§${num} ${title}`;
    return `§${num}`;
  }

  function sectionChipHref(s: ConstitutionSectionInfo): string {
    const fragment = s.anchor || s.id;
    return fragment ? `/constitution#${fragment}` : "/constitution";
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--paper-bg)] text-[var(--ink)] overflow-hidden">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

      {/* Page content */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        {/* Page label */}
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--ink)]/50 px-1 shrink-0">
          MINUTES REVIEW
        </div>

        {/* Header card */}
        <div className="border-2 border-[var(--border)] bg-[var(--card-surface)] shadow-[6px_6px_0_#000] rounded-2xl px-6 py-4 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-black uppercase tracking-tight leading-none">
                {meeting?.title ?? "Loading…"}
              </h1>
              {!isFinalized ? (
                <span className="bg-[#0B0B0F] text-[#F6F1E7] text-xs font-bold tracking-[0.12em] uppercase px-3 py-1 rounded">
                  DRAFT MINUTES
                </span>
              ) : (
                <span className="bg-[#16A34A] text-white text-xs font-bold tracking-[0.12em] uppercase px-3 py-1 rounded border border-[#111827]">
                  FINALIZED
                </span>
              )}
            </div>
            <div className="text-sm text-[var(--ink)]/65 mt-1.5 flex items-center gap-2">
              <span>{meeting ? formatMeetingDate(meeting.ended_at, meeting.year) : "—"}</span>
              {meeting?.ended_at && (
                <>
                  <span className="text-[var(--ink)]/30">•</span>
                  <span>Meeting Ended {formatEndTime(meeting.ended_at)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-1">
            {message && (
              <span className={`text-xs font-semibold ${message.includes("finalized") ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                {message}
              </span>
            )}
            {isCommissioner && !isFinalized && (
              <button
                onClick={finalizeMinutes}
                disabled={finalizing || !meetingId}
                className="px-5 py-2.5 font-black uppercase tracking-wide text-sm text-[#0B0B0F] bg-[#F5C542] border-2 border-[#111827] rounded shadow-[4px_4px_0_#000] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#000] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {finalizing ? "Finalizing…" : "Finalize Minutes"}
              </button>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left sidebar */}
          <div className="w-72 shrink-0 border-2 border-[var(--border)] bg-[var(--card-surface)] shadow-[6px_6px_0_#000] rounded-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b-2 border-[var(--border)] shrink-0">
              <div className="font-black text-sm uppercase tracking-wide">MINUTES REVIEW</div>
              <div className="text-xs text-[var(--ink)]/55 mt-0.5">
                {meeting ? formatMeetingDate(meeting.ended_at, meeting.year) : "—"}
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {slides.length === 0 && (
                <p className="px-4 py-6 text-sm text-[var(--ink)]/40 italic">No slides found.</p>
              )}
              {slides.map((slide) => {
                const badge = getSlideBadge(slide);
                const isSelected = selectedSlide?.id === slide.id;
                return (
                  <button
                    key={slide.id}
                    onClick={() => setSelectedSlide(slide)}
                    className={`w-full text-left px-4 py-3 border-b border-[var(--border)]/20 flex items-start justify-between gap-2 transition-colors ${
                      isSelected
                        ? "bg-[#1D4ED8] text-white"
                        : "hover:bg-[var(--paper-bg)] text-[var(--ink)]"
                    }`}
                  >
                    <span className="text-sm leading-snug">
                      {slide.order_index}. {slide.title}
                    </span>
                    <span className="shrink-0 mt-0.5">
                      <SlideBadgeChip type={badge} selected={isSelected} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right pane */}
          <div className="flex-1 border-2 border-[var(--border)] bg-[var(--card-surface)] shadow-[6px_6px_0_#000] rounded-2xl overflow-y-auto p-6 min-w-0">
            {!selectedSlide && (
              <div className="flex items-center justify-center h-full text-[var(--ink)]/35">
                <p className="text-sm italic">Select a slide to view details</p>
              </div>
            )}

            {selectedSlide && (
              <div className="space-y-4">
                {/* Slide title + status badge */}
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-black uppercase tracking-tight leading-tight">
                    {selectedSlide.order_index}. {selectedSlide.title}
                  </h2>
                  {selectedBadge && selectedBadge !== "admin" && (
                    <span
                      className={`px-3 py-1 text-sm font-black uppercase tracking-wide rounded border-2 border-[#111827] ${
                        selectedBadge === "approved"
                          ? "bg-[#16A34A] text-white"
                          : selectedBadge === "rejected"
                            ? "bg-[#DC2626] text-white"
                            : "bg-[#D97706] text-white"
                      }`}
                    >
                      {selectedBadge.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Vote chips */}
                {selectedSlide.voteSession?.status === "tallied" && (
                  <div className="flex items-center gap-3">
                    <VoteChip
                      label="Votes For"
                      count={selectedSlide.voteSession.yes_count}
                      teams={yesTeams}
                      variant="for"
                    />
                    <VoteChip
                      label="Votes Against"
                      count={selectedSlide.voteSession.no_count}
                      teams={noTeams}
                      variant="against"
                    />
                  </div>
                )}

                {/* Proposal metadata chips */}
                {selectedSlide.category !== "admin" &&
                  (selectedSlide.proposed_by || selectedSlide.effective_date || linkedSections.length > 0) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {selectedSlide.proposed_by && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold border-2 border-[#111827] rounded bg-[var(--card-surface)] text-[var(--ink)] shadow-[2px_2px_0_#000]">
                        <span className="text-[var(--ink)]/50 uppercase tracking-wide text-[10px]">Proposed by</span>
                        {selectedSlide.proposed_by}
                      </span>
                    )}
                    {selectedSlide.effective_date && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold border-2 border-[#111827] rounded bg-[var(--card-surface)] text-[var(--ink)] shadow-[2px_2px_0_#000]">
                        <span className="text-[var(--ink)]/50 uppercase tracking-wide text-[10px]">Effective</span>
                        {selectedSlide.effective_date}
                      </span>
                    )}
                    {linkedSections.map((sec) => (
                      <a
                        key={sec.id}
                        href={sectionChipHref(sec)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold border-2 border-[#1D4ED8] rounded bg-[var(--card-surface)] text-[#1D4ED8] shadow-[2px_2px_0_#000] hover:underline"
                      >
                        {sectionChipLabel(sec)} ↗
                      </a>
                    ))}
                  </div>
                )}

                {/* Discussion Summary card */}
                <div className="border-2 border-[var(--border)] bg-[var(--paper-bg)] rounded-2xl shadow-[4px_4px_0_#000] overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-[#16A34A] text-white rounded-full border border-[#111827] shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={3}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        </span>
                        <span className="font-bold text-lg">Discussion Summary</span>
                      </div>
                      {hasSummary && (
                        <span className="text-sm text-[#16A34A] font-semibold flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={3}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                          Confidence:{" "}
                          <span className="font-black text-[#16A34A]">
                            {summaryConfidence ? confidenceLabel[summaryConfidence] ?? "High" : "High"}
                          </span>
                        </span>
                      )}
                    </div>

                    {hasSummary ? (
                      <ul className="space-y-1.5 text-sm list-disc list-inside text-[var(--ink)]">
                        {summaryLines.map((line, i) => (
                          <li key={i} className="leading-relaxed">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : noDiscussionDetected ? (
                      <p className="text-sm text-[var(--ink)]/45 italic">
                        No transcript discussion detected for this slide.
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--ink)]/45 italic">
                        No usable transcript discussion was detected for this slide. Upload a Teams transcript to generate discussion summaries.
                      </p>
                    )}
                  </div>

                  {/* Transcript excerpt link */}
                  <div className="border-t border-dashed border-[var(--border)]/40 px-5 py-3 flex justify-end">
                    <button
                      onClick={() => setShowTranscript(true)}
                      className="text-sm font-semibold text-[#1D4ED8] hover:underline flex items-center gap-1"
                    >
                      View Transcript Excerpt
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Commissioner Notes */}
                {isCommissioner && (
                  <div className="border-2 border-[var(--border)] bg-[var(--card-surface)] rounded-2xl shadow-[4px_4px_0_#000] overflow-hidden">
                    <div className="p-5">
                      <div className="font-bold text-base mb-3">Commissioner Notes</div>
                      {isFinalized ? (
                        <p className="text-sm text-[var(--ink)]/70 whitespace-pre-wrap min-h-[80px]">
                          {selectedNotes || (
                            <span className="italic text-[var(--ink)]/40">No notes recorded.</span>
                          )}
                        </p>
                      ) : (
                        <textarea
                          value={selectedNotes}
                          onChange={(e) => handleNoteChange(selectedSlide.id, e.target.value)}
                          onBlur={handleNoteBlur}
                          placeholder="Add notes or edits..."
                          className="w-full min-h-[100px] bg-transparent border-none resize-none text-sm outline-none placeholder-[rgba(11,11,15,0.38)] text-[var(--ink)] leading-relaxed"
                        />
                      )}
                    </div>
                    <div className="px-5 py-2 flex justify-end border-t border-[var(--border)]/20">
                      <span className="text-xs text-[var(--ink)]/38 italic">
                        {noteSaved ? "Autosaved" : isFinalized ? "Read-only" : ""}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcript modal */}
      {showTranscript && selectedSlide && (
        <TranscriptModal
          transcript={selectedSlide.transcript_excerpt || transcript}
          slideTitle={selectedSlide.title}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  );
}

