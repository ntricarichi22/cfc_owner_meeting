"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import { Chip, PopCard } from "@/components/ui/primitives";

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

  if (loading) return <div className="min-h-screen bg-[var(--paper-bg)]" />;
  if (!session) return <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] p-6">Not logged in.</div>;

  return (
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
      <main className="max-w-4xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Past Meetings</h1>
        <div className="flex flex-wrap gap-2">
          <select value={year} onChange={(e) => setYear(e.target.value)} className="bg-[var(--card-surface)] border-[var(--border-width)] border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm shadow-[var(--shadow-style)]">
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="bg-[var(--card-surface)] border-[var(--border-width)] border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm shadow-[var(--shadow-style)]">
            <option value="">All outcomes</option>
            <option value="passed">Has passed</option>
            <option value="failed">Has failed</option>
          </select>
        </div>

        <div className="space-y-2">
          {meetings.map((meeting) => (
            <PopCard key={meeting.id} className="p-4">
              <div className="flex justify-between items-center gap-3">
                <h2 className="font-semibold">{meeting.year} — {meeting.title}</h2>
                <Chip className="text-xs px-3 py-1">
                  {meeting.locked ? "Locked" : "Unlocked"}
                </Chip>
              </div>
              <p className="text-sm text-[rgba(11,11,15,0.7)] mt-2">Passed: {meeting.passedCount} • Failed: {meeting.failedCount}</p>
            </PopCard>
          ))}
          {!meetings.length && <p className="text-sm text-[rgba(11,11,15,0.6)]">No meetings found.</p>}
        </div>
      </main>
    </div>
  );
}
