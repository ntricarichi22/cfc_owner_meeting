"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/TeamSelector";

interface Team {
  teamId: string;
  teamName: string;
}

export default function Home() {
  const router = useRouter();
  const { session, loading, selectTeam, logout, isCommissioner } = useSession();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [claimedTeamIds, setClaimedTeamIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/teams")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load teams (HTTP ${r.status})`);
        }
        return r.json();
      })
      .then((data: Team[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setTeams(data);
        } else {
          setError("No teams available");
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load teams");
      })
      .finally(() => setTeamsLoading(false));
  }, []);

  // Fetch claimed teams so we can disable them in the dropdown
  useEffect(() => {
    if (session) return; // Already logged in, no need to poll claimed teams
    function fetchClaimed() {
      fetch("/api/session/claimed")
        .then((r) => r.json())
        .then((ids: string[]) => setClaimedTeamIds(new Set(ids)))
        .catch(() => {});
    }
    fetchClaimed();
    const timer = setInterval(fetchClaimed, 10_000);
    return () => clearInterval(timer);
  }, [session]);

  const handleEnterMeeting = async () => {
    try {
      setError("");
      if (!session && !selectedTeamId) {
        setError("Team not found");
        return;
      }
      if (!session) {
        const team = teams.find((t) => t.teamId === selectedTeamId);
        if (!team) {
          setError("Team not found");
          return;
        }
        await selectTeam(team.teamId, team.teamName);
      }
      router.push("/meeting");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to select team");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F6F0E6] text-[#111111] flex items-center justify-center">
        <p className="text-[rgba(17,17,17,0.6)]">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F6F0E6] flex items-center justify-center p-4 md:p-8">
      {/* Poster card */}
      <div className="relative w-full max-w-sm border-4 border-[#111111] shadow-[8px_8px_0_#111111] bg-[#F6F0E6] overflow-hidden">

        {/* Top-right gold corner accent */}
        <div className="absolute top-0 right-0 w-12 h-12 bg-[#BF8F00]" />
        {/* Bottom-left gold corner accent */}
        <div className="absolute bottom-0 left-0 w-14 h-14 bg-[#BF8F00]" />

        {/* Red dot grid decoration (right side) */}
        <div className="absolute right-3 top-[38%] grid grid-cols-2 gap-1.5 pointer-events-none" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] opacity-80 block" />
          ))}
        </div>

        <div className="relative px-6 pt-8 pb-6">
          {/* "— WELCOME TO THE —" header */}
          <p className="text-center text-xs font-bold tracking-[0.28em] uppercase text-[#111111] mb-2">
            — Welcome to the —
          </p>

          {/* CFC large headline row */}
          <div className="relative flex items-center justify-center mb-1">
            {/* Red accent slab left */}
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-14 bg-[#FF3B30]" aria-hidden />
            {/* Blue accent slab right */}
            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-14 bg-[#22A3FF]" aria-hidden />
            <h1
              className="text-[6.5rem] leading-none font-black tracking-tight text-[#111111] select-none"
              style={{ textShadow: "4px 4px 0 #BF8F00", letterSpacing: "-0.03em" }}
            >
              CFC
            </h1>
          </div>

          {/* "OWNERS" gold banner */}
          <div className="flex justify-center mb-1">
            <span className="bg-[#BF8F00] border-2 border-[#111111] px-6 py-1 shadow-[4px_4px_0_#111111]">
              <span className="text-3xl font-black uppercase tracking-wide text-[#111111]">
                OWNERS
              </span>
            </span>
          </div>

          {/* "MEETING" italic brush style */}
          <div className="flex justify-center mb-5">
            <span
              className="text-5xl font-black italic text-[#111111] tracking-tight"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", textDecoration: "underline", textDecorationThickness: "3px", textUnderlineOffset: "4px" }}
            >
              Meeting
            </span>
          </div>

          {/* SELECT YOUR TEAM panel */}
          {!session ? (
            <div className="relative border-3 border-[#111111] bg-[#F6F0E6] shadow-[6px_6px_0_#22A3FF] p-4 mb-4" style={{ border: "3px solid #111111" }}>
              <p className="text-center text-sm font-black uppercase tracking-[0.2em] text-[#111111] mb-1">
                Select Your Team
              </p>
              <div className="w-12 h-0.5 bg-[#FF3B30] mx-auto mb-3" />
              {error && <p className="text-[#FF3B30] mb-2 text-xs font-semibold text-center">{error}</p>}
              {teamsLoading ? (
                <p className="text-center text-sm text-[rgba(17,17,17,0.65)]">Loading teams…</p>
              ) : (
                <select
                  className="w-full bg-[#F6F0E6] border-2 border-[#111111] px-4 py-3 text-[#111111] font-medium shadow-[3px_3px_0_#111111] appearance-none focus:outline-none"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                >
                  <option value="">Choose a Team...</option>
                  {teams.map((t) => (
                    <option
                      key={t.teamId}
                      value={t.teamId}
                      disabled={claimedTeamIds.has(t.teamId)}
                    >
                      {t.teamName}{claimedTeamIds.has(t.teamId) ? " (in use)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="border-3 border-[#111111] bg-[#F6F0E6] shadow-[6px_6px_0_#22A3FF] p-4 mb-4 text-center" style={{ border: "3px solid #111111" }}>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#111111] mb-1">Welcome back</p>
              <div className="w-12 h-0.5 bg-[#FF3B30] mx-auto mb-2" />
              <p className="font-bold text-[#111111]">{session.team_name}</p>
              {isCommissioner && (
                <p className="text-xs font-semibold text-[#BF8F00] uppercase tracking-wide mt-1">Commissioner</p>
              )}
            </div>
          )}

          {/* ENTER MEETING button */}
          <button
            onClick={handleEnterMeeting}
            disabled={!session && !selectedTeamId}
            className="w-full bg-[#BF8F00] border-3 border-[#111111] py-4 font-black uppercase tracking-[0.12em] text-lg text-[#111111] shadow-[5px_5px_0_#111111] transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[7px_7px_0_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[3px_3px_0_#111111] disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]"
            style={{ border: "3px solid #111111" }}
          >
            Enter Meeting →
          </button>
        </div>
      </div>
    </main>
  );
}
