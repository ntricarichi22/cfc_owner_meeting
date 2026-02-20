"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import type {
  Meeting,
  AgendaItem,
  Proposal,
  ProposalVersion,
  Amendment,
} from "@/lib/types";

export default function MeetingOwnerPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<(Proposal & { proposal_versions?: ProposalVersion[] })[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendText, setAmendText] = useState("");
  const [amendRationale, setAmendRationale] = useState("");
  const [submittingAmendment, setSubmittingAmendment] = useState(false);
  const [amendmentSuccess, setAmendmentSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingNotFound, setMeetingNotFound] = useState(false);
  const canSubmitAmendment = session?.team_name === "Virginia Founders";

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;
  const selectedIdx = items.findIndex((i) => i.id === selectedItemId);

  // Find proposal for the selected agenda item
  const proposal = proposals.find((p) => p.agenda_item_id === selectedItemId) ?? null;
  const activeVersion = proposal?.proposal_versions?.find((v) => v.is_active) ?? null;

  // Redirect if no session
  useEffect(() => {
    if (!sessionLoading && !session) {
      router.replace("/");
    }
  }, [session, sessionLoading, router]);

  // Fetch live meeting
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

      // Load agenda items
      const itemsRes = await fetch(`/api/agenda-items?meetingId=${m.id}`);
      if (itemsRes.ok) {
        const agendaItems: AgendaItem[] = await itemsRes.json();
        setItems(agendaItems);

        // Default selection: first item
        setSelectedItemId((prev) => {
          if (prev && agendaItems.some((i) => i.id === prev)) return prev;
          return agendaItems[0]?.id ?? null;
        });
      }

      // Load proposals
      const proposalsRes = await fetch(`/api/proposals?meetingId=${m.id}`);
      if (proposalsRes.ok) {
        setProposals(await proposalsRes.json());
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  // Poll meeting data
  useEffect(() => {
    if (!session) return;
    loadMeeting();
    const interval = setInterval(loadMeeting, 5000);
    return () => clearInterval(interval);
  }, [session, loadMeeting]);

  // Handlers
  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
  };

  const handleNav = (direction: "prev" | "next") => {
    const nextIdx = direction === "next" ? selectedIdx + 1 : selectedIdx - 1;
    if (nextIdx >= 0 && nextIdx < items.length) {
      setSelectedItemId(items[nextIdx].id);
    }
  };

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
    if (!amendmentSuccess) return;
    const timeout = setTimeout(() => setAmendmentSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [amendmentSuccess]);

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

  const handleReviewAmendment = async (amendmentId: string, action: "accept" | "reject") => {
    if (!proposal) return;
    try {
      const res = await fetch("/api/amendments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amendmentId, action }),
      });
      if (!res.ok) throw new Error(`Failed to ${action} amendment`);
      const [proposalsRes, amendmentsRes] = await Promise.all([
        fetch(`/api/proposals?meetingId=${meeting?.id}`),
        fetch(`/api/amendments?proposalId=${proposal.id}`),
      ]);
      if (proposalsRes.ok) setProposals(await proposalsRes.json());
      if (amendmentsRes.ok) setAmendments(await amendmentsRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action} amendment`);
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  if (meetingNotFound) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-400">No live meeting found.</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-400">Loading meeting...</p>
        </div>
      </div>
    );
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
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold">{meeting.title}</h1>
        <p className="text-sm text-gray-400">
          {meeting.year} •{" "}
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-600 text-white">
            LIVE
          </span>
        </p>
      </div>

      <div className="flex h-[calc(100vh-8rem)]">
        {/* Sidebar: Agenda list */}
        <aside className="w-80 bg-gray-900 border-r border-gray-800 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Agenda</h2>
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectItem(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                  item.id === selectedItemId
                    ? "bg-blue-900/60 border border-blue-700 text-white"
                    : "hover:bg-gray-800 text-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate">{item.title}</span>
                </div>
                <span className="text-[10px] text-gray-500 ml-4">
                  {item.category === "proposal" ? "📋 Proposal" : "📌 General"}
                </span>
              </button>
            ))}
          </div>

          {/* Prev/Next buttons */}
          <div className="p-4 border-t border-gray-800 flex gap-2">
            <button
              onClick={() => handleNav("prev")}
              disabled={selectedIdx <= 0}
              className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm"
            >
              ← Prev
            </button>
            <button
              onClick={() => handleNav("next")}
              disabled={selectedIdx >= items.length - 1}
              className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm"
            >
              Next →
            </button>
          </div>
        </aside>

        {/* Main: selected proposal */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedItem ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Select an agenda item to view details.</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Item header */}
              <div>
                <h2 className="text-3xl font-bold">{selectedItem.title}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {selectedItem.category === "proposal" ? "📋 Proposal" : "📌 General Item"}
                </p>
              </div>

              {/* Proposal details */}
              {selectedItem.category === "proposal" && proposal && (
                <>
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4">
                    {proposal.summary && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-1">Summary</h3>
                        <p className="text-gray-200">{proposal.summary}</p>
                      </div>
                    )}
                    {proposal.effective_date && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase mb-1">Effective Date</h3>
                        <p className="text-gray-200">{proposal.effective_date}</p>
                      </div>
                    )}
                  </div>

                  {/* Active version text */}
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

                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase">Amendments</h3>
                      {canSubmitAmendment && (
                        <button
                          onClick={() => setShowAmendmentForm((v) => !v)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-semibold"
                        >
                          Submit Amendment
                        </button>
                      )}
                    </div>

                    {amendmentSuccess && <p className="text-xs text-green-400">{amendmentSuccess}</p>}

                    {canSubmitAmendment && showAmendmentForm && (
                      <div className="space-y-2 bg-black/50 rounded p-4 border border-gray-700">
                        <textarea
                          value={amendText}
                          onChange={(e) => setAmendText(e.target.value)}
                          placeholder="Suggested text"
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white placeholder-gray-500 min-h-[80px]"
                        />
                        <textarea
                          value={amendRationale}
                          onChange={(e) => setAmendRationale(e.target.value)}
                          placeholder="Rationale"
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white placeholder-gray-500"
                        />
                        <button
                          onClick={handleSubmitAmendment}
                          disabled={!amendText.trim() || submittingAmendment}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm font-semibold"
                        >
                          {submittingAmendment ? "Submitting..." : "Submit"}
                        </button>
                      </div>
                    )}

                    {amendments.length === 0 ? (
                      <p className="text-sm text-gray-500">No amendments submitted.</p>
                    ) : (
                      <div className="space-y-3">
                        {amendments.map((a) => (
                          <div key={a.id} className="bg-black/50 rounded p-3 border border-gray-700">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <p className="text-sm text-gray-200 whitespace-pre-wrap">{a.proposed_text}</p>
                                {a.rationale && (
                                  <p className="text-xs text-gray-400 mt-1 italic">Rationale: {a.rationale}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  {a.submitted_by_team && (
                                    <span className="text-xs text-gray-500">by {a.submitted_by_team}</span>
                                  )}
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                                    a.status === "accepted" ? "bg-green-800 text-green-200" :
                                    a.status === "rejected" ? "bg-red-800 text-red-200" :
                                    "bg-yellow-800 text-yellow-200"
                                  }`}>
                                    {a.status}
                                  </span>
                                </div>
                              </div>
                              {isCommissioner && a.status === "pending" && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleReviewAmendment(a.id, "accept")}
                                    className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs font-semibold"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={() => handleReviewAmendment(a.id, "reject")}
                                    className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-semibold"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* General item placeholder */}
              {selectedItem.category !== "proposal" && (
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <p className="text-gray-400 italic">General / Discussion Item</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
