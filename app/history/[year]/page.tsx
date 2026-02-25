"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import {
  getMeeting,
  getAgendaItems,
  getProposal,
  getProposalVersions,
  getVotes,
  getMeetingMinutes,
  getOwners,
} from "@/lib/actions";
import { VOTE_THRESHOLD } from "@/lib/types";
import { Chip, PopCard } from "@/components/ui/primitives";
import type {
  Meeting,
  AgendaItem,
  Proposal,
  ProposalVersion,
  MeetingMinutes,
} from "@/lib/types";

interface VoteWithOwner {
  id: string;
  choice: "yes" | "no";
  owner: { display_name: string; team_name: string } | null;
}

interface ItemData {
  item: AgendaItem;
  proposal: (Proposal & { proposal_versions?: ProposalVersion[] }) | null;
  versions: ProposalVersion[];
  votes: VoteWithOwner[];
}

export default function HistoryYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = use(params);
  const { session, loading, logout } = useSession();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<ItemData[]>([]);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);

  const [error, setError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const m = await getMeeting(Number(year));
      if (!m) {
        setError("Meeting not found for " + year);
        setDataLoading(false);
        return;
      }
      setMeeting(m as Meeting);

      const [agendaItems, , mins] = await Promise.all([
        getAgendaItems(m.id),
        getOwners(), // required for session validation
        getMeetingMinutes(m.id),
      ]) as [AgendaItem[], unknown, MeetingMinutes | null];
      setMinutes(mins as MeetingMinutes | null);

      const itemsData: ItemData[] = await Promise.all(
        (agendaItems as AgendaItem[]).map(async (item) => {
          if (item.type !== "proposal") {
            return { item, proposal: null, versions: [], votes: [] };
          }
          const proposal = await getProposal(item.id);
          if (!proposal) {
            return { item, proposal: null, versions: [], votes: [] };
          }

          const versions = await getProposalVersions(proposal.id);
          const finalVersion = (versions as ProposalVersion[]).find((v) => v.status === "final")
            || (versions as ProposalVersion[]).at(-1);

          let votes: VoteWithOwner[] = [];
          if (finalVersion) {
            votes = (await getVotes(finalVersion.id)) as VoteWithOwner[];
          }

          return {
            item,
            proposal: proposal as Proposal & { proposal_versions?: ProposalVersion[] },
            versions: versions as ProposalVersion[],
            votes,
          };
        })
      );

      setItems(itemsData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load meeting data");
    } finally {
      setDataLoading(false);
    }
  }, [year]);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  if (loading) return <div className="min-h-screen bg-[var(--paper-bg)]" />;
  if (!session) return <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] p-8">Not logged in.</div>;

  const yesVotes = (votes: VoteWithOwner[]) => votes.filter((v) => v.choice === "yes");
  const noVotes = (votes: VoteWithOwner[]) => votes.filter((v) => v.choice === "no");

  return (
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
      <Nav teamName={session.team_name} isCommissioner={session.role === "commissioner"} onLogout={logout} />

      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Link href="/history" className="text-[var(--accent-blue)] text-sm mb-2 inline-block underline-offset-4 hover:underline">
          ← Back to History
        </Link>

        <h1 className="text-2xl font-bold mb-1 tracking-tight">{year} Season Meeting</h1>
        {meeting?.meeting_date && (
          <p className="text-[rgba(11,11,15,0.65)] text-sm mb-4">{new Date(meeting.meeting_date).toLocaleDateString()}</p>
        )}

        {error && (
          <PopCard className="border-[var(--accent-red)] text-[var(--ink)]">
            <p className="text-[var(--accent-red)] font-semibold">{error}</p>
          </PopCard>
        )}

        {dataLoading && !error && <p className="text-[rgba(11,11,15,0.65)]">Loading…</p>}

        {/* Agenda Items */}
        {items.length > 0 && (
          <div className="space-y-4 mb-6">
            <h2 className="text-xl font-semibold tracking-tight">Agenda Items</h2>
            {items.map(({ item, proposal, versions, votes }) => (
              <PopCard key={item.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-lg tracking-tight">{item.title}</h3>
                  <Chip className="text-xs px-3 py-1">{item.type}</Chip>
                </div>

                {proposal && (
                  <div className="space-y-4">
                    {/* Final Proposal Text */}
                    {(() => {
                      const finalVer = versions.find((v) => v.status === "final") || versions.at(-1);
                      return finalVer ? (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-[rgba(11,11,15,0.7)]">Final Proposal Text</h4>
                          <PopCard className="bg-[var(--paper-bg)] shadow-[var(--shadow-style)] text-sm whitespace-pre-wrap">
                            {finalVer.full_text}
                          </PopCard>
                        </div>
                      ) : null;
                    })()}

                    {/* Vote Results */}
                    {votes.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-[rgba(11,11,15,0.7)]">Vote Results</h4>
                        <div className="flex gap-4 mb-1">
                          <span className="text-[var(--accent-green)] font-semibold">Yes: {yesVotes(votes).length}</span>
                          <span className="text-[var(--accent-red)] font-semibold">No: {noVotes(votes).length}</span>
                          <Chip className="text-sm px-3 py-1">
                            {yesVotes(votes).length >= VOTE_THRESHOLD ? "PASSED" : "FAILED"}
                          </Chip>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-[var(--accent-green)] text-xs font-medium mb-1">Voted Yes</p>
                            {yesVotes(votes).map((v) => (
                              <p key={v.id} className="text-[rgba(11,11,15,0.75)]">{v.owner?.team_name ?? "Unknown"}</p>
                            ))}
                            {yesVotes(votes).length === 0 && <p className="text-[rgba(11,11,15,0.6)]">None</p>}
                          </div>
                          <div>
                            <p className="text-[var(--accent-red)] text-xs font-medium mb-1">Voted No</p>
                            {noVotes(votes).map((v) => (
                              <p key={v.id} className="text-[rgba(11,11,15,0.75)]">{v.owner?.team_name ?? "Unknown"}</p>
                            ))}
                            {noVotes(votes).length === 0 && <p className="text-[rgba(11,11,15,0.6)]">None</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Version History */}
                    {versions.length > 1 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-[rgba(11,11,15,0.7)] hover:text-[var(--ink)]">
                          Version History ({versions.length} versions)
                        </summary>
                        <div className="mt-2 space-y-2">
                          {versions.map((v) => (
                            <PopCard key={v.id} className="text-sm space-y-1">
                              <div className="flex items-center gap-2 mb-1 text-xs text-[rgba(11,11,15,0.65)]">
                                <span className="text-[rgba(11,11,15,0.7)]">v{v.version_number}</span>
                                <Chip className="text-[11px] px-2 py-0.5">{v.status}</Chip>
                              </div>
                              <p className="text-[var(--ink)] whitespace-pre-wrap">{v.full_text}</p>
                            </PopCard>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </PopCard>
            ))}
          </div>
        )}

        {/* Meeting Minutes */}
        {minutes && (
          <PopCard className="space-y-3">
            <h2 className="text-xl font-semibold">Meeting Minutes</h2>
            <div className="text-[rgba(11,11,15,0.8)] whitespace-pre-wrap text-sm">{minutes.minutes_markdown}</div>
          </PopCard>
        )}
      </div>
    </div>
  );
}
