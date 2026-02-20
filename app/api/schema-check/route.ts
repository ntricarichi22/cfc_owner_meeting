import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const requiredSchema: Record<string, string[]> = {
  leagues: ["id", "name", "created_at"],
  owners: [
    "id",
    "league_id",
    "display_name",
    "email",
    "team_name",
    "role",
    "created_at",
  ],
  meetings: [
    "id",
    "league_id",
    "club_year",
    "meeting_date",
    "status",
    "current_agenda_item_id",
    "created_at",
    "finalized_at",
  ],
  agenda_sections: ["id", "meeting_id", "title", "sort_order", "created_at"],
  agenda_items: [
    "id",
    "meeting_id",
    "section_id",
    "type",
    "title",
    "presenter_owner_id",
    "sort_order",
    "voting_required",
    "timer_duration_seconds",
    "timer_started_at",
    "timer_paused_at",
    "timer_remaining_seconds",
    "status",
    "created_at",
  ],
  proposals: [
    "id",
    "agenda_item_id",
    "summary",
    "pros",
    "cons",
    "effective_date",
    "created_at",
  ],
  proposal_versions: [
    "id",
    "proposal_id",
    "version_number",
    "full_text",
    "created_by_owner_id",
    "status",
    "created_at",
  ],
  amendments: [
    "id",
    "proposal_version_id",
    "suggested_text",
    "rationale",
    "submitted_by_owner_id",
    "status",
    "created_at",
  ],
  votes: [
    "id",
    "proposal_version_id",
    "owner_id",
    "choice",
    "created_at",
    "updated_at",
  ],
  constitution_articles: [
    "id",
    "league_id",
    "club_year",
    "article_num",
    "article_title",
    "sort_order",
  ],
  constitution_sections: [
    "id",
    "article_id",
    "section_num",
    "section_title",
    "body",
    "anchor",
    "sort_order",
  ],
  proposal_constitution_links: [
    "id",
    "proposal_id",
    "constitution_section_id",
  ],
  meeting_minutes: [
    "id",
    "meeting_id",
    "minutes_markdown",
    "email_subject",
    "email_body_html",
    "emailed_at",
  ],
  team_sessions: ["id", "team_id", "team_name", "created_at"],
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
