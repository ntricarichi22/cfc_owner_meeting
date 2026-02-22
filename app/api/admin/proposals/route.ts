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
  const { data, error } = await sb
    .from("proposals")
    .insert({
      meeting_id: body.meeting_id,
      agenda_item_id: body.agenda_item_id,
      title: body.title,
      summary: body.summary || null,
      effective_date: body.effective_date || null,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create proposal", details: error.message, code: error.code },
      { status: 500 }
    );
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
  if (body.status !== undefined) {
    const valid = ["draft", "open", "passed", "failed", "tabled"];
    if (!valid.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${valid.join(", ")}` },
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
