import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const requiredSchema: Record<string, string[]> = {
  constitution_sections: ["id", "section_key", "title", "body", "updated_at"],
  meetings: ["id", "year", "title", "status", "locked", "created_at"],
  agenda_items: [
    "id",
    "meeting_id",
    "order_index",
    "category",
    "title",
    "created_at",
  ],
  proposals: [
    "id",
    "meeting_id",
    "agenda_item_id",
    "title",
    "summary",
    "effective_date",
    "status",
    "created_at",
  ],
  proposal_versions: [
    "id",
    "proposal_id",
    "version_number",
    "full_text",
    "rationale",
    "created_by_team",
    "created_at",
    "is_active",
  ],
  amendments: [
    "id",
    "proposal_id",
    "proposed_text",
    "rationale",
    "submitted_by_team",
    "created_at",
    "status",
  ],
  votes: [
    "id",
    "proposal_version_id",
    "team_id",
    "team_name",
    "vote",
    "created_at",
  ],
  audit_events: [
    "id",
    "meeting_id",
    "proposal_id",
    "event_type",
    "payload_json",
    "created_at",
  ],
};

export async function GET() {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb.rpc("get_public_columns");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const existing = new Map<string, Set<string>>();
    for (const row of data ?? []) {
      const t = row.table_name as string;
      if (!existing.has(t)) existing.set(t, new Set());
      existing.get(t)!.add(row.column_name as string);
    }

    const missing: Record<string, string[]> = {};
    for (const [table, columns] of Object.entries(requiredSchema)) {
      const cols = existing.get(table);
      if (!cols) {
        missing[table] = columns;
      } else {
        const absent = columns.filter((c) => !cols.has(c));
        if (absent.length > 0) missing[table] = absent;
      }
    }

    if (Object.keys(missing).length === 0) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, missing }, { status: 500 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
