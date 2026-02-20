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
} from "@/lib/types";

export default function PresenterPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [proposals, setProposals] = useState<(Proposal & { proposal_versions?: ProposalVersion[] })[]>([]);
  const [meetingNotFound, setMeetingNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to first item since current_agenda_item_id doesn't exist in MVP schema
  const currentItem = items[0] ?? null;
  const currentIdx = currentItem ? items.indexOf(currentItem) : -1;

  // Find proposal for the current item
  const proposal = currentItem ? (proposals.find((p) => p.agenda_item_id === currentItem.id) ?? null) : null;
  const activeVersion = proposal?.proposal_versions?.find((v) => v.is_active) ?? null;

  // Redirect if no session
  useEffect(() => {
    if (!sessionLoading && !session) {
      router.replace("/");
    }
  }, [session, sessionLoading, router]);

  // Poll meeting + agenda
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

      const itemsRes = await fetch(`/api/agenda-items?meetingId=${m.id}`);
      if (itemsRes.ok) {
        setItems(await itemsRes.json());
      }

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
    const interval = setInterval(loadMeeting, 3000);
    return () => clearInterval(interval);
  }, [session, loadMeeting]);

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

      {/* Presenter header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{meeting.title}</h1>
          <p className="text-sm text-gray-400">
            Presenter View • Item {currentIdx + 1} of {items.length}
          </p>
        </div>
      </div>

      {/* Main content: current item */}
      <main className="max-w-5xl mx-auto p-8">
        {!currentItem ? (
          <div className="flex items-center justify-center h-96 text-gray-500">
            <p className="text-xl">Waiting for the meeting to start...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Item title */}
            <div className="text-center">
              <h2 className="text-4xl font-bold">{currentItem.title}</h2>
              <p className="text-lg text-gray-400 mt-2">
                {currentItem.category === "proposal" ? "📋 Proposal" : "📌 General Item"}
              </p>
            </div>

            {/* Proposal details */}
            {currentItem.category === "proposal" && proposal && (
              <>
                {proposal.summary && (
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Summary</h3>
                    <p className="text-lg text-gray-200">{proposal.summary}</p>
                  </div>
                )}

                {activeVersion && (
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">
                      Proposal Text (v{activeVersion.version_number})
                    </h3>
                    <div className="text-gray-200 whitespace-pre-wrap bg-black/50 rounded p-4 border border-gray-700 text-lg leading-relaxed">
                      {activeVersion.full_text || <span className="text-gray-500 italic">No text provided.</span>}
                    </div>
                  </div>
                )}

                {proposal.effective_date && (
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Effective Date</h3>
                    <p className="text-lg text-gray-200">{proposal.effective_date}</p>
                  </div>
                )}
              </>
            )}

            {currentItem.category !== "proposal" && (
              <div className="bg-gray-900 rounded-lg p-8 border border-gray-800 text-center">
                <p className="text-xl text-gray-400 italic">General / Discussion Item</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
