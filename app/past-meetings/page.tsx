"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";

type PastMeeting = {
  id: string;
  year: number;
  title: string;
  locked: boolean;
  passedCount: number;
  failedCount: number;
};

export default function PastMeetingsPage() {
  const { session, loading, isCommissioner, logout } = useSession();
  const [meetings, setMeetings] = useState<PastMeeting[]>([]);
  const [year, setYear] = useState<string>("");
  const [outcome, setOutcome] = useState<string>("");

  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (outcome) params.set("outcome", outcome);
    fetch(`/api/past-meetings?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setMeetings(Array.isArray(data) ? data : []))
      .catch(() => setMeetings([]));
  }, [session, year, outcome]);

  const years = useMemo(
    () => [...new Set(meetings.map((meeting) => meeting.year))].sort((a, b) => b - a),
    [meetings]
  );

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-6">Not logged in.</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
      <main className="max-w-4xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Past Meetings</h1>
        <div className="flex gap-2">
          <select value={year} onChange={(e) => setYear(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm">
            <option value="">All outcomes</option>
            <option value="passed">Has passed</option>
            <option value="failed">Has failed</option>
          </select>
        </div>

        <div className="space-y-2">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="border border-gray-800 rounded p-4 bg-gray-900">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold">{meeting.year} — {meeting.title}</h2>
                <span className={`text-xs px-2 py-0.5 rounded ${meeting.locked ? "bg-red-900 text-red-200" : "bg-green-900 text-green-200"}`}>
                  {meeting.locked ? "Locked" : "Unlocked"}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-2">Passed: {meeting.passedCount} • Failed: {meeting.failedCount}</p>
            </div>
          ))}
          {!meetings.length && <p className="text-sm text-gray-500">No meetings found.</p>}
        </div>
      </main>
    </div>
  );
}

