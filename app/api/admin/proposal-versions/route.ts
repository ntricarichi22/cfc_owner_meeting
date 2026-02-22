import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME } from "@/lib/constants";

async function requireCommissionerSession() {
  const session = await getSession();
  if (!session || session.team_name !== COMMISSIONER_TEAM_NAME) {
    return null;
  }
  return session;
}

function buildRationale(pros: string, cons: string): string {
  const lines: string[] = [];
  lines.push("[PROS]");
  for (const line of pros.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      lines.push(trimmed.startsWith("-") ? trimmed : `- ${trimmed}`);
    }
  }
  lines.push("[CONS]");
  for (const line of cons.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      lines.push(trimmed.startsWith("-") ? trimmed : `- ${trimmed}`);
    }
  }
  return lines.join("\n");
}

// GET - fetch version history for a proposal
export async function GET(req: NextRequest) {
  const session = await requireCommissionerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const proposalId = req.nextUrl.searchParams.get("proposalId");
  if (!proposalId) {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("proposal_versions")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("version_number", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch versions", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

// POST - create a new active version (deactivates previous)
export async function POST(req: NextRequest) {
  const session = await requireCommissionerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.proposal_id || !body.full_text) {
    return NextResponse.json(
      { error: "proposal_id and full_text are required" },
      { status: 400 }
    );
  }

  const sb = getSupabaseServer();

  // Get current max version_number
  const { data: existing } = await sb
    .from("proposal_versions")
    .select("version_number")
    .eq("proposal_id", body.proposal_id)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = existing && existing.length > 0 ? existing[0].version_number + 1 : 1;

  // Deactivate all existing versions
  const { error: deactivateError } = await sb
    .from("proposal_versions")
    .update({ is_active: false })
    .eq("proposal_id", body.proposal_id);

  if (deactivateError) {
    return NextResponse.json(
      { error: "Failed to deactivate previous versions", details: deactivateError.message },
      { status: 500 }
    );
  }

  const rationale = buildRationale(body.pros || "", body.cons || "");

  // Insert new active version
  const { data, error } = await sb
    .from("proposal_versions")
    .insert({
      proposal_id: body.proposal_id,
      version_number: nextVersion,
      full_text: body.full_text,
      rationale,
      created_by_team: session.team_name,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create version", details: error.message, code: error.code },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
