"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/TeamSelector";
import Nav from "@/components/Nav";
import { PopCard, PrimaryButton } from "@/components/ui/primitives";

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
  const [entering, setEntering] = useState(false);

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
      setEntering(true);
      if (!session && !selectedTeamId) {
        setError("Team not found");
        setEntering(false);
        return;
      }
      if (!session) {
        const team = teams.find((t) => t.teamId === selectedTeamId);
        if (!team) {
          setError("Team not found");
          setEntering(false);
          return;
        }
        await selectTeam(team.teamId, team.teamName);
      }
      router.replace("/meeting");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to select team");
      setEntering(false);
    }
  };

  if (loading || entering) {
    return (
      <main className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] flex items-center justify-center">
        <p className="text-[rgba(11,11,15,0.6)]">{entering ? "Entering meeting…" : "Loading..."}</p>
      </main>
    );
  }

  return (
    <>
      <Nav teamName={session?.team_name} isCommissioner={isCommissioner} onLogout={logout} />
      <main className="min-h-[calc(100vh-64px)] bg-[var(--paper-bg)] text-[var(--ink)] flex flex-col items-center justify-center p-8">
        <h1 className="text-5xl font-bold mb-8 tracking-tight">CFC Owners Meeting</h1>

        {!session ? (
          <PopCard className="w-full max-w-md">
            <p className="mb-3 text-sm text-[rgba(11,11,15,0.7)]">Select Your Team</p>
            {error && <p className="text-[var(--accent-red)] mb-2 text-sm">{error}</p>}
            {teamsLoading ? (
              <p className="text-[rgba(11,11,15,0.65)]">Loading teams…</p>
            ) : (
              <>
                <select
                  className="bg-[var(--card-surface)] border-[var(--border-width)] border-[var(--border)] p-3 rounded-[var(--radius)] text-[var(--ink)] w-full shadow-[var(--shadow-style)]"
                  value={selectedTeamId}
                  onChange={(e) => {
                    setSelectedTeamId(e.target.value);
                  }}
                >
                  <option value="">-- Choose Team --</option>
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
                <PrimaryButton className="mt-4 w-full" disabled={!selectedTeamId} onClick={handleEnterMeeting}>
                  Enter meeting room
                </PrimaryButton>
              </>
            )}
          </PopCard>
        ) : (
          <PopCard className="text-center max-w-2xl w-full">
            <h2 className="text-3xl mb-2 tracking-tight">Welcome, {session.team_name}</h2>
            {isCommissioner && (
              <p className="text-[var(--accent-green)] font-semibold mb-6">You are the Commissioner</p>
            )}
            <PrimaryButton className="mt-4" onClick={handleEnterMeeting}>
              Enter meeting room
            </PrimaryButton>
          </PopCard>
        )}
      </main>
    </>
  );
}
