"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import VotingModal from "@/components/VotingModal";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import { isHtmlContent, isEmptyHtml } from "@/lib/html-utils";
import type {
  Meeting,
  Proposal,
  ProposalVersion,
  Amendment,
} from "@/lib/types";

/** Enriched section returned by /api/constitution-sections */
interface ConstitutionSectionInfo {
  id: string;
  section_num?: string;
  section_title?: string;
  anchor?: string;
  article_num?: number | null;
  article_title?: string | null;
  /* fallback MVP fields */
  section_key?: string;
  title?: string;
}

const CONSTITUTION_LINKS_PREFIX = "[CONSTITUTION_LINKS:";
const MAX_VISIBLE_SECTIONS = 24;

function parseRationale(rationale: string | null | undefined) {
  const pros: string[] = [];
  const cons: string[] = [];
  if (!rationale) return { pros, cons };
  let section: "pros" | "cons" | null = null;
  for (const line of rationale.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[PROS]") { section = "pros"; continue; }
    if (trimmed === "[CONS]") { section = "cons"; continue; }
    if (section === "pros" && trimmed) pros.push(trimmed.replace(/^-\s*/, ""));
    if (section === "cons" && trimmed) cons.push(trimmed.replace(/^-\s*/, ""));
  }
  return { pros, cons };
}

function parseConstitutionLinks(summary: string | null | undefined) {
  if (!summary) return [];
  const match = summary.match(/\[CONSTITUTION_LINKS:\s*([^\]]*)\]/i);
  if (!match?.[1]) return [];
  return match[1].split(",").map((value) => value.trim()).filter(Boolean);
}

function summaryWithoutConstitutionLinks(summary: string | null | undefined) {
  if (!summary) return "";
  return summary.replace(/\s*\[CONSTITUTION_LINKS:[^\]]*\]\s*/gi, "").trim();
}

function buildSummaryWithConstitutionLinks(summaryText: string, linksCsv: string) {
  const cleanedSummary = summaryText.trim();
  const cleanedLinks = linksCsv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
  if (!cleanedLinks) return cleanedSummary;
  return `${cleanedSummary ? `${cleanedSummary} ` : ""}${CONSTITUTION_LINKS_PREFIX} ${cleanedLinks}]`;
}

function constitutionAnchorId(sectionKey: string) {
  return `const-${sectionKey.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function constitutionChipLabel(sec: ConstitutionSectionInfo): string {
  const num = sec.section_num || sec.section_key || "";
  const title = sec.section_title || sec.title || "";
  const artLabel = sec.article_title
    ? `Art. ${sec.article_num} – ${sec.article_title}`
    : sec.article_num
      ? `Art. ${sec.article_num}`
      : "";
  if (artLabel && title) return `${artLabel}, §${num} ${title}`;
  if (artLabel) return `${artLabel}, §${num}`;
  if (title) return `§${num} ${title}`;
  return `Constitution §${num}`;
}

function constitutionChipHref(sec: ConstitutionSectionInfo): string {
  const fragment = sec.anchor || sec.id;
  return fragment ? `/constitution#${fragment}` : "/constitution";
}

function ConstitutionChips({ sections }: { sections: ConstitutionSectionInfo[] }) {
  if (sections.length > 0) {
    return (
      <>
        {sections.map((sec) => (
          <a
            key={sec.id}
            href={constitutionChipHref(sec)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-[#0ea5e9] px-3 py-1 text-sm font-medium text-[#0ea5e9] hover:bg-[#0ea5e9]/10 transition-colors cursor-pointer"
          >
            {constitutionChipLabel(sec)} ↗
          </a>
        ))}
      </>
    );
  }
  return (
    <a
      href="/constitution"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-full border border-[#0ea5e9] px-3 py-1 text-sm font-medium text-[#0ea5e9] hover:bg-[#0ea5e9]/10 transition-colors cursor-pointer"
    >
      Constitution ↗
    </a>
  );
}

export default function MeetingOwnerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [proposals, setProposals] = useState<(Proposal & { proposal_versions?: ProposalVersion[] })[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [constitutionSections, setConstitutionSections] = useState<ConstitutionSectionInfo[]>([]);
  const [constitutionLinksInput, setConstitutionLinksInput] = useState("");
  const [savingConstitutionLinks, setSavingConstitutionLinks] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendText, setAmendText] = useState("");
  const [amendRationale, setAmendRationale] = useState("");
  const [submittingAmendment, setSubmittingAmendment] = useState(false);
  const [amendmentSuccess, setAmendmentSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingNotFound, setMeetingNotFound] = useState(false);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [startVotingError, setStartVotingError] = useState<string | null>(null);
  const [voteSessionStatus, setVoteSessionStatus] = useState<string>("not_open");
  const [voteSessionPassed, setVoteSessionPassed] = useState<boolean | null>(null);

  const canSubmitAmendment = session?.team_name === COMMISSIONER_TEAM_NAME;

  // Build slide list from proposals sorted by order_index (not agenda items)
  const sortedProposals = [...proposals].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.created_at.localeCompare(b.created_at)
  );
  const slideCount = sortedProposals.length + 1;
  const slideParam = Number(searchParams.get("slide") ?? "0");
  const parsedSlide = Number.isFinite(slideParam) && slideParam >= 0 ? Math.floor(slideParam) : 0;
  const currentSlide = Math.min(parsedSlide, Math.max(0, slideCount - 1));
  const proposal = currentSlide > 0 ? sortedProposals[currentSlide - 1] ?? null : null;
  const activeVersion = proposal?.proposal_versions?.find((v) => v.is_active) ?? null;
  const summaryText = summaryWithoutConstitutionLinks(proposal?.summary);
  const constitutionLinks = parseConstitutionLinks(proposal?.summary);
  // Build map: section id → section info for deep-link chips
  const sectionMap = new Map(
    constitutionSections.map((s) => [s.id, s])
  );
  // Resolve article_sections UUIDs to enriched section objects
  const linkedSections = (proposal?.article_sections || [])
    .map((id) => sectionMap.get(id))
    .filter((s): s is ConstitutionSectionInfo => !!s);
  // Prefer direct pros/cons fields; fall back to rationale parsing for legacy data
  const rationaleData = (() => {
    // Check if pros/cons contain HTML (from rich text editor)
    const prosIsHtml = isHtmlContent(proposal?.pros);
    const consIsHtml = isHtmlContent(proposal?.cons);

    if (prosIsHtml || consIsHtml) {
      return {
        pros: [] as string[],
        cons: [] as string[],
        prosHtml: prosIsHtml && !isEmptyHtml(proposal?.pros) ? (proposal?.pros ?? null) : null,
        consHtml: consIsHtml && !isEmptyHtml(proposal?.cons) ? (proposal?.cons ?? null) : null,
      };
    }

    const directPros = proposal?.pros
      ? proposal.pros.split("\n").map((l) => l.trim().replace(/^-\s*/, "")).filter(Boolean)
      : [];
    const directCons = proposal?.cons
      ? proposal.cons.split("\n").map((l) => l.trim().replace(/^-\s*/, "")).filter(Boolean)
      : [];
    if (directPros.length > 0 || directCons.length > 0) {
      return { pros: directPros, cons: directCons, prosHtml: null, consHtml: null };
    }
    const parsed = parseRationale(activeVersion?.rationale);
    return { ...parsed, prosHtml: null, consHtml: null };
  })();
  const previousVoteStatusRef = useRef<string | null>(null);

  const changeSlide = useCallback((nextSlide: number) => {
    router.replace(`/meeting?slide=${nextSlide}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!searchParams.get("slide") || parsedSlide !== currentSlide) {
      changeSlide(currentSlide);
    }
  }, [searchParams, parsedSlide, currentSlide, changeSlide]);

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.replace("/");
    }
  }, [session, sessionLoading, router]);

  const loadMeeting = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings/current");
      if (res.status === 404) {
        setMeetingNotFound(true);
        return;
      }
      if (!res.ok) return;
      const m: Meeting = await res.json();
      setMeeting(m);
      setMeetingNotFound(false);

      const proposalsRes = await fetch(`/api/proposals?meetingId=${m.id}`);

      if (proposalsRes.ok) {
        setProposals(await proposalsRes.json());
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    loadMeeting();
    const interval = setInterval(loadMeeting, 5000);
    return () => clearInterval(interval);
  }, [session, loadMeeting]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/constitution-sections")
      .then(async (res) => {
        if (!res.ok) return [];
        return (await res.json()) as ConstitutionSectionInfo[];
      })
      .then((data) => setConstitutionSections(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    const loadAmendments = async () => {
      if (!proposal) {
        setAmendments([]);
        return;
      }
      try {
        const res = await fetch(`/api/amendments?proposalId=${proposal.id}`);
        if (!res.ok) return;
        const data: Amendment[] = await res.json();
        setAmendments(data);
      } catch {
        // ignore amendment load errors
      }
    };
    loadAmendments();
  }, [proposal]);

  useEffect(() => {
    setConstitutionLinksInput(parseConstitutionLinks(proposal?.summary).join(", "));
  }, [proposal?.id, proposal?.summary]);

  useEffect(() => {
    if (!amendmentSuccess) return;
    const timeout = setTimeout(() => setAmendmentSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [amendmentSuccess]);

  useEffect(() => {
    if (!copyMessage) return;
    const timeout = setTimeout(() => setCopyMessage(null), 2000);
    return () => clearTimeout(timeout);
  }, [copyMessage]);

  useEffect(() => {
    if (!activeVersion?.id) {
      previousVoteStatusRef.current = null;
      setShowVotingModal(false);
      setVoteSessionStatus("not_open");
      setVoteSessionPassed(null);
      return;
    }

    // Never show voting modal on admin slides
    if ((proposal?.proposal_type || "proposal") === "admin") {
      previousVoteStatusRef.current = null;
      setShowVotingModal(false);
      setVoteSessionStatus("not_open");
      setVoteSessionPassed(null);
      return;
    }

    const pollVoting = async () => {
      try {
        const res = await fetch(`/api/votes?proposalVersionId=${activeVersion.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const status = String(data?.status ?? "not_open");
        const prev = previousVoteStatusRef.current;
        setVoteSessionStatus(status);
        setVoteSessionPassed(data?.passed ?? null);
        // Auto-open modal when voting becomes active (open or closed only, not tallied)
        if (
          (status === "open" || status === "closed") &&
          prev !== status
        ) {
          setShowVotingModal(true);
        }
        // Auto-close modal when voting goes back to not_open
        if (status === "not_open") {
          setShowVotingModal(false);
        }
        previousVoteStatusRef.current = status;
      } catch {
        // ignore voting poll errors
      }
    };

    pollVoting();
    const interval = setInterval(pollVoting, 2000);
    return () => clearInterval(interval);
  }, [activeVersion?.id, proposal?.proposal_type]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && currentSlide < slideCount - 1) {
        changeSlide(currentSlide + 1);
      }
      if (event.key === "ArrowLeft" && currentSlide > 0) {
        changeSlide(currentSlide - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSlide, slideCount, changeSlide]);

  const handleSubmitAmendment = async () => {
    if (!proposal || !amendText.trim()) return;
    setSubmittingAmendment(true);
    setError(null);
    setAmendmentSuccess(null);
    try {
      const res = await fetch("/api/amendments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          proposedText: amendText,
          rationale: amendRationale || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.error || "Failed to submit amendment");
      }
      setAmendText("");
      setAmendRationale("");
      setShowAmendmentForm(false);
      const refreshed = await fetch(`/api/amendments?proposalId=${proposal.id}`);
      if (refreshed.ok) setAmendments(await refreshed.json());
      setAmendmentSuccess("Amendment submitted successfully.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit amendment");
    } finally {
      setSubmittingAmendment(false);
    }
  };

  const handleReviewAmendment = async (amendmentId: string) => {
    if (!proposal) return;
    try {
      const res = await fetch("/api/amendments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amendmentId }),
      });
      if (!res.ok) throw new Error("Failed to accept amendment");
      const [proposalsRes, amendmentsRes] = await Promise.all([
        fetch(`/api/proposals?meetingId=${meeting?.id}`),
        fetch(`/api/amendments?proposalId=${proposal.id}`),
      ]);
      if (proposalsRes.ok) setProposals(await proposalsRes.json());
      if (amendmentsRes.ok) setAmendments(await amendmentsRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to accept amendment");
    }
  };

  const handleSaveConstitutionLinks = async () => {
    if (!proposal) return;
    setSavingConstitutionLinks(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          summary: buildSummaryWithConstitutionLinks(summaryText, constitutionLinksInput),
        }),
      });
      if (!res.ok) throw new Error("Failed to save constitution links");
      const proposalsRes = await fetch(`/api/proposals?meetingId=${meeting?.id}`);
      if (proposalsRes.ok) setProposals(await proposalsRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save constitution links");
    } finally {
      setSavingConstitutionLinks(false);
    }
  };

  const handleExitMeeting = async () => {
    await fetch("/api/session/release", { method: "POST" });
    router.push("/");
  };

  const handleStartVoting = async () => {
    if (!activeVersion?.id) return;
    setStartVotingError(null);
    try {
      const res = await fetch("/api/voting/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalVersionId: activeVersion.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStartVotingError(body?.error || "Failed to open voting");
        return;
      }
      setShowVotingModal(true);
    } catch {
      setStartVotingError("Network error. Could not start voting.");
    }
  };


  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/50">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  if (meetingNotFound) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
        <div className="flex items-center justify-center h-96">
          <p className="text-white/50">No live meeting found.</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
        <div className="flex items-center justify-center h-96">
          <p className="text-white/50">Loading meeting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

      {error && (
        <div className="mx-8 mt-4 bg-red-900/70 border border-red-700 text-red-200 px-4 py-2 rounded-xl flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">✕</button>
        </div>
      )}

      <main className="group relative h-[calc(100vh-74px)] overflow-hidden">
        {currentSlide > 0 && (
          <button
            onClick={() => changeSlide(currentSlide - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full border border-white/20 bg-black/40 text-white/80 hover:text-white hover:border-white/50 opacity-0 group-hover:opacity-100 transition"
            aria-label="Previous slide"
          >
            ←
          </button>
        )}
        {currentSlide < slideCount - 1 && (
          <button
            onClick={() => changeSlide(currentSlide + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full border border-white/20 bg-black/40 text-white/80 hover:text-white hover:border-white/50 opacity-0 group-hover:opacity-100 transition"
            aria-label="Next slide"
          >
            →
          </button>
        )}

        {currentSlide === 0 ? (
          <section className="h-full grid grid-cols-1 md:grid-cols-2">
            <div className="bg-[#050505] flex flex-col justify-between p-10 md:p-16">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-white/50">Current Meeting</p>
                <h1 className="text-4xl md:text-6xl font-semibold mt-5 tracking-tight leading-tight">CFC Owners Meeting 2026</h1>
              </div>
              <div className="space-y-4">
                <div className="h-16 w-16 rounded-2xl border border-white/20 bg-white/5 flex items-center justify-center text-xl tracking-[0.22em] font-semibold">
                  CFC
                </div>
                <p className="text-sm text-white/50">Annual owners meeting agenda and proposal voting deck.</p>
                <button
                  onClick={handleExitMeeting}
                  className="text-xs text-white/50 hover:text-white transition-colors"
                >
                  Exit meeting
                </button>
              </div>
            </div>
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#6d28d9_0%,transparent_45%),radial-gradient(circle_at_80%_30%,#2563eb_0%,transparent_42%),radial-gradient(circle_at_50%_80%,#0ea5e9_0%,transparent_38%),linear-gradient(135deg,#101010,#050505)]" />
              <div className="absolute inset-0 opacity-20 mix-blend-soft-light" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2790%27 height=%2790%27 viewBox=%270 0 90 90%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%272%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%2790%27 height=%2790%27 filter=%27url(%23n)%27 opacity=%270.6%27/%3E%3C/svg%3E')" }} />
              <div className="absolute bottom-8 right-8 text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">Image Slot</p>
                <p className="text-sm text-white/40">Drop in /public/title-image.jpg later</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="h-full flex flex-col px-8 py-6 md:px-14 md:py-8 overflow-hidden">
              {proposal && (proposal.proposal_type || "proposal") !== "admin" ? (
                <div className="flex flex-col h-full min-h-0">
                  {/* Proposal header card */}
                  <header className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 flex-shrink-0 flex flex-col justify-between">
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight">
                      Proposal #{currentSlide}: {proposal?.title || "Untitled Proposal"}
                    </h1>
                    <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full border border-[#0ea5e9] px-3 py-1 text-sm font-medium text-[#0ea5e9]">
                          Proposed by: {proposal?.proposed_by || "Commissioner"}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-[#0ea5e9] px-3 py-1 text-sm font-medium text-[#0ea5e9]">
                          Effective Date: {proposal?.effective_date || "TBD"}
                        </span>
                        <ConstitutionChips sections={linkedSections} />
                      </div>
                      {voteSessionStatus === "tallied" ? (
                        <button
                          onClick={() => setShowVotingModal(true)}
                          className={`rounded-lg px-6 py-3 text-base font-semibold text-white transition-colors ${
                            voteSessionPassed
                              ? "bg-green-600 hover:bg-green-500"
                              : "bg-red-600 hover:bg-red-500"
                          }`}
                        >
                          {voteSessionPassed ? "APPROVED" : "REJECTED"}
                        </button>
                      ) : isCommissioner ? (
                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={handleStartVoting}
                            className="rounded-lg bg-[#0ea5e9] px-6 py-3 text-base font-semibold text-white hover:bg-[#0ea5e9]/90 transition-colors"
                          >
                            Start Voting
                          </button>
                          {startVotingError && (
                            <p className="text-xs text-red-400">{startVotingError}</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </header>

                  {/* Three cards: Details · Pros · Cons */}
                  <div className="flex gap-4 mt-4 flex-1 min-h-0">
                    {/* Details card */}
                    <div className="flex-1 flex flex-col min-w-0">
                      <div
                        className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-auto text-sm text-white/90"
                        style={{ boxShadow: "0 0 24px 4px rgba(218,165,32,0.18), 0 0 48px 8px rgba(218,165,32,0.08)" }}
                        aria-label="Proposal details"
                      >
                        {summaryText ? (
                          isHtmlContent(summaryText) ? (
                            <div
                              className="prose prose-invert prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(summaryText) }}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap">{summaryText}</p>
                          )
                        ) : (
                          <p className="text-white/30 italic">No details added yet.</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3 justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight">Details</span>
                      </div>
                    </div>

                    {/* Pros card */}
                    <div className="flex-1 flex flex-col min-w-0">
                      <div
                        className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-auto text-sm text-white/90"
                        style={{ boxShadow: "0 0 24px 4px rgba(74,222,128,0.18), 0 0 48px 8px rgba(74,222,128,0.08)" }}
                        aria-label="Proposal pros"
                      >
                        {rationaleData.prosHtml ? (
                          <div
                            className="prose prose-invert prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rationaleData.prosHtml) }}
                          />
                        ) : rationaleData.pros.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1">
                            {rationaleData.pros.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-white/30 italic">Add pros...</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3 justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                        <span className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight">Pros</span>
                      </div>
                    </div>

                    {/* Cons card */}
                    <div className="flex-1 flex flex-col min-w-0">
                      <div
                        className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-auto text-sm text-white/90"
                        style={{ boxShadow: "0 0 24px 4px rgba(248,113,113,0.18), 0 0 48px 8px rgba(248,113,113,0.08)" }}
                        aria-label="Proposal cons"
                      >
                        {rationaleData.consHtml ? (
                          <div
                            className="prose prose-invert prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rationaleData.consHtml) }}
                          />
                        ) : rationaleData.cons.length > 0 ? (
                          <ul className="list-disc list-inside space-y-1">
                            {rationaleData.cons.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-white/30 italic">Add cons...</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3 justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                          <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
                        </svg>
                        <span className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight">Cons</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full min-h-0">
                  <header className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 flex-shrink-0 flex flex-col justify-between">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs uppercase tracking-[0.2em] text-white/40">Admin Slide</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight">
                      {proposal?.title || "General agenda item"}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                      <span className="inline-flex items-center rounded-full border border-[#0ea5e9] px-3 py-1 text-sm font-medium text-[#0ea5e9]">
                        Proposed by: {proposal?.proposed_by || "Commissioner"}
                      </span>
                      <ConstitutionChips sections={linkedSections} />
                    </div>
                  </header>
                  <div className="mt-4 flex-1 min-h-0 rounded-2xl border border-white/10 bg-white/[0.03] p-6 overflow-auto">
                    {summaryText ? (
                      isHtmlContent(summaryText) ? (
                        <div
                          className="prose prose-invert prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(summaryText) }}
                        />
                      ) : (
                        <p className="text-white/90 whitespace-pre-wrap">{summaryText}</p>
                      )
                    ) : (
                      <p className="text-white/60">This item is discussion-only. Voting is not required for this slide.</p>
                    )}
                  </div>
                </div>
              )}
          </section>
        )}
      </main>

      {showVotingModal && activeVersion?.id && (proposal?.proposal_type || "proposal") !== "admin" && (
        <VotingModal
          proposalVersionId={activeVersion.id}
          isCommissioner={isCommissioner}
          proposalTitle={proposal?.title || "Current proposal"}
          onClose={() => setShowVotingModal(false)}
        />
      )}
    </div>
  );
}
