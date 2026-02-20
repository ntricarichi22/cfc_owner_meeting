"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import { getMeetings } from "@/lib/actions";
import type { Meeting } from "@/lib/types";

export default function HistoryPage() {
  const { session, loading, logout } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    getMeetings()
      .then((data) => setMeetings(data as Meeting[]))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load meetings"));
  }, [session]);

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-8">Not logged in.</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={session.role === "commissioner"} onLogout={logout} />

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Meeting History</h1>

        {error && <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded mb-4">{error}</div>}

        {meetings.length === 0 && !error && (
          <p className="text-gray-500">No meetings found.</p>
        )}

        <div className="space-y-3">
          {meetings.map((m) => (
            <Link
              key={m.id}
              href={`/history/${m.club_year}`}
              className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-lg">{m.club_year} Season</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  m.status === "finalized"
                    ? "bg-green-900 text-green-300"
                    : m.status === "live"
                    ? "bg-yellow-900 text-yellow-300"
                    : "bg-gray-800 text-gray-400"
                }`}>
                  {m.status}
                </span>
              </div>
              {m.meeting_date && (
                <p className="text-gray-400 text-sm mt-1">{new Date(m.meeting_date).toLocaleDateString()}</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
