"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import RichTextViewer from "@/components/RichTextViewer";
import { useSession } from "@/components/TeamSelector";
import VotingModal from "@/components/VotingModal";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import { isHtmlContent, isEmptyHtml } from "@/lib/html-utils";
import { Chip, PopCard, NeutralButton } from "@/components/ui/primitives";
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

function ConstitutionChips({ sections, chipClassName }: { sections: ConstitutionSectionInfo[]; chipClassName?: string }) {
  if (chipClassName) {
    const items =
      sections.length > 0
        ? sections.map((sec) => ({ key: sec.id, href: constitutionChipHref(sec), label: constitutionChipLabel(sec) }))
        : [{ key: "default", href: "/constitution", label: "Constitution" }];
    return (
      <>
        {items.map((item) => (
          <span key={item.key} className={`inline-flex items-center rounded-full cursor-pointer ${chipClassName}`}>
            <a href={item.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
              {item.label} ↗
            </a>
          </span>
        ))}
      </>
    );
  }
  if (sections.length > 0) {
    return (
      <>
        {sections.map((sec) => (
          <Chip key={sec.id} className="text-sm px-3 py-1 cursor-pointer bg-[var(--card-surface)] text-[var(--ink)] shadow-[3px_3px_0_var(--shadow)]">
            <a
              href={constitutionChipHref(sec)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
            >
              {constitutionChipLabel(sec)} ↗
            </a>
          </Chip>
        ))}
      </>
    );
  }
  return (
    <Chip className="text-sm px-3 py-1 cursor-pointer bg-[var(--card-surface)] text-[var(--ink)] shadow-[3px_3px_0_var(--shadow)]">
      <a
        href="/constitution"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1"
      >
        Constitution ↗
      </a>
    </Chip>
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
      setShowVotingModal(false);
      setVoteSessionStatus("not_open");
      setVoteSessionPassed(null);
      return;
    }

    // Never show voting modal on admin slides
    if ((proposal?.proposal_type || "proposal") === "admin") {
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
        setVoteSessionStatus(status);
        setVoteSessionPassed(data?.passed ?? null);
        // Close modal automatically only when voting is reset to not_open
        if (status === "not_open") {
          setShowVotingModal(false);
        }
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
      <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] flex items-center justify-center">
        <p className="text-[rgba(11,11,15,0.6)]">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  if (meetingNotFound) {
    return (
      <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
        <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
        <div className="flex items-center justify-center h-96">
          <p className="text-[rgba(11,11,15,0.6)]">No live meeting found.</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
        <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
        <div className="flex items-center justify-center h-96">
          <p className="text-[rgba(11,11,15,0.6)]">Loading meeting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

      {error && (
        <PopCard className="mx-8 mt-4 flex justify-between items-center border-[var(--accent-red)]">
          <span className="font-semibold text-[var(--accent-red)]">{error}</span>
          <button onClick={() => setError(null)} className="text-[var(--accent-red)] hover:text-[var(--ink)] ml-4">✕</button>
        </PopCard>
      )}

      <main className="group relative h-[calc(100vh-64px)] overflow-hidden px-4 md:px-8 pb-8">
        {currentSlide > 0 && (
          <button
            onClick={() => changeSlide(currentSlide - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full border-[var(--border-width)] border-[var(--border)] bg-[var(--card-surface)] text-[var(--ink)] shadow-[var(--shadow-style)] hover:-translate-x-[2px] hover:shadow-[5px_5px_0_var(--shadow)] transition-transform"
            aria-label="Previous slide"
          >
            ←
          </button>
        )}
        {currentSlide < slideCount - 1 && (
          <button
            onClick={() => changeSlide(currentSlide + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full border-[var(--border-width)] border-[var(--border)] bg-[var(--card-surface)] text-[var(--ink)] shadow-[var(--shadow-style)] hover:translate-x-[2px] hover:shadow-[5px_5px_0_var(--shadow)] transition-transform"
            aria-label="Next slide"
          >
            →
          </button>
        )}

        {currentSlide === 0 ? (
          <section className="h-full py-6">
            {/* Title slide – split block design */}
            <div className="h-full flex overflow-hidden border-4 border-[#111111] shadow-[6px_6px_0_#111111]">
              {/* Left panel – paper, ~60% */}
              <div className="flex flex-[3] flex-col min-h-0 bg-[#F6F0E6] relative">
                {/* Top area: main title text */}
                <div className="flex-1 flex flex-col justify-center px-8 md:px-12 pt-8">
                  <h1 className="font-black uppercase leading-none text-[#111111] text-5xl md:text-7xl lg:text-8xl tracking-tight">
                    2026<br />CFC<br />Owners<br />Meeting
                  </h1>
                </div>
                {/* Horizontal rule */}
                <div className="h-px bg-[#111111] mx-8 md:mx-12" />
                {/* Bottom area: date badge + exit */}
                <div className="flex items-center justify-between px-8 md:px-12 py-6 flex-wrap gap-3">
                  <span className="inline-flex items-center bg-[#BF8F00] border-2 border-[#111111] px-5 py-2 shadow-[4px_4px_0_#111111] font-black uppercase tracking-widest text-sm md:text-base text-[#111111]">
                    March 1, 2026
                  </span>
                  <NeutralButton onClick={handleExitMeeting} className="text-sm px-4 py-2">Exit meeting</NeutralButton>
                </div>
              </div>

              {/* Right panel – blue, ~40% */}
              <div className="flex flex-[2] items-center justify-center bg-[#22A3FF] border-l-4 border-[#111111] relative overflow-hidden">
                {/* Watermark CFC */}
                <span
                  className="text-[9rem] md:text-[12rem] font-black italic tracking-tight select-none pointer-events-none"
                  style={{ color: "rgba(255,255,255,0.15)", fontFamily: "Impact, 'Arial Narrow', sans-serif" }}
                  aria-hidden
                >
                  CFC
                </span>
              </div>
            </div>
          </section>
        ) : (
          <section className="h-full flex flex-col gap-4 py-6">
            {proposal && (proposal.proposal_type || "proposal") !== "admin" ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-4 border-[#111111] shadow-[6px_6px_0_#111111]">
                {/* Header band */}
                <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-4 bg-[#F6F1E7] border-b-4 border-[#111111]">
                  <div className="flex min-w-0 flex-col gap-2">
                    <h1
                      className="text-2xl md:text-3xl lg:text-5xl font-black uppercase leading-none tracking-tight text-[#111111]"
                      style={{ fontFamily: "var(--font-bebas, 'Bebas Neue', Impact, 'Arial Narrow', sans-serif)" }}
                    >
                      Proposal #{currentSlide}:&nbsp;{proposal?.title || "Untitled Proposal"}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF3B30] text-white border-2 border-[#111111] shadow-[3px_3px_0_#111111]">
                        Proposed by:&nbsp;{proposal?.proposed_by || "Commissioner"}
                      </span>
                      <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF3B30] text-white border-2 border-[#111111] shadow-[3px_3px_0_#111111]">
                        Effective Date:&nbsp;{proposal?.effective_date || "TBD"}
                      </span>
                      <ConstitutionChips
                        sections={linkedSections}
                        chipClassName="text-xs px-3 py-0.5 font-bold uppercase tracking-wide bg-[#FF3B30] text-white border-2 border-[#111111] shadow-[3px_3px_0_#111111]"
                      />
                    </div>
                  </div>
                  {voteSessionStatus === "tallied" ? (
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {voteSessionPassed ? (
                        <button
                          onClick={() => setShowVotingModal(true)}
                          className="px-5 py-3 font-black uppercase tracking-wide text-base text-white bg-[#16A34A] border-4 border-[#111111] shadow-[6px_6px_0_#111111] rounded-xl transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                        >
                          APPROVED
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowVotingModal(true)}
                          className="px-5 py-3 font-black uppercase tracking-wide text-base text-white bg-[#DC2626] border-4 border-[#111111] shadow-[6px_6px_0_#111111] rounded-xl transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                        >
                          REJECTED
                        </button>
                      )}
                    </div>
                  ) : isCommissioner ? (
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <button
                        onClick={handleStartVoting}
                        className="px-5 py-3 font-black uppercase tracking-wide text-xl text-white bg-[#BF8F00] border-4 border-[#111111] shadow-[6px_6px_0_#111111] rounded-xl transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                      >
                        START VOTING
                      </button>
                      {startVotingError && (
                        <p className="text-xs text-[#DC2626]">{startVotingError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <button
                        onClick={() => setShowVotingModal(true)}
                        disabled={voteSessionStatus !== "open"}
                        className="px-5 py-3 font-black uppercase tracking-wide text-xl text-white bg-[#BF8F00] border-4 border-[#111111] shadow-[6px_6px_0_#111111] rounded-xl transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0"
                      >
                        VOTE NOW
                      </button>
                    </div>
                  )}
                </div>

                {/* Content area */}
                <div className="flex flex-1 min-h-0 bg-[#F6F1E7]">
                  {/* Details panel (~60%) */}
                  <div className="flex flex-[3] min-w-0 flex-col min-h-0 bg-[#22A3FF] border-r-4 border-[#111111]">
                    <div className="shrink-0 flex items-center gap-2 px-5 pt-4 pb-2">
                      <span aria-hidden className="text-white text-2xl leading-none">📋</span>
                      <span
                        className="text-3xl font-black uppercase text-white tracking-wide"
                        style={{ fontFamily: "var(--font-bebas, 'Bebas Neue', Impact, 'Arial Narrow', sans-serif)" }}
                      >
                        Details
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 max-w-full min-h-0 overflow-y-auto overflow-x-hidden px-5 pb-5 slide-content-card proposal-richtext whitespace-pre-wrap break-normal hyphens-none text-white [&_*]:text-white [&_*]:opacity-100">
                      {summaryText ? (
                        <RichTextViewer
                          html={isHtmlContent(summaryText) ? summaryText : null}
                          text={!isHtmlContent(summaryText) ? summaryText : null}
                          invert={true}
                          className="text-white [&_*]:text-white"
                        />
                      ) : (
                        <p className="italic text-white/80">No details added yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Pros + Cons (~40%) */}
                  <div className="flex flex-[2] min-w-0 flex-col min-h-0 gap-4 p-4">
                    <div
                      className="flex flex-1 flex-col min-h-0 overflow-hidden bg-[#F6F1E7] border-4 border-[#111111] shadow-[6px_6px_0_#111111] rounded-2xl p-4 slide-content-card"
                      aria-label="Proposal pros"
                    >
                      <div className="shrink-0 flex items-center gap-2 mb-2">
                        <span aria-hidden className="text-[#111111] text-xl leading-none">👍</span>
                        <span
                          className="text-2xl font-black uppercase text-[#111111]"
                          style={{ fontFamily: "var(--font-bebas, 'Bebas Neue', Impact, 'Arial Narrow', sans-serif)" }}
                        >
                          Pros
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 max-w-full min-h-0 overflow-y-auto overflow-x-hidden proposal-richtext whitespace-pre-wrap break-normal hyphens-none text-sm leading-relaxed text-[#111111] [&_*]:text-[#111111] [&_*]:opacity-100">
                        {rationaleData.prosHtml ? (
                          <RichTextViewer html={rationaleData.prosHtml} invert={false} className="text-[#111111] prose-headings:text-[#111111] prose-strong:text-[#111111] prose-em:text-[#111111]" />
                        ) : rationaleData.pros.length > 0 ? (
                          <RichTextViewer items={rationaleData.pros} invert={false} className="text-[#111111] prose-headings:text-[#111111] prose-strong:text-[#111111] prose-em:text-[#111111]" />
                        ) : (
                          <p className="text-[rgba(11,11,15,0.7)] italic">Add pros...</p>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex flex-1 flex-col min-h-0 overflow-hidden bg-[#F6F1E7] border-4 border-[#111111] shadow-[6px_6px_0_#111111] rounded-2xl p-4 slide-content-card"
                      aria-label="Proposal cons"
                    >
                      <div className="shrink-0 flex items-center gap-2 mb-2">
                        <span aria-hidden className="text-[#111111] text-xl leading-none">👎</span>
                        <span
                          className="text-2xl font-black uppercase text-[#111111]"
                          style={{ fontFamily: "var(--font-bebas, 'Bebas Neue', Impact, 'Arial Narrow', sans-serif)" }}
                        >
                          Cons
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 max-w-full min-h-0 overflow-y-auto overflow-x-hidden proposal-richtext whitespace-pre-wrap break-normal hyphens-none text-sm leading-relaxed text-[#111111] [&_*]:text-[#111111] [&_*]:opacity-100">
                        {rationaleData.consHtml ? (
                          <RichTextViewer html={rationaleData.consHtml} invert={false} className="text-[#111111] prose-headings:text-[#111111] prose-strong:text-[#111111] prose-em:text-[#111111]" />
                        ) : rationaleData.cons.length > 0 ? (
                          <RichTextViewer items={rationaleData.cons} invert={false} className="text-[#111111] prose-headings:text-[#111111] prose-strong:text-[#111111] prose-em:text-[#111111]" />
                        ) : (
                          <p className="text-[rgba(11,11,15,0.7)] italic">Add cons...</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-4 border-[#111111] shadow-[6px_6px_0_#111111]">
                {/* Header band – same styling system as proposal slides */}
                <div className="shrink-0 flex items-start gap-4 px-5 py-4 bg-[#F6F1E7] border-b-4 border-[#111111]">
                  <div className="flex min-w-0 flex-col gap-2">
                    <h1
                      className="text-2xl md:text-3xl lg:text-5xl font-black uppercase leading-none tracking-tight text-[#111111]"
                      style={{ fontFamily: "var(--font-bebas, 'Bebas Neue', Impact, 'Arial Narrow', sans-serif)" }}
                    >
                      {proposal?.title || "General Agenda Item"}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF3B30] text-white border-2 border-[#111111] shadow-[3px_3px_0_#111111]">
                        Proposed by:&nbsp;{proposal?.proposed_by || "Commissioner"}
                      </span>
                      {proposal?.effective_date && (
                        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF3B30] text-white border-2 border-[#111111] shadow-[3px_3px_0_#111111]">
                          Effective Date:&nbsp;{proposal.effective_date}
                        </span>
                      )}
                      {linkedSections.length > 0 ? (
                        <ConstitutionChips
                          sections={linkedSections}
                          chipClassName="text-xs px-3 py-0.5 font-bold uppercase tracking-wide bg-[#FF3B30] text-white border-2 border-[#111111] shadow-[3px_3px_0_#111111]"
                        />
                      ) : (
                        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-[#FF3B30] text-white border-2 border-[#111111] shadow-[3px_3px_0_#111111]">
                          No Articles Involved
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content area – blue mat surrounding paper card */}
                <div className="flex flex-1 min-h-0 bg-[#22A3FF] p-4">
                  <div className="flex-1 min-h-0 overflow-y-auto bg-[#F6F1E7] border-4 border-[#111111] shadow-[6px_6px_0_#111111] rounded-2xl p-5 admin-richtext slide-content-card admin-slide-content">
                    {summaryText ? (
                      <div className="overflow-x-auto max-w-full">
                        <RichTextViewer
                          html={isHtmlContent(summaryText) ? summaryText : null}
                          text={!isHtmlContent(summaryText) ? summaryText : null}
                          invert={false}
                          className="text-[#111111] [&_*]:text-[#111111] [&_*]:opacity-100"
                        />
                      </div>
                    ) : (
                      <p className="italic text-[rgba(11,11,15,0.6)]">This item is discussion-only. Voting is not required for this slide.</p>
                    )}
                  </div>
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
