import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { COMMISSIONER_TEAM_NAME, PROPOSAL_STATUSES } from "@/lib/constants";
import { isHtmlContent, isEmptyHtml } from "@/lib/html-utils";

async function requireCommissionerSession() {
  const session = await getSession();
  if (!session || session.team_name !== COMMISSIONER_TEAM_NAME) {
    return null;
  }
  return session;
}

function buildRationale(pros: string | null | undefined, cons: string | null | undefined): string {
  // Handle both HTML content (from rich text editor) and plain text (legacy)
  const prosStr = pros || "";
  const consStr = cons || "";

  if (isHtmlContent(prosStr) || isHtmlContent(consStr)) {
    // For HTML content, store as-is with markers
    const lines: string[] = [];
    if (!isEmptyHtml(prosStr)) {
      lines.push("[PROS]");
      lines.push(prosStr);
    }
    if (!isEmptyHtml(consStr)) {
      lines.push("[CONS]");
      lines.push(consStr);
    }
    return lines.join("\n");
  }

  // Plain text: split by newlines and format as before
  const prosLines = prosStr.split("\n").map((l) => l.trim()).filter(Boolean);
  const consLines = consStr.split("\n").map((l) => l.trim()).filter(Boolean);
  if (prosLines.length === 0 && consLines.length === 0) return "";
  const lines: string[] = [];
  lines.push("[PROS]");
  for (const line of prosLines) {
    lines.push(line.startsWith("-") ? line : `- ${line}`);
  }
  lines.push("[CONS]");
  for (const line of consLines) {
    lines.push(line.startsWith("-") ? line : `- ${line}`);
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await requireCommissionerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.meeting_id || !body.agenda_item_id || !body.title) {
    return NextResponse.json(
      { error: "meeting_id, agenda_item_id, and title are required" },
      { status: 400 }
    );
  }

  const sb = getSupabaseServer();

  // Insert proposal with status 'open' (immediately active)
  const { data, error } = await sb
    .from("proposals")
    .insert({
      meeting_id: body.meeting_id,
      agenda_item_id: body.agenda_item_id,
      title: body.title,
      summary: body.summary || null,
      effective_date: body.effective_date || null,
      status: "open",
      order_index: body.order_index ?? 0,
      proposed_by: body.proposed_by || null,
      proposal_type: body.proposal_type || "proposal",
      pros: body.pros || null,
      cons: body.cons || null,
      article_sections: body.article_sections || [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create proposal", details: error.message, code: error.code },
      { status: 500 }
    );
  }

  // Auto-create a proposal_version (v1) for compatibility with voting system
  const rationale = buildRationale(body.pros || "", body.cons || "") || null;
  const { error: versionError } = await sb
    .from("proposal_versions")
    .insert({
      proposal_id: data.id,
      version_number: 1,
      full_text: body.summary || body.title,
      rationale,
      created_by_team: session.team_name,
      is_active: true,
    });

  if (versionError) {
    console.error("Failed to auto-create proposal version:", versionError.message);
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await requireCommissionerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.effective_date !== undefined) updates.effective_date = body.effective_date;
  if (body.order_index !== undefined) updates.order_index = body.order_index;
  if (body.proposed_by !== undefined) updates.proposed_by = body.proposed_by;
  if (body.proposal_type !== undefined) updates.proposal_type = body.proposal_type;
  if (body.pros !== undefined) updates.pros = body.pros;
  if (body.cons !== undefined) updates.cons = body.cons;
  if (body.article_sections !== undefined) updates.article_sections = body.article_sections;
  if (body.status !== undefined) {
    if (!PROPOSAL_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${PROPOSAL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("proposals")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update proposal", details: error.message, code: error.code },
      { status: 500 }
    );
  }

  // Also update the active proposal_version if pros/cons/summary changed
  if (body.pros !== undefined || body.cons !== undefined || body.summary !== undefined) {
    const rationale = buildRationale(body.pros ?? data.pros, body.cons ?? data.cons) || null;
    const fullText = body.summary ?? data.summary ?? data.title;

    const { error: versionError } = await sb
      .from("proposal_versions")
      .update({ full_text: fullText, rationale })
      .eq("proposal_id", body.id)
      .eq("is_active", true);

    if (versionError) {
      console.error("Failed to update proposal version:", versionError.message);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await requireCommissionerSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const sb = getSupabaseServer();

  // Delete proposal_versions first
  const { error: versionsError } = await sb
    .from("proposal_versions")
    .delete()
    .eq("proposal_id", body.id);

  if (versionsError) {
    return NextResponse.json(
      { error: "Failed to delete proposal versions", details: versionsError.message },
      { status: 500 }
    );
  }

  // Then delete the proposal
  const { error } = await sb.from("proposals").delete().eq("id", body.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete proposal", details: error.message, code: error.code },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
