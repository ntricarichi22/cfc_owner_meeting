"use client";

import { useCallback, useEffect, useState, useRef } from "react";

type VoteResponse = {
  status: "not_open" | "open" | "closed" | "tallied";
  submittedCount?: number;
  myVote?: string | null;
  totals?: { yes: number; no: number; total: number };
  passed?: boolean | null;
  rollCall?: { team_name: string; team_id: string; vote: string }[];
};

export default function VotingModal({
  proposalVersionId,
  isCommissioner,
  proposalTitle,
  onClose,
}: {
  proposalVersionId: string;
  isCommissioner: boolean;
  proposalTitle: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<VoteResponse>({ status: "not_open" });
  const [voteError, setVoteError] = useState<string | null>(null);
  const [tallyError, setTallyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tallying, setTallying] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!proposalVersionId) return;
    try {
      const res = await fetch(`/api/votes?proposalVersionId=${proposalVersionId}`);
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (!res.ok) return;
      setData(body as VoteResponse);
    } catch {
      // ignore polling errors
    }
  }, [proposalVersionId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [load]);

  const cast = async (vote: "YES" | "NO") => {
    if (!proposalVersionId || submitting) return;
    setVoteError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalVersionId, vote }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setVoteError(body?.error || "Failed to submit vote");
        return;
      }
      load();
    } catch {
      setVoteError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTally = async () => {
    if (!proposalVersionId || tallying) return;
    setTallyError(null);
    setTallying(true);
    try {
      // Auto-close before tally if voting is still open
      if (data.status === "open") {
        const closeRes = await fetch("/api/voting/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalVersionId }),
        });
        if (!closeRes.ok) {
          const closeBody = await closeRes.json().catch(() => null);
          setTallyError(closeBody?.error || "Failed to close voting before tally");
          return;
        }
      }

      const res = await fetch("/api/voting/tally", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalVersionId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setTallyError(body?.error || "Failed to tally votes");
        return;
      }
      load();
    } catch {
      setTallyError("Network error. Please try again.");
    } finally {
      setTallying(false);
    }
  };

  const hasVoted = !!data.myVote;
  const isTallied = data.status === "tallied";
  const isVotingActive = data.status === "open" || data.status === "closed";

  // --- RESULTS VIEW ---
  if (isTallied) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-[#111111] shadow-2xl overflow-hidden">
          {/* Close button */}
          <div className="flex justify-end px-5 pt-4">
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-8 pb-8 pt-2 text-center space-y-6">
            {/* Result badge */}
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${data.passed ? "bg-green-500/20" : "bg-red-500/20"}`}>
              {data.passed ? (
                <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>

            <h2 className={`text-3xl font-bold tracking-tight ${data.passed ? "text-green-400" : "text-red-400"}`}>
              {data.passed ? "PASSED" : "FAILED"}
            </h2>

            <p className="text-sm text-white/50">{proposalTitle}</p>

            {/* Totals */}
            <div className="flex justify-center gap-8 text-lg font-semibold">
              <span className="text-green-400">YES {data.totals?.yes ?? 0}</span>
              <span className="text-white/30">•</span>
              <span className="text-red-400">NO {data.totals?.no ?? 0}</span>
            </div>

            {/* Roll call */}
            {data.rollCall && data.rollCall.length > 0 && (
              <div className="text-left rounded-xl border border-white/10 bg-white/[0.03] max-h-56 overflow-auto">
                <div className="px-4 py-2 border-b border-white/10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Roll Call</p>
                </div>
                <div className="divide-y divide-white/5">
                  {data.rollCall.map((v) => (
                    <div key={v.team_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-white/80">{v.team_name}</span>
                      <span className={`font-semibold ${v.vote.toLowerCase() === "yes" ? "text-green-400" : "text-red-400"}`}>
                        {v.vote.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- SUBMITTED VIEW ---
  if (isVotingActive && hasVoted) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-[#111111] shadow-2xl overflow-hidden">
          {/* Close button */}
          <div className="flex justify-end px-5 pt-4">
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-8 pb-8 pt-2 text-center space-y-5">
            {/* Green check icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20">
              <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-white">Vote Successfully Submitted</h2>
            <p className="text-sm text-white/50">
              Awaiting other votes… You can close this window, but voting will remain open until tallied.
            </p>

            {/* Disabled vote-submitted button */}
            <button
              disabled
              className="w-full rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold text-white/40 cursor-not-allowed"
            >
              Vote submitted: {String(data.myVote).toUpperCase()}
            </button>

            {/* Commissioner tally control */}
            {isCommissioner && (
              <>
                <button
                  onClick={handleTally}
                  disabled={tallying}
                  className="w-full rounded-lg bg-[#0ea5e9] hover:bg-[#0ea5e9]/80 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
                >
                  {tallying ? "Tallying…" : "Tally Votes"}
                </button>
                {tallyError && <p className="text-xs text-red-400">{tallyError}</p>}
              </>
            )}

            <p className="text-xs text-white/30" aria-label="Number of votes submitted">
              Votes submitted: {data.submittedCount ?? 0}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT VOTING VIEW ---
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-[#111111] shadow-2xl overflow-hidden">
        {/* Close button */}
        <div className="flex justify-end px-5 pt-4">
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center space-y-5">
          <h2 className="text-xl font-semibold text-white">Cast your vote</h2>
          <p className="text-sm text-white/50">Approve or reject the proposal.</p>
          <p className="text-xs text-white/30">{proposalTitle}</p>

          {voteError && <p className="text-xs text-red-400">{voteError}</p>}

          {/* Vote buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => cast("YES")}
              disabled={submitting || data.status !== "open"}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition-colors"
            >
              {submitting ? "Submitting…" : "Approve"}
            </button>
            <button
              onClick={() => cast("NO")}
              disabled={submitting || data.status !== "open"}
              className="flex-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition-colors"
            >
              {submitting ? "Submitting…" : "Reject"}
            </button>
          </div>

          {/* Commissioner tally control */}
          {isCommissioner && isVotingActive && (
            <>
              <button
                onClick={handleTally}
                disabled={tallying}
                className="w-full rounded-lg bg-[#0ea5e9] hover:bg-[#0ea5e9]/80 disabled:opacity-50 px-4 py-3 text-sm font-semibold text-white transition-colors"
              >
                {tallying ? "Tallying…" : "Tally Votes"}
              </button>
              {tallyError && <p className="text-xs text-red-400">{tallyError}</p>}
            </>
          )}

          <p className="text-xs text-white/30" aria-label="Number of votes submitted">
            Votes submitted: {data.submittedCount ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
}
