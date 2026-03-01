"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { DangerButton, PrimaryButton, SuccessButton } from "@/components/ui/primitives";

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
      <div className="fixed inset-0 z-50 bg-[rgba(11,11,15,0.35)] backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-[var(--radius)] border-[var(--border-width)] border-[var(--border)] bg-[var(--card-surface)] shadow-[var(--shadow-style)] overflow-hidden">
          {/* Close button */}
          <div className="flex justify-end px-5 pt-4">
            <button
              onClick={onClose}
              className="text-[rgba(11,11,15,0.6)] hover:text-[var(--ink)] transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-8 pb-8 pt-2 text-center space-y-6">
            {/* Result badge */}
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${data.passed ? "bg-[rgba(22,163,74,0.15)]" : "bg-[rgba(255,59,59,0.15)]"}`}>
              {data.passed ? (
                <svg className="w-10 h-10 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-[var(--accent-red)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>

            <h2 className={`text-3xl font-bold tracking-tight ${data.passed ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
              {data.passed ? "Proposal Passed" : "Proposal Rejected"}
            </h2>

            <p className="text-sm text-[rgba(11,11,15,0.7)]">{proposalTitle}</p>

            {/* Totals */}
            <div className="flex justify-center gap-8 text-lg font-semibold">
              <span className="text-[var(--accent-green)]">YES {data.totals?.yes ?? 0}</span>
              <span className="text-[rgba(11,11,15,0.45)]">•</span>
              <span className="text-[var(--accent-red)]">NO {data.totals?.no ?? 0}</span>
            </div>

            {/* Roll call */}
            {data.rollCall && data.rollCall.length > 0 && (
              <div className="text-left rounded-[var(--radius)] border-[var(--border-width)] border-[var(--border)] bg-[var(--paper-bg)] max-h-56 overflow-auto shadow-[var(--shadow-style)]">
                <div className="px-4 py-2 border-b border-[rgba(17,24,39,0.2)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[rgba(11,11,15,0.65)]">Roll Call</p>
                </div>
                <div className="divide-y divide-[rgba(17,24,39,0.15)]">
                  {data.rollCall.map((v) => (
                    <div key={v.team_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-[var(--ink)]">{v.team_name}</span>
                      <span className={`font-semibold ${v.vote.toLowerCase() === "yes" ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
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
      <div className="fixed inset-0 z-50 bg-[rgba(11,11,15,0.35)] backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-[var(--radius)] border-[var(--border-width)] border-[var(--border)] bg-[var(--card-surface)] shadow-[var(--shadow-style)] overflow-hidden">
          {/* Close button */}
          <div className="flex justify-end px-5 pt-4">
            <button
              onClick={onClose}
              className="text-[rgba(11,11,15,0.6)] hover:text-[var(--ink)] transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-8 pb-8 pt-2 text-center space-y-5">
            {/* Green check icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[rgba(22,163,74,0.15)]">
              <svg className="w-10 h-10 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-[var(--ink)]">Vote Successfully Submitted</h2>
            <p className="text-sm text-[rgba(11,11,15,0.7)]">
              Awaiting other votes… You can close this window, but voting will remain open until tallied.
            </p>

            {/* Disabled vote-submitted button */}
            <button
              disabled
              className="w-full rounded-[var(--radius)] border-[var(--border-width)] border-[var(--border)] bg-[var(--paper-bg)] px-4 py-3 text-sm font-semibold text-[rgba(11,11,15,0.6)] cursor-not-allowed shadow-[var(--shadow-style)]"
            >
              Vote submitted: {String(data.myVote).toUpperCase()}
            </button>

            {/* Commissioner tally control */}
            {isCommissioner && (
              <>
                <PrimaryButton
                  onClick={handleTally}
                  disabled={tallying}
                  className="w-full px-4 py-3 text-sm font-semibold"
                >
                  {tallying ? "Tallying…" : "Tally Votes"}
                </PrimaryButton>
                {tallyError && <p className="text-xs text-[var(--accent-red)]">{tallyError}</p>}
              </>
            )}

            <p className="text-xs text-[rgba(11,11,15,0.55)]" aria-label="Number of votes submitted">
              Votes submitted: {data.submittedCount ?? 0}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT VOTING VIEW ---
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(11,11,15,0.35)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-[var(--radius)] border-[var(--border-width)] border-[var(--border)] bg-[var(--card-surface)] shadow-[var(--shadow-style)] overflow-hidden">
        {/* Close button */}
        <div className="flex justify-end px-5 pt-4">
          <button
            onClick={onClose}
            className="text-[rgba(11,11,15,0.6)] hover:text-[var(--ink)] transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center space-y-5">
          <h2 className="text-xl font-semibold text-[var(--ink)]">Cast your vote</h2>
          <p className="text-sm text-[rgba(11,11,15,0.7)]">Approve or reject the proposal.</p>
          <p className="text-xs text-[rgba(11,11,15,0.55)]">{proposalTitle}</p>

          {voteError && <p className="text-xs text-[var(--accent-red)]">{voteError}</p>}

          {/* Vote buttons */}
          <div className="flex gap-3">
            <SuccessButton
              onClick={() => cast("YES")}
              disabled={submitting || data.status !== "open"}
              className="flex-1 px-4 py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Approve"}
            </SuccessButton>
            <DangerButton
              onClick={() => cast("NO")}
              disabled={submitting || data.status !== "open"}
              className="flex-1 px-4 py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Reject"}
            </DangerButton>
          </div>

          {/* Commissioner tally control */}
          {isCommissioner && isVotingActive && (
            <>
              <PrimaryButton
                onClick={handleTally}
                disabled={tallying}
                className="w-full px-4 py-3 text-sm font-semibold"
              >
                {tallying ? "Tallying…" : "Tally Votes"}
              </PrimaryButton>
              {tallyError && <p className="text-xs text-[var(--accent-red)]">{tallyError}</p>}
            </>
          )}

          <p className="text-xs text-[rgba(11,11,15,0.55)]" aria-label="Number of votes submitted">
            Votes submitted: {data.submittedCount ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
}
