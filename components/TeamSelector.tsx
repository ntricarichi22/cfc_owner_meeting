"use client";

import { useEffect, useState, useCallback } from "react";

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

  // We store session in localStorage as a cache; the real auth is the signed cookie
  useEffect(() => {
    const cached = localStorage.getItem("cfc_session");
    if (cached) {
      try {
        setSession(JSON.parse(cached));
      } catch {
        // ignore
      }
    }
    setLoading(false);
  }, []);

  const selectTeam = useCallback(async (teamName: string) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_name: teamName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to select team");
    }
    const data = await res.json();
    const s: SessionData = {
      owner_id: data.owner_id,
      team_name: data.team_name,
      display_name: data.display_name,
      role: data.role,
      league_id: data.league_id,
    };
    setSession(s);
    localStorage.setItem("cfc_session", JSON.stringify(s));
    return s;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" });
    setSession(null);
    localStorage.removeItem("cfc_session");
  }, []);

  return { session, loading, selectTeam, logout, isCommissioner: session?.role === "commissioner" };
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
