"use server";

import { getSupabaseServer } from "@/lib/supabase-server";
import { getSession, requireCommissioner, requireOwner } from "@/lib/session";
import { VOTE_THRESHOLD, TOTAL_OWNERS } from "@/lib/types";
import type { ConstitutionSection } from "@/lib/types";

const sb = () => getSupabaseServer();

// ─── Audit Events ─────────────────────────────────────────
async function logAuditEvent(params: {
  meetingId: string;
  proposalId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  try {
    await sb().from("audit_events").insert({
      meeting_id: params.meetingId,
      proposal_id: params.proposalId || null,
      event_type: params.eventType,
      payload_json: params.payload || {},
      created_at: new Date().toISOString(),
    });
  } catch {
    // Silently ignore audit failures to avoid breaking primary operations
  }
}

// ─── Meetings ─────────────────────────────────────────────
export async function getMeetings() {
  const session = await getSession();
  if (!session) return [];
  const { data } = await sb()
    .from("meetings")
    .select("*")
    .order("year", { ascending: false });
  return data || [];
}

export async function getMeeting(year: number) {
  const session = await getSession();
  if (!session) return null;
  const { data } = await sb()
    .from("meetings")
    .select("*")
    .eq("year", year)
    .single();
  return data;
}

export async function createMeeting(year: number, title?: string) {
  await requireCommissioner();
  const { error } = await sb().from("meetings").insert({
    year,
    title: title || `Annual Owners Meeting ${year}`,
    status: "draft",
  });
  if (error) throw new Error(error.message);
}

export async function updateMeetingStatus(meetingId: string, status: string) {
  await requireCommissioner();
  const { error } = await sb().from("meetings").update({ status }).eq("id", meetingId);
  if (error) throw new Error(error.message);
}

export async function setCurrentAgendaItem(meetingId: string, _itemId: string | null) {
  await requireCommissioner();
  // current_agenda_item_id does not exist in the MVP schema;
  // navigation is handled client-side only.
  await logAuditEvent({
    meetingId,
    eventType: "proposal_navigate",
    payload: { agenda_item_id: _itemId },
  });
}

// ─── Agenda Items ─────────────────────────────────────────
export async function getAgendaItems(meetingId: string) {
  const { data } = await sb()
    .from("agenda_items")
    .select("*, proposals(*)")
    .eq("meeting_id", meetingId)
    .order("order_index");
  return data || [];
}

export async function createAgendaItem(meetingId: string, fields: {
  category?: string;
  title: string;
  order_index?: number;
}) {
  await requireCommissioner();
  const { data, error } = await sb()
    .from("agenda_items")
    .insert({
      meeting_id: meetingId,
      category: fields.category || "general",
      title: fields.title,
      order_index: fields.order_index || 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // If proposal category, create proposal + initial version
  if (fields.category === "proposal" && data) {
    const { data: proposal, error: pErr } = await sb()
      .from("proposals")
      .insert({ meeting_id: meetingId, agenda_item_id: data.id, title: fields.title, status: "draft" })
      .select()
      .single();
    if (pErr) throw new Error(pErr.message);
    if (proposal) {
      await sb().from("proposal_versions").insert({
        proposal_id: proposal.id,
        version_number: 1,
        full_text: "",
        is_active: true,
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

export async function updateProposal(id: string, fields: { title?: string; summary?: string; effective_date?: string }) {
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

export async function updateProposalVersion(id: string, fields: { full_text?: string; is_active?: boolean }) {
  await requireCommissioner();
  const { error } = await sb().from("proposal_versions").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Amendments ───────────────────────────────────────────
export async function getAmendments(proposalId: string) {
  const { data } = await sb()
    .from("amendments")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("created_at");
  return data || [];
}

export async function submitAmendment(proposalId: string, proposedText: string, rationale?: string) {
  const session = await requireOwner();
  const { error } = await sb().from("amendments").insert({
    proposal_id: proposalId,
    proposed_text: proposedText,
    rationale: rationale || null,
    submitted_by_team: session.team_name,
    status: "submitted",
  });
  if (error) throw new Error(error.message);
}

export async function promoteAmendment(amendmentId: string) {
  await requireCommissioner();
  const { data: amendment } = await sb()
    .from("amendments")
    .select("*, proposal:proposals!amendments_proposal_id_fkey(id)")
    .eq("id", amendmentId)
    .single();
  if (!amendment) throw new Error("Amendment not found");

  const proposalId = (amendment.proposal as unknown as { id: string }).id;

  // Get current max version number
  const { data: versions } = await sb()
    .from("proposal_versions")
    .select("version_number")
    .eq("proposal_id", proposalId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version_number ?? 0) + 1;

  // Mark amendment as accepted
  await sb().from("amendments").update({ status: "accepted" }).eq("id", amendmentId);

  // Deactivate current active versions
  await sb()
    .from("proposal_versions")
    .update({ is_active: false })
    .eq("proposal_id", proposalId)
    .eq("is_active", true);

  // Create new version
  const session = await getSession();
  const { error } = await sb().from("proposal_versions").insert({
    proposal_id: proposalId,
    version_number: nextVersion,
    full_text: amendment.proposed_text,
    created_by_team: session?.team_name || null,
    is_active: true,
  });
  if (error) throw new Error(error.message);
}

// ─── Voting ───────────────────────────────────────────────
export async function openVoting(proposalId: string) {
  await requireCommissioner();
  const { error } = await sb()
    .from("proposals")
    .update({ status: "open" })
    .eq("id", proposalId);
  if (error) throw new Error(error.message);
}

export async function castVote(proposalVersionId: string, vote: "yes" | "no") {
  const session = await requireOwner();
  const { error } = await sb()
    .from("votes")
    .upsert(
      {
        proposal_version_id: proposalVersionId,
        team_id: session.owner_id,
        team_name: session.team_name,
        vote,
      },
      { onConflict: "proposal_version_id,team_id" }
    );
  if (error) throw new Error(error.message);
}

export async function getVotes(proposalVersionId: string) {
  const { data } = await sb()
    .from("votes")
    .select("*")
    .eq("proposal_version_id", proposalVersionId);
  return data || [];
}

export async function getMyVote(proposalVersionId: string) {
  const session = await getSession();
  if (!session) return null;
  const { data } = await sb()
    .from("votes")
    .select("vote")
    .eq("proposal_version_id", proposalVersionId)
    .eq("team_id", session.owner_id)
    .single();
  return data?.vote || null;
}

export async function tallyVotes(proposalId: string) {
  await requireCommissioner();

  const { data: activeVersion } = await sb()
    .from("proposal_versions")
    .select("id")
    .eq("proposal_id", proposalId)
    .eq("is_active", true)
    .single();
  if (!activeVersion) throw new Error("No active version");

  const { data: votes } = await sb()
    .from("votes")
    .select("vote, team_id")
    .eq("proposal_version_id", activeVersion.id);

  if (!votes || votes.length < TOTAL_OWNERS) {
    const votedIds = new Set((votes || []).map((v) => v.team_id));
    throw new Error(`All ${TOTAL_OWNERS} owners must vote before tallying. ${votedIds.size} votes received so far.`);
  }

  const yesCount = votes.filter((v) => v.vote === "yes").length;
  const passed = yesCount >= VOTE_THRESHOLD;

  // Update proposal status
  await sb()
    .from("proposals")
    .update({ status: passed ? "passed" : "failed" })
    .eq("id", proposalId);

  return { yesCount, noCount: votes.length - yesCount, passed };
}

// ─── Timer (no-ops: timer columns do not exist in MVP schema) ──
export async function startTimer(_agendaItemId: string) {
  await requireCommissioner();
}

export async function pauseTimer(_agendaItemId: string) {
  await requireCommissioner();
}

export async function resetTimer(_agendaItemId: string) {
  await requireCommissioner();
}

export async function extendTimer(_agendaItemId: string, _additionalSeconds: number = 600) {
  await requireCommissioner();
}

// ─── Constitution ─────────────────────────────────────────
export async function getConstitutionSections() {
  const { data } = await sb()
    .from("constitution_sections")
    .select("*")
    .order("section_key");
  return data || [];
}

export async function getConstitutionSectionByKey(sectionKey: string) {
  const { data } = await sb()
    .from("constitution_sections")
    .select("*")
    .eq("section_key", sectionKey)
    .single();
  return data;
}

export async function updateConstitutionSection(id: string, fields: {
  title?: string;
  body?: string;
}) {
  await requireCommissioner();
  const { error } = await sb().from("constitution_sections").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Meeting Recap ────────────────────────────────────────
export async function generateMeetingRecap(meetingId: string) {
  await requireCommissioner();
  const supabase = sb();

  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", meetingId).single();
  if (!meeting) throw new Error("Meeting not found");

  const { data: items } = await supabase
    .from("agenda_items")
    .select("*, proposals(*, proposal_versions(*, votes:votes(*)))")
    .eq("meeting_id", meetingId)
    .order("order_index");

  let md = `# ${meeting.title}\n\n`;
  md += `**Year:** ${meeting.year}\n\n`;
  md += `---\n\n`;

  let html = `<h1>${meeting.title}</h1>`;
  html += `<p><strong>Year:</strong> ${meeting.year}</p><hr>`;

  for (const item of items || []) {
    md += `## ${item.title}\n\n`;
    html += `<h2>${item.title}</h2>`;

    if (item.category !== "proposal") {
      md += `*General Item*\n\n`;
      html += `<p><em>General Item</em></p>`;
      continue;
    }

    const proposals = item.proposals || [];
    for (const proposal of Array.isArray(proposals) ? proposals : [proposals]) {
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
      const activeVersion = versions.find((v: { is_active: boolean }) => v.is_active) ||
        versions[versions.length - 1];

      if (activeVersion) {
        md += `**Text (v${activeVersion.version_number}):**\n\n${activeVersion.full_text}\n\n`;
        html += `<p><strong>Text (v${activeVersion.version_number}):</strong></p><pre>${activeVersion.full_text}</pre>`;

        const votes = activeVersion.votes || [];
        const yesVotes = votes.filter((v: { vote: string }) => v.vote === "yes");
        const noVotes = votes.filter((v: { vote: string }) => v.vote === "no");
        const passed = yesVotes.length >= VOTE_THRESHOLD;

        if (votes.length > 0) {
          md += `**Result:** ${passed ? "✅ PASSED" : "❌ FAILED"} (${yesVotes.length} Yes / ${noVotes.length} No)\n\n`;
          html += `<p><strong>Result:</strong> ${passed ? "✅ PASSED" : "❌ FAILED"} (${yesVotes.length} Yes / ${noVotes.length} No)</p>`;
        }
      }
    }
    md += `---\n\n`;
    html += `<hr>`;
  }

  const subject = `Owners Meeting Recap - ${meeting.year}`;
  return { markdown: md, html, subject };
}

// ─── Legacy stubs (tables removed from MVP schema) ────────
export async function getOwners() { return []; }
export async function updateOwner(_id: string, _fields: Record<string, unknown>) {}
export async function createOwner(_fields: Record<string, unknown>) {}
export async function getAgendaSections(_meetingId: string) { return []; }
export async function createAgendaSection(_meetingId: string, _title: string, _sortOrder: number) {}
export async function updateAgendaSection(_id: string, _fields: Record<string, unknown>) {}
export async function deleteAgendaSection(_id: string) {}
export async function getConstitutionArticles(_year?: number) { return []; }
export async function getConstitutionSectionByAnchor(_anchor: string): Promise<ConstitutionSection | null> { return null; }
export async function createConstitutionArticle(_fields: Record<string, unknown>) {}
export async function updateConstitutionArticle(_id: string, _fields: Record<string, unknown>) {}
export async function deleteConstitutionArticle(_id: string) {}
export async function createConstitutionSection(_fields: Record<string, unknown>) {}
export async function deleteConstitutionSection(_id: string) {}
export async function getProposalConstitutionLinks(_proposalId: string) { return []; }
export async function addProposalConstitutionLink(_proposalId: string, _sectionId: string) {}
export async function removeProposalConstitutionLink(_id: string) {}
export async function getMeetingMinutes(_meetingId: string): Promise<{ minutes_markdown: string; email_body_html: string | null; email_subject: string | null; emailed_at: string | null } | null> { return null; }
