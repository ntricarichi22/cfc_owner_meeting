"use client";

import { useEffect, useState } from "react";

interface Team {
  id: number;
  name: string;
}

export default function Home() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");

  useEffect(() => {
    async function fetchTeams() {
      try {
        const leagueId = "1328902558617473024";

        const rosterRes = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/rosters`
        );
        const rosters = await rosterRes.json();

        const userRes = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/users`
        );
        const users = await userRes.json();

        const mappedTeams: Team[] = rosters.map((roster: any) => {
          const user = users.find(
            (u: any) => u.user_id === roster.owner_id
          );

          return {
            id: roster.roster_id,
            name:
              user?.metadata?.team_name ||
              user?.display_name ||
              "Unknown Team",
          };
        });

        setTeams(mappedTeams);
      } catch (error) {
        console.error("Error fetching Sleeper data:", error);
      }
    }

    fetchTeams();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-5xl font-bold mb-8">
        TGIF Dynasty Rookie Draft
      </h1>

      {!selectedTeam ? (
        <div className="bg-gray-900 p-8 rounded-xl shadow-lg">
          <p className="mb-4 text-gray-400">Select Your Team</p>

          <select
            className="bg-black border border-gray-700 p-3 rounded-lg text-white w-64"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
          >
            <option value="">-- Choose Team --</option>
            {teams.map((team) => (
              <option key={team.id} value={team.name}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="text-center">
          <h2 className="text-3xl mb-4">
            Welcome, {selectedTeam}
          </h2>
          <p className="text-gray-400">
            Draft room loading...
          </p>
        </div>
      )}
    </main>
  );
}
