"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import Timer from "@/components/Timer";
import { useSession } from "@/components/TeamSelector";
import { VOTE_THRESHOLD, TOTAL_OWNERS } from "@/lib/types";
import type {
  Meeting,
  AgendaSection,
  AgendaItem,
  Proposal,
  ProposalVersion,
  Vote,
  Amendment,
  Owner,
} from "@/lib/types";
import {
  getMeeting,
  getAgendaSections,
  getAgendaItems,
  getProposal,
  getProposalVersions,
  getProposalConstitutionLinks,
  setCurrentAgendaItem,
  startTimer,
  pauseTimer,
  resetTimer,
  extendTimer,
  openVoting,
  castVote,
  tallyVotes,
  getVotes,
  getMyVote,
  submitAmendment,
  getAmendments,
  promoteAmendment,
  updateMeetingStatus,
  getOwners,
} from "@/lib/actions";

interface ConstitutionLink {
  id: string;
  section: {
    id: string;
    anchor: string;
    section_title: string;
    section_num: string;
    article: { article_num: string; article_title: string };
  };
}

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-700 text-gray-300",
  in_discussion: "bg-blue-700 text-blue-100",
  voting_open: "bg-yellow-600 text-yellow-100",
  voting_closed: "bg-orange-700 text-orange-100",
  tallied: "bg-purple-700 text-purple-100",
  finalized: "bg-green-700 text-green-100",
};

export default function MeetingPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = use(params);
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [sections, setSections] = useState<AgendaSection[]>([]);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [constitutionLinks, setConstitutionLinks] = useState<ConstitutionLink[]>([]);
  const [tallyResult, setTallyResult] = useState<{ yesCount: number; noCount: number; passed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Amendment form
  const [amendText, setAmendText] = useState("");
  const [amendRationale, setAmendRationale] = useState("");
  const [submittingAmendment, setSubmittingAmendment] = useState(false);

  const currentItem = items.find((i) => i.id === meeting?.current_agenda_item_id) ?? null;
  const activeVersion = versions.find((v) => v.status === "active" || v.status === "final") ?? null;

  const loadMeetingData = useCallback(async () => {
    try {
      const m = await getMeeting(Number(year));
      if (!m) return;
      setMeeting(m);

      const [secs, itms, ownerList] = await Promise.all([
        getAgendaSections(m.id),
        getAgendaItems(m.id),
        getOwners(),
      ]);
      setSections(secs);
      setItems(itms);
      setOwners(ownerList);
    } catch {
      // ignore polling errors
    }
  }, [year]);

  const loadCurrentItemData = useCallback(async () => {
    if (!currentItem) {
      setProposal(null);
      setVersions([]);
      setVotes([]);
      setMyVote(null);
      setAmendments([]);
      setConstitutionLinks([]);
      setTallyResult(null);
      return;
    }

    if (currentItem.type === "proposal") {
      try {
        const p = await getProposal(currentItem.id);
        setProposal(p);
        if (p) {
          const [vers, links] = await Promise.all([
            getProposalVersions(p.id),
            getProposalConstitutionLinks(p.id),
          ]);
          setVersions(vers);
          setConstitutionLinks(links);

          const active = vers.find((v) => v.status === "active" || v.status === "final");
          if (active) {
            const [v, mv, amends] = await Promise.all([
              getVotes(active.id),
              getMyVote(active.id),
              getAmendments(active.id),
            ]);
            setVotes(v);
            setMyVote(mv);
            setAmendments(amends);
          }
        }
      } catch {
        // ignore
      }
    } else {
      setProposal(null);
      setVersions([]);
      setVotes([]);
      setMyVote(null);
      setAmendments([]);
      setConstitutionLinks([]);
    }
  }, [currentItem]);

  // Initial load + polling
  useEffect(() => {
    if (!session) return;
    loadMeetingData();
    const interval = setInterval(loadMeetingData, 5000);
    return () => clearInterval(interval);
  }, [session, loadMeetingData]);

  // Load current item details when it changes
  useEffect(() => {
    loadCurrentItemData();
  }, [loadCurrentItemData]);

  // Handlers
  const handleSetCurrent = async (itemId: string) => {
    if (!meeting || !isCommissioner) return;
    try {
      await setCurrentAgendaItem(meeting.id, itemId);
      setTallyResult(null);
      await loadMeetingData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to set agenda item");
    }
  };

  const handleNavItem = async (direction: "prev" | "next") => {
    if (!meeting) return;
    const idx = items.findIndex((i) => i.id === meeting.current_agenda_item_id);
    const nextIdx = direction === "next" ? idx + 1 : idx - 1;
    if (nextIdx >= 0 && nextIdx < items.length) {
      await handleSetCurrent(items[nextIdx].id);
    }
  };

  const handleCastVote = async (choice: "yes" | "no") => {
    if (!activeVersion) return;
    try {
      await castVote(activeVersion.id, choice);
      setMyVote(choice);
      const v = await getVotes(activeVersion.id);
      setVotes(v);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to cast vote");
    }
  };

  const handleOpenVoting = async () => {
    if (!currentItem) return;
    try {
      await openVoting(currentItem.id);
      await loadMeetingData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open voting");
    }
  };

  const handleTallyVotes = async () => {
    if (!currentItem) return;
    try {
      const result = await tallyVotes(currentItem.id);
      setTallyResult(result);
      await loadMeetingData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to tally votes");
    }
  };

  const handleSetMeetingLive = async () => {
    if (!meeting) return;
    try {
      await updateMeetingStatus(meeting.id, "live");
      await loadMeetingData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update meeting status");
    }
  };

  const handleFinalizeMeeting = async () => {
    if (!meeting) return;
    try {
      await updateMeetingStatus(meeting.id, "finalized");
      await loadMeetingData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to finalize meeting");
    }
  };

  const handleSubmitAmendment = async () => {
    if (!activeVersion || !amendText.trim()) return;
    setSubmittingAmendment(true);
    try {
      await submitAmendment(activeVersion.id, amendText, amendRationale || undefined);
      setAmendText("");
      setAmendRationale("");
      const amends = await getAmendments(activeVersion.id);
      setAmendments(amends);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit amendment");
    } finally {
      setSubmittingAmendment(false);
    }
  };

  const handlePromoteAmendment = async (amendmentId: string) => {
    try {
      await promoteAmendment(amendmentId);
      await loadCurrentItemData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to promote amendment");
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Please select a team to continue.</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300 underline">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-400">No meeting found for {year}.</p>
        </div>
      </div>
    );
  }

  const votedOwnerIds = new Set(votes.map((v) => v.owner_id));
  const missingVoters = owners.filter((o) => !votedOwnerIds.has(o.id));
  const currentIdx = items.findIndex((i) => i.id === meeting.current_agenda_item_id);

  // Group items by section
  const unsectioned = items.filter((i) => !i.section_id);
  const sectionMap = new Map<string, AgendaItem[]>();
  for (const item of items) {
    if (item.section_id) {
      const arr = sectionMap.get(item.section_id) || [];
      arr.push(item);
      sectionMap.set(item.section_id, arr);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/80 border border-red-700 text-red-200 px-4 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white ml-4">✕</button>
        </div>
      )}

      {/* Meeting header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Owners Meeting {meeting.club_year}</h1>
          <p className="text-sm text-gray-400">
            {meeting.meeting_date || "Date TBD"} •{" "}
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              meeting.status === "live" ? "bg-green-600 text-white" :
              meeting.status === "finalized" ? "bg-gray-600 text-gray-300" :
              "bg-yellow-600 text-black"
            }`}>
              {meeting.status.toUpperCase()}
            </span>
          </p>
        </div>
        {isCommissioner && (
          <div className="flex gap-2">
            {meeting.status === "draft" && (
              <button onClick={handleSetMeetingLive} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold">
                Set Live
              </button>
            )}
            {meeting.status === "live" && (
              <button onClick={handleFinalizeMeeting} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-semibold">
                Finalize Meeting
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex h-[calc(100vh-8rem)]">
        {/* Sidebar: Agenda list */}
        <aside className="w-80 bg-gray-900 border-r border-gray-800 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Agenda</h2>

            {/* Unsectioned items */}
            {unsectioned.map((item) => (
              <AgendaListItem
                key={item.id}
                item={item}
                isCurrent={item.id === meeting.current_agenda_item_id}
                isCommissioner={isCommissioner}
                onClick={() => handleSetCurrent(item.id)}
              />
            ))}

            {/* Sectioned items */}
            {sections.map((section) => (
              <div key={section.id} className="mt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 px-2">
                  {section.title}
                </h3>
                {(sectionMap.get(section.id) || []).map((item) => (
                  <AgendaListItem
                    key={item.id}
                    item={item}
                    isCurrent={item.id === meeting.current_agenda_item_id}
                    isCommissioner={isCommissioner}
                    onClick={() => handleSetCurrent(item.id)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Prev/Next buttons */}
          {isCommissioner && (
            <div className="p-4 border-t border-gray-800 flex gap-2">
              <button
                onClick={() => handleNavItem("prev")}
                disabled={currentIdx <= 0}
                className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm"
              >
                ← Prev
              </button>
              <button
                onClick={() => handleNavItem("next")}
                disabled={currentIdx >= items.length - 1}
                className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm"
              >
                Next →
              </button>
            </div>
          )}
        </aside>

        {/* Main: Present mode */}
        <main className="flex-1 overflow-y-auto p-6">
          {!currentItem ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>{isCommissioner ? "Select an agenda item to begin." : "Waiting for the meeting to start..."}</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Current item header */}
              <div className="flex items-start justify-between">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${STATUS_COLORS[currentItem.status]}`}>
                    {currentItem.status.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <h2 className="text-3xl font-bold mt-2">{currentItem.title}</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {currentItem.type === "proposal" ? "📋 Proposal" : "📌 Admin Item"}
                  </p>
                </div>
              </div>

              {/* Timer */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <Timer
                  durationSeconds={currentItem.timer_duration_seconds || 600}
                  startedAt={currentItem.timer_started_at}
                  remainingSeconds={currentItem.timer_remaining_seconds}
                  isCommissioner={isCommissioner}
                  onStart={() => startTimer(currentItem.id).then(loadMeetingData)}
                  onPause={() => pauseTimer(currentItem.id).then(loadMeetingData)}
                  onReset={() => resetTimer(currentItem.id).then(loadMeetingData)}
                  onExtend={() => extendTimer(currentItem.id).then(loadMeetingData)}
                />
              </div>

              {/* Proposal details */}
              {currentItem.type === "proposal" && proposal && (
                <>
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4">
                    {proposal.summary && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-1">Summary</h3>
                        <p className="text-gray-200">{proposal.summary}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {proposal.pros && (
                        <div>
                          <h3 className="text-sm font-semibold text-green-400 uppercase mb-1">Pros</h3>
                          <p className="text-gray-300 whitespace-pre-wrap">{proposal.pros}</p>
                        </div>
                      )}
                      {proposal.cons && (
                        <div>
                          <h3 className="text-sm font-semibold text-red-400 uppercase mb-1">Cons</h3>
                          <p className="text-gray-300 whitespace-pre-wrap">{proposal.cons}</p>
                        </div>
                      )}
                    </div>
                    {proposal.effective_date && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-1">Effective Date</h3>
                        <p className="text-gray-200">{proposal.effective_date}</p>
                      </div>
                    )}
                  </div>

                  {/* Active version full text */}
                  {activeVersion && (
                    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">
                        Proposal Text (v{activeVersion.version_number})
                      </h3>
                      <div className="text-gray-200 whitespace-pre-wrap bg-black/50 rounded p-4 border border-gray-700">
                        {activeVersion.full_text || <span className="text-gray-500 italic">No text provided.</span>}
                      </div>
                    </div>
                  )}

                  {/* Constitution links */}
                  {constitutionLinks.length > 0 && (
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Related Constitution Sections</h3>
                      <div className="flex flex-wrap gap-2">
                        {constitutionLinks.map((link) => (
                          <Link
                            key={link.id}
                            href={`/constitution/${link.section.anchor}`}
                            className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded border border-gray-700 text-blue-400 hover:text-blue-300"
                          >
                            Art. {link.section.article.article_num} §{link.section.section_num} – {link.section.section_title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Voting section */}
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Voting</h3>

                    {/* Owner voting buttons */}
                    {currentItem.status === "voting_open" && activeVersion && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-400 mb-2">
                          {myVote ? `You voted: ${myVote.toUpperCase()}. You may change your vote.` : "Cast your vote:"}
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleCastVote("yes")}
                            className={`px-6 py-3 rounded font-bold text-lg ${
                              myVote === "yes"
                                ? "bg-green-500 text-white ring-2 ring-green-300"
                                : "bg-green-700 hover:bg-green-600 text-white"
                            }`}
                          >
                            YES
                          </button>
                          <button
                            onClick={() => handleCastVote("no")}
                            className={`px-6 py-3 rounded font-bold text-lg ${
                              myVote === "no"
                                ? "bg-red-500 text-white ring-2 ring-red-300"
                                : "bg-red-700 hover:bg-red-600 text-white"
                            }`}
                          >
                            NO
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Commissioner voting controls */}
                    {isCommissioner && (
                      <div className="space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          {currentItem.status === "in_discussion" && (
                            <button onClick={handleOpenVoting} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-semibold">
                              Open Voting
                            </button>
                          )}
                          {currentItem.status === "voting_open" && (
                            <button
                              onClick={handleTallyVotes}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-semibold"
                            >
                              Tally Votes
                            </button>
                          )}
                        </div>

                        {/* Missing voters */}
                        {currentItem.status === "voting_open" && missingVoters.length > 0 && (
                          <div className="bg-yellow-900/30 border border-yellow-800 rounded p-3">
                            <p className="text-xs text-yellow-400 font-semibold mb-1">
                              Missing votes ({missingVoters.length} of {TOTAL_OWNERS}):
                            </p>
                            <p className="text-xs text-yellow-300">
                              {missingVoters.map((o) => o.team_name).join(", ")}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tally results */}
                    {currentItem.status === "tallied" && (
                      <div className="mt-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="bg-green-900/40 rounded-lg p-4 border border-green-800">
                            <p className="text-3xl font-bold text-green-400">
                              {votes.filter((v) => v.choice === "yes").length}
                            </p>
                            <p className="text-xs text-green-500 uppercase">Yes</p>
                          </div>
                          <div className="bg-red-900/40 rounded-lg p-4 border border-red-800">
                            <p className="text-3xl font-bold text-red-400">
                              {votes.filter((v) => v.choice === "no").length}
                            </p>
                            <p className="text-xs text-red-500 uppercase">No</p>
                          </div>
                          <div className={`rounded-lg p-4 border ${
                            votes.filter((v) => v.choice === "yes").length >= VOTE_THRESHOLD
                              ? "bg-green-900/40 border-green-800"
                              : "bg-red-900/40 border-red-800"
                          }`}>
                            <p className={`text-3xl font-bold ${
                              votes.filter((v) => v.choice === "yes").length >= VOTE_THRESHOLD
                                ? "text-green-400"
                                : "text-red-400"
                            }`}>
                              {votes.filter((v) => v.choice === "yes").length >= VOTE_THRESHOLD ? "PASS" : "FAIL"}
                            </p>
                            <p className="text-xs text-gray-500 uppercase">
                              Requires {VOTE_THRESHOLD} Yes
                            </p>
                          </div>
                        </div>
                        {tallyResult && (
                          <p className="text-sm text-gray-400 mt-2 text-center">
                            {tallyResult.yesCount} yes / {tallyResult.noCount} no – {tallyResult.passed ? "Passed ✓" : "Failed ✗"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Amendments */}
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Amendments</h3>

                    {/* Submit amendment form */}
                    {activeVersion && currentItem.status !== "tallied" && currentItem.status !== "finalized" && (
                      <div className="mb-4 space-y-2 bg-black/50 rounded p-4 border border-gray-700">
                        <textarea
                          value={amendText}
                          onChange={(e) => setAmendText(e.target.value)}
                          placeholder="Proposed amendment text..."
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white placeholder-gray-500 min-h-[80px]"
                        />
                        <textarea
                          value={amendRationale}
                          onChange={(e) => setAmendRationale(e.target.value)}
                          placeholder="Rationale (optional)"
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white placeholder-gray-500"
                        />
                        <button
                          onClick={handleSubmitAmendment}
                          disabled={!amendText.trim() || submittingAmendment}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm font-semibold"
                        >
                          {submittingAmendment ? "Submitting..." : "Submit Amendment"}
                        </button>
                      </div>
                    )}

                    {/* Amendment list */}
                    {amendments.length === 0 ? (
                      <p className="text-sm text-gray-500">No amendments submitted.</p>
                    ) : (
                      <div className="space-y-3">
                        {amendments.map((a) => (
                          <div key={a.id} className="bg-black/50 rounded p-3 border border-gray-700">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm text-gray-200 whitespace-pre-wrap">{a.suggested_text}</p>
                                {a.rationale && (
                                  <p className="text-xs text-gray-400 mt-1 italic">Rationale: {a.rationale}</p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  Status: <span className="font-semibold">{a.status}</span>
                                </p>
                              </div>
                              {isCommissioner && a.status === "submitted" && (
                                <button
                                  onClick={() => handlePromoteAmendment(a.id)}
                                  className="ml-3 px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs font-semibold flex-shrink-0"
                                >
                                  Promote
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function AgendaListItem({
  item,
  isCurrent,
  isCommissioner,
  onClick,
}: {
  item: AgendaItem;
  isCurrent: boolean;
  isCommissioner: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!isCommissioner}
      className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
        isCurrent
          ? "bg-blue-900/60 border border-blue-700 text-white"
          : isCommissioner
          ? "hover:bg-gray-800 text-gray-300"
          : "text-gray-300 cursor-default"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          item.status === "not_started" ? "bg-gray-600" :
          item.status === "in_discussion" ? "bg-blue-500" :
          item.status === "voting_open" ? "bg-yellow-500 animate-pulse" :
          item.status === "tallied" ? "bg-purple-500" :
          item.status === "finalized" ? "bg-green-500" :
          "bg-gray-600"
        }`} />
        <span className="text-sm truncate">{item.title}</span>
      </div>
      <div className="flex items-center gap-1 mt-0.5 ml-4">
        <span className="text-[10px] text-gray-500">{item.type === "proposal" ? "📋" : "📌"}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[item.status]}`}>
          {item.status.replace(/_/g, " ")}
        </span>
      </div>
    </button>
  );
}
