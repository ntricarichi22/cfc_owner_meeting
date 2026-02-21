"use client";

import { useCallback, useEffect, useState } from "react";

type VoteResponse = {
  status: "not_open" | "open" | "closed" | "tallied";
  submittedCount?: number;
  myVote?: string | null;
  totals?: { yes: number; no: number; abstain: number; total: number };
  passed?: boolean | null;
  rollCall?: { team_name: string; team_id: string; vote: string }[];
};

export default function VotingPanel({
  proposalVersionId,
  meetingLocked,
  isCommissioner,
  onMeetingLockChanged,
  presenterMode = false,
}: {
  proposalVersionId: string | null | undefined;
  meetingLocked: boolean;
  isCommissioner: boolean;
  onMeetingLockChanged: (locked: boolean) => void;
  presenterMode?: boolean;
}) {
  const [data, setData] = useState<VoteResponse>({ status: "not_open" });
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!proposalVersionId) {
      setData({ status: "not_open" });
      return;
    }
    const res = await fetch(`/api/votes?proposalVersionId=${proposalVersionId}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(body?.error || "Failed to load voting state");
      return;
    }
    setData(body as VoteResponse);
  }, [proposalVersionId]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const timer = setInterval(load, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);

  const cast = async (vote: "YES" | "NO" | "ABSTAIN") => {
    if (!proposalVersionId) return;
    const res = await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalVersionId, vote }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(body?.error || "Failed to submit vote");
      return;
    }
    setMessage("Vote submitted");
    load();
  };

  const runControl = async (path: "/api/voting/open" | "/api/voting/close" | "/api/voting/tally") => {
    if (!proposalVersionId) return;
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalVersionId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(body?.error || "Action failed");
      return;
    }
    setMessage("Updated");
    load();
  };

  const toggleLock = async () => {
    const res = await fetch("/api/meetings/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !meetingLocked }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setMessage(body?.error || "Unable to update lock");
      return;
    }
    onMeetingLockChanged(Boolean(body?.locked));
  };

  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase">Voting</h3>
        {meetingLocked && <span className="text-xs text-red-300 bg-red-900/50 px-2 py-1 rounded">Meeting Locked</span>}
      </div>

      {message && <p className="text-xs text-blue-300">{message}</p>}

      {data.status === "open" && (
        <>
          <div className="flex gap-2">
            {(["YES", "NO", "ABSTAIN"] as const).map((choice) => (
              <button
                key={choice}
                onClick={() => cast(choice)}
                disabled={meetingLocked}
                className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded text-xs font-semibold"
              >
                {choice}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-300">
            {data.myVote ? `Vote submitted: ${String(data.myVote).toUpperCase()}` : "No vote submitted yet."}
          </p>
        </>
      )}

      {data.status === "closed" && <p className="text-sm text-yellow-300">Voting closed. Awaiting tally.</p>}
      {data.status === "not_open" && <p className="text-sm text-gray-400">Voting not open.</p>}

      {data.status !== "tallied" && (
        <p className="text-xs text-gray-500">Submitted votes: {data.submittedCount ?? 0}</p>
      )}

      {data.status === "tallied" && (
        <div className={presenterMode ? "space-y-4" : "space-y-2"}>
          <p className={`${presenterMode ? "text-2xl" : "text-sm"} font-semibold ${data.passed ? "text-green-400" : "text-red-400"}`}>
            {data.passed ? "PASSED" : "FAILED"}
          </p>
          <p className={presenterMode ? "text-2xl" : "text-sm"}>
            YES {data.totals?.yes ?? 0} • NO {data.totals?.no ?? 0} • ABSTAIN {data.totals?.abstain ?? 0}
          </p>
          <div className="max-h-44 overflow-auto border border-gray-800 rounded p-2 text-xs">
            {(data.rollCall || []).map((vote) => (
              <p key={vote.team_id}>{vote.team_name}: {String(vote.vote).toUpperCase()}</p>
            ))}
          </div>
        </div>
      )}

      {isCommissioner && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
          <button onClick={() => runControl("/api/voting/open")} disabled={meetingLocked || data.status === "open"} className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded text-xs">Open</button>
          <button onClick={() => runControl("/api/voting/close")} disabled={meetingLocked || data.status !== "open"} className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 rounded text-xs">Close</button>
          <button onClick={() => runControl("/api/voting/tally")} disabled={meetingLocked || data.status !== "closed"} className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded text-xs">Tally</button>
          <button onClick={toggleLock} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs">
            {meetingLocked ? "Unlock Meeting" : "Lock Meeting"}
          </button>
        </div>
      )}
    </div>
  );
}
