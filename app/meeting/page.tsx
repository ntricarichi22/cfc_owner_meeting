"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Timer from "@/components/Timer";
import { useSession } from "@/components/TeamSelector";
import {
  setCurrentAgendaItem,
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

export default function MeetingOwnerPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [activeVersion, setActiveVersion] = useState<ProposalVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingNotFound, setMeetingNotFound] = useState(false);

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;
  const selectedIdx = items.findIndex((i) => i.id === selectedItemId);

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

        // Default selection: current agenda item or first item
        setSelectedItemId((prev) => {
          if (m.current_agenda_item_id) return m.current_agenda_item_id;
          if (prev && agendaItems.some((i) => i.id === prev)) return prev;
          return agendaItems[0]?.id ?? null;
        });
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  // Load proposal for selected item
  const loadProposal = useCallback(async () => {
    if (!selectedItem || selectedItem.type !== "proposal") {
      setProposal(null);
      setActiveVersion(null);
      return;
    }
    try {
      const res = await fetch(`/api/proposals?agendaItemId=${selectedItem.id}`);
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
  }, [selectedItem]);

  // Poll meeting data
  useEffect(() => {
    if (!session) return;
    loadMeeting();
    const interval = setInterval(loadMeeting, 5000);
    return () => clearInterval(interval);
  }, [session, loadMeeting]);

  // Load proposal when selection changes
  useEffect(() => {
    loadProposal();
  }, [loadProposal]);

  // Handlers
  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
  };

  const handleNav = async (direction: "prev" | "next") => {
    const nextIdx = direction === "next" ? selectedIdx + 1 : selectedIdx - 1;
    if (nextIdx >= 0 && nextIdx < items.length) {
      const nextItemId = items[nextIdx].id;
      setSelectedItemId(nextItemId);
      if (isCommissioner && meeting) {
        try {
          await setCurrentAgendaItem(meeting.id, nextItemId);
          await loadMeeting();
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Failed to navigate");
        }
      }
    }
  };

  const handleTimerAction = async (action: "start" | "pause" | "reset" | "extend") => {
    if (!selectedItem) return;
    try {
      if (action === "start") await startTimer(selectedItem.id);
      else if (action === "pause") await pauseTimer(selectedItem.id);
      else if (action === "reset") await resetTimer(selectedItem.id);
      else if (action === "extend") await extendTimer(selectedItem.id);
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

      {/* Meeting header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold">Owners Meeting {meeting.club_year}</h1>
        <p className="text-sm text-gray-400">
          {meeting.meeting_date || "Date TBD"} •{" "}
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
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.id === meeting.current_agenda_item_id ? "bg-green-500 animate-pulse" : "bg-gray-600"
                  }`} />
                  <span className="text-sm truncate">{item.title}</span>
                </div>
                <span className="text-[10px] text-gray-500 ml-4">
                  {item.type === "proposal" ? "📋 Proposal" : "📌 Admin"}
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
                  {selectedItem.type === "proposal" ? "📋 Proposal" : "📌 Admin Item"}
                </p>
              </div>

              {/* Timer */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                <Timer
                  durationSeconds={selectedItem.timer_duration_seconds || 600}
                  startedAt={selectedItem.timer_started_at}
                  remainingSeconds={selectedItem.timer_remaining_seconds}
                  isCommissioner={isCommissioner}
                  onStart={() => handleTimerAction("start")}
                  onPause={() => handleTimerAction("pause")}
                  onReset={() => handleTimerAction("reset")}
                  onExtend={() => handleTimerAction("extend")}
                />
              </div>

              {/* Proposal details */}
              {selectedItem.type === "proposal" && proposal && (
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
                </>
              )}

              {/* Admin item placeholder */}
              {selectedItem.type === "admin" && (
                <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                  <p className="text-gray-400 italic">Admin / Discussion Item</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
