import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";
import {
  getAmendments,
  promoteAmendment,
  rejectAmendment,
} from "@/lib/actions";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposalId = req.nextUrl.searchParams.get("proposalId");
  if (!proposalId) {
    return NextResponse.json({ error: "proposalId query parameter is required" }, { status: 400 });
  }

  try {
    const data = await getAmendments(proposalId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch amendments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const rawTeamCookie = req.cookies.get("cfc_team_session")?.value;
  let cookiePayload: string | null = rawTeamCookie || null;
  if (rawTeamCookie) {
    try {
      const parsed = JSON.parse(rawTeamCookie) as { teamId?: string; teamName?: string };
      cookiePayload = parsed.teamId || parsed.teamName || rawTeamCookie;
    } catch {
      cookiePayload = rawTeamCookie;
    }
  }
  const fallbackSession = await getSession();
  const sessionLookup = cookiePayload || fallbackSession?.owner_id || fallbackSession?.team_name;
  if (!sessionLookup) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionByTeamId = await sb
    .from("team_sessions")
    .select("team_name")
    .eq("team_id", sessionLookup)
    .order("created_at", { ascending: false })
    .limit(1);
  if (sessionByTeamId.error) {
    return NextResponse.json(
      {
        error: "Supabase error",
        code: sessionByTeamId.error.code,
        message: sessionByTeamId.error.message,
      },
      { status: sessionByTeamId.status || 500 }
    );
  }
  let teamSession = sessionByTeamId.data?.[0];
  if (!teamSession) {
    const sessionByName = await sb
      .from("team_sessions")
      .select("team_name")
      .eq("team_name", sessionLookup)
      .order("created_at", { ascending: false })
      .limit(1);
    if (sessionByName.error) {
      return NextResponse.json(
        {
          error: "Supabase error",
          code: sessionByName.error.code,
          message: sessionByName.error.message,
        },
        { status: sessionByName.status || 500 }
      );
    }
    teamSession = sessionByName.data?.[0];
  }
  if (!teamSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (teamSession.team_name !== "Virginia Founders") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { proposalId, proposedText, rationale } = body as {
    proposalId?: string;
    proposedText?: string;
    rationale?: string;
  };

  if (!proposalId || !proposedText?.trim()) {
    return NextResponse.json(
      { error: "proposalId is required and proposedText cannot be empty" },
      { status: 400 }
    );
  }

  const result = await sb.from("amendments").insert({
    proposal_id: proposalId,
    proposed_text: proposedText,
    rationale: rationale || null,
    submitted_by_team: teamSession.team_name,
    status: "pending",
  });
  if (result.error) {
    return NextResponse.json(
      {
        error: "Supabase error",
        code: result.error.code,
        message: result.error.message,
      },
      { status: result.status || 500 }
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "commissioner") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { amendmentId, action } = body as {
    amendmentId?: string;
    action?: string;
  };

  if (!amendmentId || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ error: "amendmentId and action are required" }, { status: 400 });
  }

  try {
    if (action === "accept") {
      await promoteAmendment(amendmentId);
    } else {
      await rejectAmendment(amendmentId);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update amendment" },
      { status: 500 }
    );
  }
}
