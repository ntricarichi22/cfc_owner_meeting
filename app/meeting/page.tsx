"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import VotingPanel from "@/components/VotingPanel";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";
import type {
  Meeting,
  AgendaItem,
  Proposal,
  ProposalVersion,
  Amendment,
  ConstitutionSection,
} from "@/lib/types";

const CONSTITUTION_LINKS_PREFIX = "[CONSTITUTION_LINKS:";
const MAX_VISIBLE_SECTIONS = 24;

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

export default function MeetingOwnerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [proposals, setProposals] = useState<(Proposal & { proposal_versions?: ProposalVersion[] })[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [constitutionSections, setConstitutionSections] = useState<ConstitutionSection[]>([]);
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

  const canSubmitAmendment = session?.team_name === COMMISSIONER_TEAM_NAME;
  const slideCount = items.length + 1;
  const slideParam = Number(searchParams.get("slide") ?? "0");
  const parsedSlide = Number.isFinite(slideParam) && slideParam >= 0 ? Math.floor(slideParam) : 0;
  const currentSlide = Math.min(parsedSlide, Math.max(0, slideCount - 1));
  const currentItem = currentSlide > 0 ? items[currentSlide - 1] : null;
  const proposal = proposals.find((p) => p.agenda_item_id === currentItem?.id) ?? null;
  const activeVersion = proposal?.proposal_versions?.find((v) => v.is_active) ?? null;
  const summaryText = summaryWithoutConstitutionLinks(proposal?.summary);
  const constitutionLinks = parseConstitutionLinks(proposal?.summary);
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

      const [itemsRes, proposalsRes] = await Promise.all([
        fetch(`/api/agenda-items?meetingId=${m.id}`),
        fetch(`/api/proposals?meetingId=${m.id}`),
      ]);

      if (itemsRes.ok) {
        const agendaItems: AgendaItem[] = await itemsRes.json();
        setItems(agendaItems);
      }

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
        return (await res.json()) as ConstitutionSection[];
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
      return;
    }

    const pollVoting = async () => {
      try {
        const res = await fetch(`/api/votes?proposalVersionId=${activeVersion.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const status = String(data?.status ?? "not_open");
        if (status === "open" && previousVoteStatusRef.current !== "open") {
          setShowVotingModal(true);
        }
        if (status !== "open") {
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
  }, [activeVersion?.id]);

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

  const chipValues = useMemo(
    () => [
      { label: "ITEM", value: currentSlide === 0 ? "TITLE" : `#${currentSlide}` },
      { label: "TYPE", value: currentItem?.category?.toUpperCase() || "INTRO" },
      { label: "MEETING", value: String(meeting?.year ?? new Date().getFullYear()) },
    ],
    [currentSlide, currentItem?.category, meeting?.year],
  );

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
          <section className="h-full overflow-auto px-8 py-8 md:px-14 md:py-12">
            <div className="max-w-7xl mx-auto space-y-6">
              <header className="border border-white/10 bg-white/[0.03] rounded-2xl p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-white/40">{meeting.title}</p>
                <h2 className="text-4xl md:text-6xl font-semibold tracking-[0.05em] mt-2">
                  {(currentItem?.category === "proposal" ? "PROPOSAL" : "AGENDA ITEM")} #{currentSlide}
                </h2>
                <p className="text-lg text-white/70 mt-3">{currentItem?.title || "Untitled agenda item"}</p>
                <div className="flex flex-wrap gap-2 mt-5">
                  {chipValues.map((chip) => (
                    <span key={chip.label} className="px-3 py-1 text-xs rounded-full border border-white/15 bg-white/[0.04] text-white/70">
                      {chip.label}: {chip.value}
                    </span>
                  ))}
                </div>
              </header>

              {currentItem?.category === "proposal" ? (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                    <h3 className="text-xs uppercase tracking-[0.2em] text-white/40">Summary</h3>
                    <p className="text-sm text-white/80 whitespace-pre-wrap">{summaryText || "No summary provided."}</p>
                    <div>
                      <h4 className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Constitution Links</h4>
                      {constitutionLinks.length === 0 ? (
                        <p className="text-xs text-white/40">No linked sections.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {constitutionLinks.map((link) => (
                            <span key={link} className="text-xs px-2 py-1 rounded-md border border-blue-400/30 bg-blue-500/10 text-blue-200">{link}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {isCommissioner && proposal && (
                      <div className="space-y-2">
                        <label className="text-xs text-white/50 block">Edit constitution links (comma-separated)</label>
                        <input
                          value={constitutionLinksInput}
                          onChange={(e) => setConstitutionLinksInput(e.target.value)}
                          className="w-full bg-black/40 border border-white/15 rounded p-2 text-sm text-white"
                          placeholder="3.2, 4.1(b)"
                        />
                        <button
                          onClick={handleSaveConstitutionLinks}
                          disabled={savingConstitutionLinks}
                          className="text-xs px-3 py-1.5 rounded border border-white/20 hover:border-white/40 disabled:opacity-40"
                        >
                          {savingConstitutionLinks ? "Saving..." : "Save links"}
                        </button>
                      </div>
                    )}
                  </article>

                  <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                    <h3 className="text-xs uppercase tracking-[0.2em] text-white/40">Proposal Text</h3>
                    <p className="text-xs text-white/50">Version {activeVersion?.version_number ?? "—"}</p>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-4 max-h-80 overflow-auto text-sm whitespace-pre-wrap text-white/80">
                      {activeVersion?.full_text || "No proposal text provided."}
                    </div>
                    <p className="text-xs text-white/50">Effective date: {proposal?.effective_date || "TBD"}</p>
                    <VotingPanel proposalVersionId={activeVersion?.id} isCommissioner={isCommissioner} />
                  </article>

                  <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs uppercase tracking-[0.2em] text-white/40">Amendments & References</h3>
                      {canSubmitAmendment && (
                        <button
                          onClick={() => setShowAmendmentForm((v) => !v)}
                          className="text-xs px-2.5 py-1 rounded border border-white/20 hover:border-white/40"
                        >
                          {showAmendmentForm ? "Close" : "Add"}
                        </button>
                      )}
                    </div>

                    {amendmentSuccess && <p className="text-xs text-green-300">{amendmentSuccess}</p>}

                    {canSubmitAmendment && showAmendmentForm && (
                      <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
                        <textarea
                          value={amendText}
                          onChange={(e) => setAmendText(e.target.value)}
                          placeholder="Suggested text"
                          className="w-full bg-black/50 border border-white/15 rounded p-2 text-sm min-h-[72px]"
                        />
                        <textarea
                          value={amendRationale}
                          onChange={(e) => setAmendRationale(e.target.value)}
                          placeholder="Rationale"
                          className="w-full bg-black/50 border border-white/15 rounded p-2 text-sm"
                        />
                        <button
                          onClick={handleSubmitAmendment}
                          disabled={!amendText.trim() || submittingAmendment}
                          className="text-xs px-3 py-1.5 rounded border border-white/20 hover:border-white/40 disabled:opacity-40"
                        >
                          {submittingAmendment ? "Submitting..." : "Submit amendment"}
                        </button>
                      </div>
                    )}

                    <div className="space-y-2 max-h-48 overflow-auto">
                      {amendments.length === 0 ? (
                        <p className="text-xs text-white/40">No amendments submitted.</p>
                      ) : (
                        amendments.map((a) => (
                          <div key={a.id} className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                            <p className="text-xs text-white/80 whitespace-pre-wrap">{a.proposed_text}</p>
                            {a.rationale && <p className="text-[11px] text-white/50 mt-1">Rationale: {a.rationale}</p>}
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[11px] text-white/40">{a.submitted_by_team || "Unknown team"}</span>
                              {isCommissioner && (a.status === "pending" || a.status === "submitted") && (
                                <button
                                  onClick={() => handleReviewAmendment(a.id)}
                                  className="text-[11px] px-2 py-0.5 rounded border border-white/20 hover:border-white/40"
                                >
                                  Accept
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {copyMessage && <p className="text-xs text-green-300">{copyMessage}</p>}
                    {constitutionSections.length > MAX_VISIBLE_SECTIONS && (
                      <p className="text-[11px] text-white/40">Showing first {MAX_VISIBLE_SECTIONS} sections.</p>
                    )}
                    <div className="space-y-2 max-h-36 overflow-auto">
                      {constitutionSections.slice(0, MAX_VISIBLE_SECTIONS).map((section) => {
                        const fragment = `#${constitutionAnchorId(section.section_key)}`;
                        return (
                          <button
                            id={constitutionAnchorId(section.section_key)}
                            key={section.id}
                            onClick={async () => {
                              const deepLink = `${window.location.origin}/meeting${fragment}`;
                              await navigator.clipboard.writeText(deepLink).catch(() => {});
                              setCopyMessage(`Copied ${fragment}`);
                            }}
                            className="w-full text-left rounded border border-white/10 bg-black/30 p-2 hover:border-white/30"
                          >
                            <p className="text-[11px] text-blue-200">{section.section_key}</p>
                            <p className="text-xs text-white/70 truncate">{section.title}</p>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
                  <h3 className="text-xs uppercase tracking-[0.2em] text-white/40">Admin Slide</h3>
                  <p className="text-3xl mt-3 font-medium">{currentItem?.title || "General agenda item"}</p>
                  <p className="text-white/60 mt-3 max-w-3xl">This item is discussion-only. Voting is not required for this slide.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {showVotingModal && activeVersion?.id && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-[#0b0b0b] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/50">Voting in progress</p>
                <p className="text-lg font-medium">{currentItem?.title || "Current proposal"}</p>
              </div>
              <button onClick={() => setShowVotingModal(false)} className="text-white/60 hover:text-white text-sm">Close</button>
            </div>
            <VotingPanel proposalVersionId={activeVersion.id} isCommissioner={isCommissioner} />
          </div>
        </div>
      )}
    </div>
  );
}
