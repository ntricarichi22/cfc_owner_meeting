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

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-8">Not logged in.</div>;

  const yesVotes = (votes: VoteWithOwner[]) => votes.filter((v) => v.choice === "yes");
  const noVotes = (votes: VoteWithOwner[]) => votes.filter((v) => v.choice === "no");

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={session.role === "commissioner"} onLogout={logout} />

      <div className="max-w-4xl mx-auto p-6">
        <Link href="/history" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">
          ← Back to History
        </Link>

        <h1 className="text-2xl font-bold mb-1">{year} Season Meeting</h1>
        {meeting?.meeting_date && (
          <p className="text-gray-400 text-sm mb-6">{new Date(meeting.meeting_date).toLocaleDateString()}</p>
        )}

        {error && <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded mb-4">{error}</div>}

        {dataLoading && !error && <p className="text-gray-500">Loading…</p>}

        {/* Agenda Items */}
        {items.length > 0 && (
          <div className="space-y-6 mb-8">
            <h2 className="text-xl font-semibold">Agenda Items</h2>
            {items.map(({ item, proposal, versions, votes }) => (
              <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-semibold text-lg">{item.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    item.type === "proposal" ? "bg-blue-900 text-blue-300" : "bg-gray-800 text-gray-400"
                  }`}>
                    {item.type}
                  </span>
                </div>

                {proposal && (
                  <div className="space-y-4">
                    {/* Final Proposal Text */}
                    {(() => {
                      const finalVer = versions.find((v) => v.status === "final") || versions.at(-1);
                      return finalVer ? (
                        <div>
                          <h4 className="text-sm font-medium text-gray-400 mb-1">Final Proposal Text</h4>
                          <div className="bg-gray-800 rounded p-3 text-sm text-gray-300 whitespace-pre-wrap">
                            {finalVer.full_text}
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Vote Results */}
                    {votes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Vote Results</h4>
                        <div className="flex gap-4 mb-2">
                          <span className="text-green-400 font-semibold">Yes: {yesVotes(votes).length}</span>
                          <span className="text-red-400 font-semibold">No: {noVotes(votes).length}</span>
                          <span className={`font-bold px-2 py-0.5 rounded text-sm ${
                            yesVotes(votes).length >= VOTE_THRESHOLD
                              ? "bg-green-900 text-green-300"
                              : "bg-red-900 text-red-300"
                          }`}>
                            {yesVotes(votes).length >= VOTE_THRESHOLD ? "PASSED" : "FAILED"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-green-400 text-xs font-medium mb-1">Voted Yes</p>
                            {yesVotes(votes).map((v) => (
                              <p key={v.id} className="text-gray-300">{v.owner?.team_name ?? "Unknown"}</p>
                            ))}
                            {yesVotes(votes).length === 0 && <p className="text-gray-600">None</p>}
                          </div>
                          <div>
                            <p className="text-red-400 text-xs font-medium mb-1">Voted No</p>
                            {noVotes(votes).map((v) => (
                              <p key={v.id} className="text-gray-300">{v.owner?.team_name ?? "Unknown"}</p>
                            ))}
                            {noVotes(votes).length === 0 && <p className="text-gray-600">None</p>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Version History */}
                    {versions.length > 1 && (
                      <details className="text-sm">
                        <summary className="text-gray-400 cursor-pointer hover:text-gray-300">
                          Version History ({versions.length} versions)
                        </summary>
                        <div className="mt-2 space-y-2">
                          {versions.map((v) => (
                            <div key={v.id} className="bg-gray-800 rounded p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-gray-400">v{v.version_number}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  v.status === "final"
                                    ? "bg-green-900 text-green-300"
                                    : v.status === "active"
                                    ? "bg-blue-900 text-blue-300"
                                    : "bg-gray-700 text-gray-400"
                                }`}>
                                  {v.status}
                                </span>
                              </div>
                              <p className="text-gray-300 whitespace-pre-wrap">{v.full_text}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Meeting Minutes */}
        {minutes && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <h2 className="text-xl font-semibold mb-3">Meeting Minutes</h2>
            <div className="text-gray-300 whitespace-pre-wrap text-sm">{minutes.minutes_markdown}</div>
          </div>
        )}
      </div>
    </div>
  );
}
