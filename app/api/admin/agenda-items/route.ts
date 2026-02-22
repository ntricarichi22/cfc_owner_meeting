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
  if (!body || !body.meeting_id || !body.title || !body.category || body.order_index == null) {
    return NextResponse.json(
      { error: "meeting_id, title, category, and order_index are required" },
      { status: 400 }
    );
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("agenda_items")
    .insert({
      meeting_id: body.meeting_id,
      title: body.title,
      category: body.category,
      order_index: body.order_index,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create agenda item", details: error.message, code: error.code },
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
  if (body.category !== undefined) updates.category = body.category;
  if (body.order_index !== undefined) updates.order_index = body.order_index;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("agenda_items")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update agenda item", details: error.message, code: error.code },
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

  // 1. Get all proposals for this agenda item
  const { data: proposals } = await sb
    .from("proposals")
    .select("id")
    .eq("agenda_item_id", body.id);

  if (proposals && proposals.length > 0) {
    const proposalIds = proposals.map((p) => p.id);

    // 2. Delete proposal_versions for these proposals
    const { error: versionsError } = await sb
      .from("proposal_versions")
      .delete()
      .in("proposal_id", proposalIds);

    if (versionsError) {
      return NextResponse.json(
        { error: "Failed to delete proposal versions", details: versionsError.message },
        { status: 500 }
      );
    }

    // 3. Delete proposals
    const { error: proposalsError } = await sb
      .from("proposals")
      .delete()
      .eq("agenda_item_id", body.id);

    if (proposalsError) {
      return NextResponse.json(
        { error: "Failed to delete proposals", details: proposalsError.message },
        { status: 500 }
      );
    }
  }

  // 4. Delete the agenda item itself
  const { error } = await sb.from("agenda_items").delete().eq("id", body.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete agenda item", details: error.message, code: error.code },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
