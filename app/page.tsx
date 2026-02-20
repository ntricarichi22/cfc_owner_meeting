"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/TeamSelector";
import Nav from "@/components/Nav";
import Link from "next/link";

interface Owner {
  id: string;
  team_name: string;
  display_name: string;
  role: string;
}

interface Meeting {
  id: string;
  club_year: number;
  status: string;
  meeting_date: string | null;
}

export default function Home() {
  const { session, loading, selectTeam, logout, isCommissioner } = useSession();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch owners list for team selector (using supabase browser or API)
    fetch("/api/owners")
      .then((r) => r.json())
      .then(setOwners)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (session) {
      fetch("/api/meetings")
        .then((r) => r.json())
        .then(setMeetings)
        .catch(() => {});
    }
  }, [session]);

  const handleSelect = async (teamName: string) => {
    try {
      setError("");
      await selectTeam(teamName);
      // Reload meetings after login
      const r = await fetch("/api/meetings");
      setMeetings(await r.json());
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
            <select
              className="bg-black border border-gray-700 p-3 rounded-lg text-white w-64"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleSelect(e.target.value);
              }}
            >
              <option value="">-- Choose Team --</option>
              {owners.map((o) => (
                <option key={o.id} value={o.team_name}>
                  {o.team_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-center max-w-2xl w-full">
            <h2 className="text-3xl mb-2">Welcome, {session.team_name}</h2>
            {isCommissioner && (
              <p className="text-yellow-400 mb-6">You are the Commissioner</p>
            )}

            <div className="mt-8 space-y-4">
              <h3 className="text-xl text-gray-300 mb-4">Meetings</h3>
              {meetings.length === 0 ? (
                <p className="text-gray-500">No meetings found. {isCommissioner ? "Create one in Admin." : ""}</p>
              ) : (
                <div className="grid gap-3">
                  {meetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meeting/${m.club_year}`}
                      className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold">{m.club_year} Meeting</span>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            m.status === "live"
                              ? "bg-green-700 text-green-100"
                              : m.status === "finalized"
                              ? "bg-blue-700 text-blue-100"
                              : "bg-gray-700 text-gray-300"
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                      {m.meeting_date && (
                        <p className="text-gray-500 text-sm mt-1">{m.meeting_date}</p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
