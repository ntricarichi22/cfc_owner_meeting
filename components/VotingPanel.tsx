"use client";

import { useCallback, useEffect, useState } from "react";
import { DangerButton, PopCard, PrimaryButton, SuccessButton } from "@/components/ui/primitives";

type VoteResponse = {
  status: "not_open" | "open" | "closed" | "tallied";
  submittedCount?: number;
  myVote?: string | null;
  totals?: { yes: number; no: number; total: number };
  passed?: boolean | null;
  rollCall?: { team_name: string; team_id: string; vote: string }[];
};

export default function VotingPanel({
  proposalVersionId,
  isCommissioner,
  presenterMode = false,
}: {
  proposalVersionId: string | null | undefined;
  isCommissioner: boolean;
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

  const cast = async (vote: "YES" | "NO") => {
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

  return (
    <PopCard className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(11,11,15,0.65)]">Voting</h3>
      </div>

      {message && <p className="text-xs text-[var(--accent-blue)]">{message}</p>}

      {data.status === "open" && (
        <>
          <div className="flex gap-2">
            <SuccessButton onClick={() => cast("YES")} className="px-4 py-2 text-xs font-semibold">YES</SuccessButton>
            <DangerButton onClick={() => cast("NO")} className="px-4 py-2 text-xs font-semibold">NO</DangerButton>
          </div>
          <p className="text-sm text-[rgba(11,11,15,0.75)]">
            {data.myVote ? `Vote submitted: ${String(data.myVote).toUpperCase()}` : "No vote submitted yet."}
          </p>
        </>
      )}

      {data.status === "closed" && <p className="text-sm text-[rgba(11,11,15,0.75)]">Voting closed. Awaiting tally.</p>}
      {data.status === "not_open" && <p className="text-sm text-[rgba(11,11,15,0.6)]">Voting not open.</p>}

      {data.status !== "tallied" && (
        <p className="text-xs text-[rgba(11,11,15,0.55)]">Submitted votes: {data.submittedCount ?? 0}</p>
      )}

      {data.status === "tallied" && (
        <div className={presenterMode ? "space-y-4" : "space-y-2"}>
          <p className={`${presenterMode ? "text-2xl" : "text-sm"} font-semibold ${data.passed ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
            {data.passed ? "PASSED" : "FAILED"}
          </p>
          <p className={presenterMode ? "text-2xl" : "text-sm"}>
            YES {data.totals?.yes ?? 0} • NO {data.totals?.no ?? 0}
          </p>
          <div className="max-h-44 overflow-auto border-[var(--border-width)] border-[var(--border)] rounded-[var(--radius)] p-2 text-xs bg-[var(--paper-bg)] shadow-[var(--shadow-style)]">
            {(data.rollCall || []).map((vote) => (
              <p key={vote.team_id}>{vote.team_name}: {String(vote.vote).toUpperCase()}</p>
            ))}
          </div>
        </div>
      )}

      {isCommissioner && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-[rgba(17,24,39,0.2)]">
          <SuccessButton onClick={() => runControl("/api/voting/open")} disabled={data.status === "open"} className="px-3 py-1.5 text-xs">Open</SuccessButton>
          <PrimaryButton onClick={() => runControl("/api/voting/close")} disabled={data.status !== "open"} className="px-3 py-1.5 text-xs bg-[var(--accent-blue)]">Close</PrimaryButton>
          <DangerButton onClick={() => runControl("/api/voting/tally")} disabled={data.status !== "closed"} className="px-3 py-1.5 text-xs">Tally</DangerButton>
        </div>
      )}
    </PopCard>
  );
}
