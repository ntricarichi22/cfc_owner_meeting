"use client";

import { useEffect, useState, useCallback } from "react";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";

interface SessionData {
  owner_id: string;
  team_name: string;
  display_name: string;
  role: "commissioner" | "owner";
  league_id: string;
}

interface Owner {
  id: string;
  team_name: string;
  display_name: string;
  role: string;
}

export function useSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/session")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as SessionData;
      })
      .then((data) => setSession(data))
      .finally(() => setLoading(false));
  }, []);

  const selectTeam = useCallback(async (teamId: string, teamName: string) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, teamName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to select team");
    }
    const s: SessionData = {
      owner_id: teamId,
      team_name: teamName,
      display_name: teamName,
      role: "owner",
      league_id: "",
    };
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/session/release", { method: "POST" });
    setSession(null);
  }, []);

  return { session, loading, selectTeam, logout, isCommissioner: session?.team_name === COMMISSIONER_TEAM_NAME };
}

export function TeamSelector({ owners, onSelect }: { owners: Owner[]; onSelect: (name: string) => void }) {
  return (
    <div className="bg-gray-900 p-8 rounded-xl shadow-lg">
      <p className="mb-4 text-gray-400">Select Your Team</p>
      <select
        className="bg-black border border-gray-700 p-3 rounded-lg text-white w-64"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
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
  );
}
