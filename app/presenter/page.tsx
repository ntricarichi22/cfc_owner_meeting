"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Timer from "@/components/Timer";
import { useSession } from "@/components/TeamSelector";
import {
  startTimer,
  pauseTimer,
  resetTimer,
  extendTimer,
} from "@/lib/actions";
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
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [activeVersion, setActiveVersion] = useState<ProposalVersion | null>(null);
  const [meetingNotFound, setMeetingNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentItem = items.find((i) => i.id === meeting?.current_agenda_item_id) ?? null;
  const currentIdx = items.findIndex((i) => i.id === meeting?.current_agenda_item_id);

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
    } catch {
      // ignore polling errors
    }
  }, []);

  // Load proposal for current item
  const loadProposal = useCallback(async () => {
    if (!currentItem || currentItem.type !== "proposal") {
      setProposal(null);
      setActiveVersion(null);
      return;
    }
    try {
      const res = await fetch(`/api/proposals?agendaItemId=${currentItem.id}`);
      if (!res.ok) {
        setProposal(null);
        setActiveVersion(null);
        return;
      }
      const p = await res.json();
      setProposal(p);

      if (p?.id) {
        const vRes = await fetch(`/api/proposals/active-version?proposalId=${p.id}`);
        if (vRes.ok) {
          setActiveVersion(await vRes.json());
        } else {
          setActiveVersion(null);
        }
      }
    } catch {
      // ignore
    }
  }, [currentItem]);

  useEffect(() => {
    if (!session) return;
    loadMeeting();
    const interval = setInterval(loadMeeting, 3000);
    return () => clearInterval(interval);
  }, [session, loadMeeting]);

  useEffect(() => {
    loadProposal();
  }, [loadProposal]);

  const handleTimerAction = async (action: "start" | "pause" | "reset" | "extend") => {
    if (!currentItem) return;
    try {
      if (action === "start") await startTimer(currentItem.id);
      else if (action === "pause") await pauseTimer(currentItem.id);
      else if (action === "reset") await resetTimer(currentItem.id);
      else if (action === "extend") await extendTimer(currentItem.id);
      await loadMeeting();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Timer action failed");
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

      {/* Presenter header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Owners Meeting {meeting.club_year}</h1>
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
                {currentItem.type === "proposal" ? "📋 Proposal" : "📌 Admin Item"}
              </p>
            </div>

            {/* Timer - centered, large */}
            <div className="flex justify-center">
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 inline-block">
                <Timer
                  durationSeconds={currentItem.timer_duration_seconds || 600}
                  startedAt={currentItem.timer_started_at}
                  remainingSeconds={currentItem.timer_remaining_seconds}
                  isCommissioner={isCommissioner}
                  onStart={() => handleTimerAction("start")}
                  onPause={() => handleTimerAction("pause")}
                  onReset={() => handleTimerAction("reset")}
                  onExtend={() => handleTimerAction("extend")}
                />
              </div>
            </div>

            {/* Proposal details */}
            {currentItem.type === "proposal" && proposal && (
              <>
                {proposal.summary && (
                  <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Summary</h3>
                    <p className="text-lg text-gray-200">{proposal.summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  {proposal.pros && (
                    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                      <h3 className="text-sm font-semibold text-green-400 uppercase mb-2">Pros</h3>
                      <p className="text-gray-300 whitespace-pre-wrap">{proposal.pros}</p>
                    </div>
                  )}
                  {proposal.cons && (
                    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                      <h3 className="text-sm font-semibold text-red-400 uppercase mb-2">Cons</h3>
                      <p className="text-gray-300 whitespace-pre-wrap">{proposal.cons}</p>
                    </div>
                  )}
                </div>

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

            {currentItem.type === "admin" && (
              <div className="bg-gray-900 rounded-lg p-8 border border-gray-800 text-center">
                <p className="text-xl text-gray-400 italic">Admin / Discussion Item</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
