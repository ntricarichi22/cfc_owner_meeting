"use server";

import { getSupabaseServer } from "@/lib/supabase-server";
import { getSession, requireCommissioner, requireOwner } from "@/lib/session";
import { VOTE_THRESHOLD, TOTAL_OWNERS } from "@/lib/types";

const sb = () => getSupabaseServer();

// ─── Owners ───────────────────────────────────────────────
export async function getOwners() {
  const session = await getSession();
  if (!session) return [];
  const { data } = await sb()
    .from("owners")
    .select("*")
    .eq("league_id", session.league_id)
    .order("team_name");
  return data || [];
}

export async function updateOwner(id: string, fields: { display_name?: string; email?: string; team_name?: string }) {
  await requireCommissioner();
  const { error } = await sb().from("owners").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createOwner(fields: { display_name: string; email?: string; team_name: string }) {
  const session = await requireCommissioner();
  const { error } = await sb().from("owners").insert({
    ...fields,
    league_id: session.league_id,
    role: "owner",
  });
  if (error) throw new Error(error.message);
}

// ─── Meetings ─────────────────────────────────────────────
export async function getMeetings() {
  const session = await getSession();
  if (!session) return [];
  const { data } = await sb()
    .from("meetings")
    .select("*")
    .eq("league_id", session.league_id)
    .order("club_year", { ascending: false });
  return data || [];
}

export async function getMeeting(year: number) {
  const session = await getSession();
  if (!session) return null;
  const { data } = await sb()
    .from("meetings")
    .select("*")
    .eq("league_id", session.league_id)
    .eq("club_year", year)
    .single();
  return data;
}

export async function createMeeting(club_year: number, meeting_date?: string) {
  const session = await requireCommissioner();
  const { error } = await sb().from("meetings").insert({
    league_id: session.league_id,
    club_year,
    meeting_date: meeting_date || null,
    status: "draft",
  });
  if (error) throw new Error(error.message);
}

export async function updateMeetingStatus(meetingId: string, status: string) {
  await requireCommissioner();
  const updates: Record<string, unknown> = { status };
  if (status === "finalized") updates.finalized_at = new Date().toISOString();
  const { error } = await sb().from("meetings").update(updates).eq("id", meetingId);
  if (error) throw new Error(error.message);
}

export async function setCurrentAgendaItem(meetingId: string, itemId: string | null) {
  await requireCommissioner();
  const { error } = await sb()
    .from("meetings")
    .update({ current_agenda_item_id: itemId })
    .eq("id", meetingId);
  if (error) throw new Error(error.message);
}

// ─── Agenda Sections ──────────────────────────────────────
export async function getAgendaSections(meetingId: string) {
  const { data } = await sb()
    .from("agenda_sections")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("sort_order");
  return data || [];
}

export async function createAgendaSection(meetingId: string, title: string, sortOrder: number) {
  await requireCommissioner();
  const { error } = await sb().from("agenda_sections").insert({
    meeting_id: meetingId,
    title,
    sort_order: sortOrder,
  });
  if (error) throw new Error(error.message);
}

export async function updateAgendaSection(id: string, fields: { title?: string; sort_order?: number }) {
  await requireCommissioner();
  const { error } = await sb().from("agenda_sections").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAgendaSection(id: string) {
  await requireCommissioner();
  const { error } = await sb().from("agenda_sections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Agenda Items ─────────────────────────────────────────
export async function getAgendaItems(meetingId: string) {
  const { data } = await sb()
    .from("agenda_items")
    .select("*, proposals(*)")
    .eq("meeting_id", meetingId)
    .order("sort_order");
  return data || [];
}

export async function createAgendaItem(meetingId: string, fields: {
  section_id?: string;
  type: string;
  title: string;
  voting_required?: boolean;
  timer_duration_seconds?: number;
  sort_order?: number;
}) {
  await requireCommissioner();
  const { data, error } = await sb()
    .from("agenda_items")
    .insert({
      meeting_id: meetingId,
      section_id: fields.section_id || null,
      type: fields.type,
      title: fields.title,
      voting_required: fields.voting_required ?? (fields.type === "proposal"),
      timer_duration_seconds: fields.timer_duration_seconds || 600,
      sort_order: fields.sort_order || 0,
      status: "not_started",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // If proposal type, create proposal + initial version
  if (fields.type === "proposal" && data) {
    const { data: proposal, error: pErr } = await sb()
      .from("proposals")
      .insert({ agenda_item_id: data.id })
      .select()
      .single();
    if (pErr) throw new Error(pErr.message);
    if (proposal) {
      await sb().from("proposal_versions").insert({
        proposal_id: proposal.id,
        version_number: 1,
        full_text: "",
        status: "active",
      });
    }
  }
  return data;
}

export async function updateAgendaItem(id: string, fields: Record<string, unknown>) {
  await requireCommissioner();
  const { error } = await sb().from("agenda_items").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAgendaItem(id: string) {
  await requireCommissioner();
  const { error } = await sb().from("agenda_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Proposals ────────────────────────────────────────────
export async function getProposal(agendaItemId: string) {
  const { data } = await sb()
    .from("proposals")
    .select("*, proposal_versions(*)")
    .eq("agenda_item_id", agendaItemId)
    .single();
  return data;
}

export async function updateProposal(id: string, fields: { summary?: string; pros?: string; cons?: string; effective_date?: string }) {
  await requireCommissioner();
  const { error } = await sb().from("proposals").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getProposalVersions(proposalId: string) {
  const { data } = await sb()
    .from("proposal_versions")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("version_number");
  return data || [];
}

export async function updateProposalVersion(id: string, fields: { full_text?: string; status?: string }) {
  await requireCommissioner();
  const { error } = await sb().from("proposal_versions").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Amendments ───────────────────────────────────────────
export async function getAmendments(proposalVersionId: string) {
  const { data } = await sb()
    .from("amendments")
    .select("*, submitted_by:owners!amendments_submitted_by_owner_id_fkey(display_name, team_name)")
    .eq("proposal_version_id", proposalVersionId)
    .order("created_at");
  return data || [];
}

export async function submitAmendment(proposalVersionId: string, suggestedText: string, rationale?: string) {
  const session = await requireOwner();
  const { error } = await sb().from("amendments").insert({
    proposal_version_id: proposalVersionId,
    suggested_text: suggestedText,
    rationale: rationale || null,
    submitted_by_owner_id: session.owner_id,
    status: "submitted",
  });
  if (error) throw new Error(error.message);
}

export async function promoteAmendment(amendmentId: string) {
  await requireCommissioner();
  const { data: amendment } = await sb()
    .from("amendments")
    .select("*, proposal_version:proposal_versions!amendments_proposal_version_id_fkey(proposal_id, version_number)")
    .eq("id", amendmentId)
    .single();
  if (!amendment) throw new Error("Amendment not found");

  const pv = amendment.proposal_version as unknown as { proposal_id: string; version_number: number };

  // Mark amendment as promoted
  await sb().from("amendments").update({ status: "promoted" }).eq("id", amendmentId);

  // Supersede current active version
  await sb()
    .from("proposal_versions")
    .update({ status: "superseded" })
    .eq("proposal_id", pv.proposal_id)
    .eq("status", "active");

  // Create new version
  const session = await getSession();
  const { error } = await sb().from("proposal_versions").insert({
    proposal_id: pv.proposal_id,
    version_number: pv.version_number + 1,
    full_text: amendment.suggested_text,
    created_by_owner_id: session?.owner_id || null,
    status: "active",
  });
  if (error) throw new Error(error.message);
}

// ─── Voting ───────────────────────────────────────────────
export async function openVoting(agendaItemId: string) {
  await requireCommissioner();
  const { error } = await sb()
    .from("agenda_items")
    .update({ status: "voting_open" })
    .eq("id", agendaItemId);
  if (error) throw new Error(error.message);
}

export async function castVote(proposalVersionId: string, choice: "yes" | "no") {
  const session = await requireOwner();
  const { error } = await sb()
    .from("votes")
    .upsert(
      {
        proposal_version_id: proposalVersionId,
        owner_id: session.owner_id,
        choice,
      },
      { onConflict: "proposal_version_id,owner_id" }
    );
  if (error) throw new Error(error.message);
}

export async function getVotes(proposalVersionId: string) {
  const { data } = await sb()
    .from("votes")
    .select("*, owner:owners!votes_owner_id_fkey(display_name, team_name)")
    .eq("proposal_version_id", proposalVersionId);
  return data || [];
}

export async function getMyVote(proposalVersionId: string) {
  const session = await getSession();
  if (!session) return null;
  const { data } = await sb()
    .from("votes")
    .select("choice")
    .eq("proposal_version_id", proposalVersionId)
    .eq("owner_id", session.owner_id)
    .single();
  return data?.choice || null;
}

export async function tallyVotes(agendaItemId: string) {
  await requireCommissioner();

  // Get the active proposal version
  const { data: proposal } = await sb()
    .from("proposals")
    .select("id")
    .eq("agenda_item_id", agendaItemId)
    .single();
  if (!proposal) throw new Error("No proposal found");

  const { data: activeVersion } = await sb()
    .from("proposal_versions")
    .select("id")
    .eq("proposal_id", proposal.id)
    .eq("status", "active")
    .single();
  if (!activeVersion) throw new Error("No active version");

  const { data: votes } = await sb()
    .from("votes")
    .select("choice")
    .eq("proposal_version_id", activeVersion.id);

  if (!votes || votes.length < TOTAL_OWNERS) {
    throw new Error(`All ${TOTAL_OWNERS} owners must vote before tallying. Current: ${votes?.length || 0}`);
  }

  const yesCount = votes.filter((v) => v.choice === "yes").length;
  const passed = yesCount >= VOTE_THRESHOLD;

  // Mark version as final if passed
  if (passed) {
    await sb()
      .from("proposal_versions")
      .update({ status: "final" })
      .eq("id", activeVersion.id);
  }

  // Update agenda item status
  await sb()
    .from("agenda_items")
    .update({ status: "tallied" })
    .eq("id", agendaItemId);

  return { yesCount, noCount: votes.length - yesCount, passed };
}

// ─── Timer ────────────────────────────────────────────────
export async function startTimer(agendaItemId: string) {
  await requireCommissioner();
  const { data: item } = await sb()
    .from("agenda_items")
    .select("timer_duration_seconds, timer_remaining_seconds")
    .eq("id", agendaItemId)
    .single();
  if (!item) throw new Error("Item not found");

  const remaining = item.timer_remaining_seconds ?? item.timer_duration_seconds ?? 600;
  await sb()
    .from("agenda_items")
    .update({
      timer_started_at: new Date().toISOString(),
      timer_paused_at: null,
      timer_remaining_seconds: remaining,
      status: "in_discussion",
    })
    .eq("id", agendaItemId);
}

export async function pauseTimer(agendaItemId: string) {
  await requireCommissioner();
  const { data: item } = await sb()
    .from("agenda_items")
    .select("timer_started_at, timer_remaining_seconds")
    .eq("id", agendaItemId)
    .single();
  if (!item || !item.timer_started_at) return;

  const elapsed = Math.floor((Date.now() - new Date(item.timer_started_at).getTime()) / 1000);
  const remaining = Math.max(0, (item.timer_remaining_seconds || 600) - elapsed);

  await sb()
    .from("agenda_items")
    .update({
      timer_paused_at: new Date().toISOString(),
      timer_started_at: null,
      timer_remaining_seconds: remaining,
    })
    .eq("id", agendaItemId);
}

export async function resetTimer(agendaItemId: string) {
  await requireCommissioner();
  const { data: item } = await sb()
    .from("agenda_items")
    .select("timer_duration_seconds")
    .eq("id", agendaItemId)
    .single();

  await sb()
    .from("agenda_items")
    .update({
      timer_started_at: null,
      timer_paused_at: null,
      timer_remaining_seconds: item?.timer_duration_seconds || 600,
    })
    .eq("id", agendaItemId);
}

export async function extendTimer(agendaItemId: string, additionalSeconds: number = 600) {
  await requireCommissioner();
  const { data: item } = await sb()
    .from("agenda_items")
    .select("timer_remaining_seconds, timer_duration_seconds")
    .eq("id", agendaItemId)
    .single();

  const current = item?.timer_remaining_seconds ?? item?.timer_duration_seconds ?? 600;
  await sb()
    .from("agenda_items")
    .update({
      timer_remaining_seconds: current + additionalSeconds,
      timer_duration_seconds: (item?.timer_duration_seconds || 600) + additionalSeconds,
    })
    .eq("id", agendaItemId);
}

// ─── Constitution ─────────────────────────────────────────
export async function getConstitutionArticles(year?: number) {
  const session = await getSession();
  if (!session) return [];
  let query = sb()
    .from("constitution_articles")
    .select("*, constitution_sections(*)")
    .eq("league_id", session.league_id)
    .order("sort_order");
  if (year) query = query.eq("club_year", year);
  const { data } = await query;
  return data || [];
}

export async function getConstitutionSectionByAnchor(anchor: string) {
  const session = await getSession();
  if (!session) return null;
  const { data } = await sb()
    .from("constitution_sections")
    .select("*, article:constitution_articles!constitution_sections_article_id_fkey(*)")
    .eq("anchor", anchor)
    .single();
  return data;
}

export async function createConstitutionArticle(fields: {
  club_year: number;
  article_num: string;
  article_title: string;
  sort_order?: number;
}) {
  const session = await requireCommissioner();
  const { error } = await sb().from("constitution_articles").insert({
    league_id: session.league_id,
    ...fields,
    sort_order: fields.sort_order || 0,
  });
  if (error) throw new Error(error.message);
}

export async function updateConstitutionArticle(id: string, fields: {
  article_num?: string;
  article_title?: string;
  sort_order?: number;
}) {
  await requireCommissioner();
  const { error } = await sb().from("constitution_articles").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteConstitutionArticle(id: string) {
  await requireCommissioner();
  const { error } = await sb().from("constitution_articles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createConstitutionSection(fields: {
  article_id: string;
  section_num: string;
  section_title: string;
  body: string;
  anchor: string;
  sort_order?: number;
}) {
  await requireCommissioner();
  const { error } = await sb().from("constitution_sections").insert({
    ...fields,
    sort_order: fields.sort_order || 0,
  });
  if (error) throw new Error(error.message);
}

export async function updateConstitutionSection(id: string, fields: {
  section_num?: string;
  section_title?: string;
  body?: string;
  anchor?: string;
  sort_order?: number;
}) {
  await requireCommissioner();
  const { error } = await sb().from("constitution_sections").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteConstitutionSection(id: string) {
  await requireCommissioner();
  const { error } = await sb().from("constitution_sections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Proposal Constitution Links ─────────────────────────
export async function getProposalConstitutionLinks(proposalId: string) {
  const { data } = await sb()
    .from("proposal_constitution_links")
    .select("*, section:constitution_sections!proposal_constitution_links_constitution_section_id_fkey(id, anchor, section_title, section_num, article:constitution_articles!constitution_sections_article_id_fkey(article_num, article_title))")
    .eq("proposal_id", proposalId);
  return data || [];
}

export async function addProposalConstitutionLink(proposalId: string, sectionId: string) {
  await requireCommissioner();
  const { error } = await sb().from("proposal_constitution_links").insert({
    proposal_id: proposalId,
    constitution_section_id: sectionId,
  });
  if (error) throw new Error(error.message);
}

export async function removeProposalConstitutionLink(id: string) {
  await requireCommissioner();
  const { error } = await sb().from("proposal_constitution_links").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Meeting Minutes ──────────────────────────────────────
export async function getMeetingMinutes(meetingId: string) {
  const { data } = await sb()
    .from("meeting_minutes")
    .select("*")
    .eq("meeting_id", meetingId)
    .single();
  return data;
}

export async function generateMeetingRecap(meetingId: string) {
  await requireCommissioner();
  const supabase = sb();

  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", meetingId).single();
  if (!meeting) throw new Error("Meeting not found");

  const { data: items } = await supabase
    .from("agenda_items")
    .select("*, proposals(*, proposal_versions(*, votes:votes(*)))")
    .eq("meeting_id", meetingId)
    .order("sort_order");

  const { data: owners } = await supabase.from("owners").select("*").eq("league_id", meeting.league_id);
  const ownerMap = new Map((owners || []).map((o) => [o.id, o]));

  let md = `# Owners Meeting ${meeting.club_year}\n\n`;
  md += `**Date:** ${meeting.meeting_date || "TBD"}\n\n`;
  md += `---\n\n`;

  let html = `<h1>Owners Meeting ${meeting.club_year}</h1>`;
  html += `<p><strong>Date:</strong> ${meeting.meeting_date || "TBD"}</p><hr>`;

  for (const item of items || []) {
    md += `## ${item.title}\n\n`;
    html += `<h2>${item.title}</h2>`;

    if (item.type === "admin") {
      md += `*Admin/Discussion Item*\n\n`;
      html += `<p><em>Admin/Discussion Item</em></p>`;
      continue;
    }

    const proposal = item.proposals;
    if (!proposal) continue;

    if (proposal.summary) {
      md += `**Summary:** ${proposal.summary}\n\n`;
      html += `<p><strong>Summary:</strong> ${proposal.summary}</p>`;
    }
    if (proposal.effective_date) {
      md += `**Effective Date:** ${proposal.effective_date}\n\n`;
      html += `<p><strong>Effective Date:</strong> ${proposal.effective_date}</p>`;
    }

    const versions = proposal.proposal_versions || [];
    const finalVersion = versions.find((v: { status: string }) => v.status === "final") ||
      versions.find((v: { status: string }) => v.status === "active") ||
      versions[versions.length - 1];

    if (finalVersion) {
      md += `**Final Text (v${finalVersion.version_number}):**\n\n${finalVersion.full_text}\n\n`;
      html += `<p><strong>Final Text (v${finalVersion.version_number}):</strong></p><pre>${finalVersion.full_text}</pre>`;

      const votes = finalVersion.votes || [];
      const yesVotes = votes.filter((v: { choice: string }) => v.choice === "yes");
      const noVotes = votes.filter((v: { choice: string }) => v.choice === "no");
      const passed = yesVotes.length >= VOTE_THRESHOLD;

      md += `**Result:** ${passed ? "✅ PASSED" : "❌ FAILED"} (${yesVotes.length} Yes / ${noVotes.length} No)\n\n`;
      html += `<p><strong>Result:</strong> ${passed ? "✅ PASSED" : "❌ FAILED"} (${yesVotes.length} Yes / ${noVotes.length} No)</p>`;

      md += `**Yes:** ${yesVotes.map((v: { owner_id: string }) => ownerMap.get(v.owner_id)?.team_name || "Unknown").join(", ")}\n\n`;
      md += `**No:** ${noVotes.map((v: { owner_id: string }) => ownerMap.get(v.owner_id)?.team_name || "Unknown").join(", ")}\n\n`;
      html += `<p><strong>Yes:</strong> ${yesVotes.map((v: { owner_id: string }) => ownerMap.get(v.owner_id)?.team_name || "Unknown").join(", ")}</p>`;
      html += `<p><strong>No:</strong> ${noVotes.map((v: { owner_id: string }) => ownerMap.get(v.owner_id)?.team_name || "Unknown").join(", ")}</p>`;
    }
    md += `---\n\n`;
    html += `<hr>`;
  }

  const subject = `Owners Meeting Recap - ${meeting.club_year}`;

  await supabase.from("meeting_minutes").upsert(
    {
      meeting_id: meetingId,
      minutes_markdown: md,
      email_subject: subject,
      email_body_html: html,
    },
    { onConflict: "meeting_id" }
  );

  return { markdown: md, html, subject };
}
