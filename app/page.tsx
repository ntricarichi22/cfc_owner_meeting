"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/TeamSelector";
import Nav from "@/components/Nav";

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
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <>
      <Nav teamName={session?.team_name} isCommissioner={isCommissioner} onLogout={logout} />
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-5xl font-bold mb-8">CFC Owners Meeting</h1>

        {!session ? (
          <div className="bg-gray-900 p-8 rounded-xl shadow-lg">
            <p className="mb-4 text-gray-400">Select Your Team</p>
            {error && <p className="text-red-400 mb-2 text-sm">{error}</p>}
            {teamsLoading ? (
              <p className="text-gray-500">Loading teams…</p>
            ) : (
              <>
                <select
                  className="bg-black border border-gray-700 p-3 rounded-lg text-white w-64"
                  value={selectedTeamId}
                  onChange={(e) => {
                    setSelectedTeamId(e.target.value);
                  }}
                >
                  <option value="">-- Choose Team --</option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
                <button
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg disabled:opacity-50"
                  disabled={!selectedTeamId}
                  onClick={handleEnterMeeting}
                >
                  Enter meeting room
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="text-center max-w-2xl w-full bg-gray-900 p-8 rounded-xl shadow-lg">
            <h2 className="text-3xl mb-2">Welcome, {session.team_name}</h2>
            {isCommissioner && (
              <p className="text-yellow-400 mb-6">You are the Commissioner</p>
            )}
            <button
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg"
              onClick={handleEnterMeeting}
            >
              Enter meeting room
            </button>
          </div>
        )}
      </main>
    </>
  );
}
