"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";
import { getMeetings } from "@/lib/actions";
import type { Meeting } from "@/lib/types";
import { Chip, PopCard } from "@/components/ui/primitives";

export default function HistoryPage() {
  const { session, loading, logout } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    getMeetings()
      .then((data) => setMeetings((data as Meeting[]).filter((m) => m.status === "finalized")))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load meetings"));
  }, [session]);

  if (loading) return <div className="min-h-screen bg-[var(--paper-bg)]" />;
  if (!session) return <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] p-8">Not logged in.</div>;

  return (
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
      <Nav teamName={session.team_name} isCommissioner={session.role === "commissioner"} onLogout={logout} />

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 tracking-tight">Meeting History</h1>

        {error && (
          <PopCard className="mb-4 border-[var(--accent-red)] text-[var(--ink)]">
            <p className="text-[var(--accent-red)] font-semibold">{error}</p>
          </PopCard>
        )}

        {meetings.length === 0 && !error && (
          <p className="text-[rgba(11,11,15,0.65)]">No meetings found.</p>
        )}

        <div className="space-y-3">
          {meetings.map((m) => (
            <PopCard key={m.id} className="p-0 hover:-translate-y-[1px] transition-transform">
              <Link
                href={`/history/${m.club_year}`}
                className="block px-5 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-lg tracking-tight">{m.club_year} Season</span>
                  <Chip className="text-xs px-3 py-1">
                    {m.status}
                  </Chip>
                </div>
                {m.meeting_date && (
                  <p className="text-[rgba(11,11,15,0.65)] text-sm mt-1">{new Date(m.meeting_date).toLocaleDateString()}</p>
                )}
              </Link>
            </PopCard>
          ))}
        </div>
      </div>
    </div>
  );
}
