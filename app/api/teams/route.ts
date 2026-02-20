import { NextResponse } from "next/server";

const LEAGUE_ID = "1328902558617473024";

interface SleeperUser {
  user_id: string;
  display_name: string;
  metadata?: {
    team_name?: string;
  };
}

export async function GET() {
  try {
    const res = await fetch(
      `https://api.sleeper.app/v1/league/${LEAGUE_ID}/users`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to load teams (HTTP ${res.status})` },
        { status: res.status }
      );
    }

    const users: SleeperUser[] = await res.json();

    const teams = users.map((u) => ({
      teamId: u.user_id,
      teamName: u.metadata?.team_name || u.display_name,
    }));

    teams.sort((a, b) => a.teamName.localeCompare(b.teamName));

    return NextResponse.json(teams);
  } catch (err) {
    console.error("Failed to fetch Sleeper league users:", err);
    return NextResponse.json(
      { error: "Failed to load teams" },
      { status: 502 }
    );
  }
}
