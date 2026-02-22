"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/components/TeamSelector";
import Nav from "@/components/Nav";
import type { Meeting, AgendaItem, Proposal, ProposalVersion } from "@/lib/types";

/* ---------- types ---------- */
type ProposalWithVersions = Proposal & { proposal_versions?: ProposalVersion[] };
type AgendaItemWithProposals = AgendaItem & { proposals?: ProposalWithVersions[] };

interface ConstitutionArticleSection {
  id: string;
  article_num: string;
  article_title: string;
  sort_order: number;
  sections: { id: string; section_num: string; section_title: string; anchor: string }[];
}

interface TeamOption {
  teamId: string;
  teamName: string;
}

const EFFECTIVE_DATE_OPTIONS = [
  "2026 Club Year",
  "2027 Club Year",
  "2028 Club Year",
  "2029 Club Year",
  "2030 Club Year",
];

/* ---------- modal form state ---------- */
interface ProposalFormData {
  title: string;
  order_index: number;
  proposal_type: string;
  proposed_by: string;
  effective_date: string;
  article_sections: string[];
  summary: string;
  pros: string;
  cons: string;
}

const emptyForm: ProposalFormData = {
  title: "",
  order_index: 1,
  proposal_type: "proposal",
  proposed_by: "",
  effective_date: "2026 Club Year",
  article_sections: [],
  summary: "",
  pros: "",
  cons: "",
};

export default function MeetingBuilderPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<AgendaItemWithProposals[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAgendaItemId, setModalAgendaItemId] = useState<string | null>(null);
  const [modalArticleTitle, setModalArticleTitle] = useState("");
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProposalFormData>({ ...emptyForm });

  // Reference data
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [articleSections, setArticleSections] = useState<ConstitutionArticleSection[]>([]);

  /* ---------- redirect gate ---------- */
  useEffect(() => {
    if (!sessionLoading && (!session || !isCommissioner)) {
      router.replace("/meeting");
    }
  }, [session, sessionLoading, isCommissioner, router]);

  /* ---------- sync article buckets ---------- */
  const syncArticleBuckets = useCallback(async (meetingId: string) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/sync-article-buckets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: meetingId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to sync article buckets");
      }
    } catch {
      setError("Failed to sync article buckets");
    } finally {
      setSyncing(false);
    }
  }, []);

  /* ---------- load data ---------- */
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings/current");
      if (!res.ok) {
        setMeeting(null);
        setError("No active meeting found.");
        return;
      }
      const m: Meeting = await res.json();
      setMeeting(m);

      // Auto-sync article buckets
      await syncArticleBuckets(m.id);

      const [itemsRes, proposalsRes] = await Promise.all([
        fetch(`/api/agenda-items?meetingId=${m.id}`),
        fetch(`/api/proposals?meetingId=${m.id}`),
      ]);

      let agendaItems: AgendaItemWithProposals[] = [];
      let proposals: ProposalWithVersions[] = [];

      if (itemsRes.ok) agendaItems = await itemsRes.json();
      if (proposalsRes.ok) proposals = await proposalsRes.json();

      // Attach proposals to their agenda items
      const proposalsByItem = new Map<string, ProposalWithVersions[]>();
      for (const p of proposals) {
        if (!p.agenda_item_id) continue;
        const list = proposalsByItem.get(p.agenda_item_id) || [];
        list.push(p);
        proposalsByItem.set(p.agenda_item_id, list);
      }
      for (const item of agendaItems) {
        item.proposals = proposalsByItem.get(item.id) || [];
      }

      setItems(agendaItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load meeting data");
    }
  }, [syncArticleBuckets]);

  /* ---------- load reference data ---------- */
  useEffect(() => {
    if (!session || !isCommissioner) return;

    // Load teams for "Proposed by" dropdown
    fetch("/api/teams")
      .then(async (res) => {
        if (!res.ok) return [];
        return (await res.json()) as TeamOption[];
      })
      .then((data) => setTeams(Array.isArray(data) ? data : []))
      .catch(() => {});

    // Load constitution article sections for section dropdowns
    fetch("/api/admin/constitution-article-sections")
      .then(async (res) => {
        if (!res.ok) return [];
        return (await res.json()) as ConstitutionArticleSection[];
      })
      .then((data) => setArticleSections(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [session, isCommissioner]);

  useEffect(() => {
    if (session && isCommissioner) loadData();
  }, [session, isCommissioner, loadData]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [success]);

  /* ---------- article sections for modal ---------- */
  function getArticleSectionsForItem(agendaItemTitle: string) {
    // Parse article number from title like "Article 1 – Membership"
    const match = agendaItemTitle.match(/Article\s+(\S+)/i);
    if (!match) return [];
    const articleNum = match[1];
    const article = articleSections.find((a) => String(a.article_num) === articleNum);
    return article?.sections || [];
  }

  /* ---------- modal handlers ---------- */
  const openAddModal = (agendaItemId: string, agendaItemTitle: string) => {
    setModalAgendaItemId(agendaItemId);
    setModalArticleTitle(agendaItemTitle);
    setEditingProposalId(null);
    setFormData({ ...emptyForm });
    setModalOpen(true);
  };

  const openEditModal = (proposal: ProposalWithVersions, agendaItemTitle: string) => {
    setModalAgendaItemId(proposal.agenda_item_id);
    setModalArticleTitle(agendaItemTitle);
    setEditingProposalId(proposal.id);
    setFormData({
      title: proposal.title,
      order_index: proposal.order_index ?? 0,
      proposal_type: proposal.proposal_type ?? "proposal",
      proposed_by: proposal.proposed_by ?? "",
      effective_date: proposal.effective_date ?? "2026 Club Year",
      article_sections: Array.isArray(proposal.article_sections) ? proposal.article_sections : [],
      summary: proposal.summary ?? "",
      pros: proposal.pros ?? "",
      cons: proposal.cons ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalAgendaItemId(null);
    setEditingProposalId(null);
    setFormData({ ...emptyForm });
  };

  const updateField = <K extends keyof ProposalFormData>(key: K, value: ProposalFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArticleSection = (sectionId: string) => {
    setFormData((prev) => {
      const current = prev.article_sections;
      if (current.includes(sectionId)) {
        return { ...prev, article_sections: current.filter((s) => s !== sectionId) };
      }
      return { ...prev, article_sections: [...current, sectionId] };
    });
  };

  /* ---------- save proposal ---------- */
  const handleSaveProposal = async () => {
    if (!meeting || !formData.title.trim()) return;
    setSaving(true);
    try {
      if (editingProposalId) {
        // Update existing
        const res = await fetch("/api/admin/proposals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingProposalId,
            title: formData.title.trim(),
            order_index: formData.order_index,
            proposal_type: formData.proposal_type,
            proposed_by: formData.proposed_by || null,
            effective_date: formData.effective_date || null,
            article_sections: formData.article_sections,
            summary: formData.summary || null,
            pros: formData.pros || null,
            cons: formData.cons || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update proposal");
        }
        setSuccess("Proposal updated");
      } else {
        // Create new
        const res = await fetch("/api/admin/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meeting_id: meeting.id,
            agenda_item_id: modalAgendaItemId,
            title: formData.title.trim(),
            order_index: formData.order_index,
            proposal_type: formData.proposal_type,
            proposed_by: formData.proposed_by || null,
            effective_date: formData.effective_date || null,
            article_sections: formData.article_sections,
            summary: formData.summary || null,
            pros: formData.pros || null,
            cons: formData.cons || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create proposal");
        }
        setSuccess("Proposal created and is now live");
      }
      closeModal();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save proposal");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- delete proposal ---------- */
  const handleDeleteProposal = async (id: string) => {
    if (!confirm("Delete this proposal? This cannot be undone.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proposals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete proposal");
      }
      setSuccess("Proposal deleted");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete proposal");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- render ---------- */
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/50">Loading...</p>
      </div>
    );
  }

  if (!session || !isCommissioner) return null;

  // Only show Article-category items as organizational buckets
  const articleBuckets = items
    .filter((item) => item.category === "Article")
    .sort((a, b) => a.order_index - b.order_index);

  // Get sections available for the current modal's article
  const modalSections = modalArticleTitle ? getArticleSectionsForItem(modalArticleTitle) : [];

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Meeting Builder</h1>
        <p className="text-white/50 text-sm mb-6">
          Manage proposals under each Constitution Article. Proposals are immediately live when saved.
          {syncing && <span className="ml-2 text-[#0ea5e9]">Syncing article buckets…</span>}
        </p>

        {error && (
          <div className="bg-red-900/70 border border-red-700 text-red-200 px-4 py-2 rounded-xl mb-4 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-4">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-900/70 border border-green-700 text-green-200 px-4 py-2 rounded-xl mb-4">
            {success}
          </div>
        )}

        {!meeting ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-white/60 mb-4">No active meeting found.</p>
            <Link href="/meeting" className="text-[#0ea5e9] hover:underline">Go to Meeting →</Link>
          </div>
        ) : (
          <>
            {/* Meeting info */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 mb-6">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Active Meeting</p>
              <p className="text-xl font-semibold mt-1">{meeting.year} — {meeting.title}</p>
            </div>

            {/* Slide Order Preview – only proposals */}
            {(() => {
              const allProposals = items.flatMap((item) => item.proposals || []);
              const sorted = [...allProposals].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.created_at.localeCompare(b.created_at));
              if (sorted.length === 0) return null;
              return (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 mb-6">
                  <h2 className="text-sm font-semibold text-white/60 mb-2 uppercase tracking-widest">Slide Order Preview</h2>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-white/50">0: Title Slide</span>
                    {sorted.map((p) => (
                      <span
                        key={p.id}
                        className="text-xs rounded-lg border border-[#0ea5e9]/30 bg-[#0ea5e9]/5 px-3 py-1 text-[#0ea5e9]/80"
                      >
                        {p.order_index}: {p.title}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Article Buckets with Proposals */}
            <div className="space-y-4">
              {articleBuckets.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{item.title}</span>
                      <span className="ml-2 text-xs rounded-full border border-[#0ea5e9]/40 text-[#0ea5e9]/70 px-2 py-0.5">
                        Article
                      </span>
                    </div>
                  </div>

                  {/* Proposals under this article */}
                  <div className="mt-4 ml-4 space-y-3">
                    {item.proposals && item.proposals.length > 0 ? (
                      item.proposals.map((p) => (
                        <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{p.title}</p>
                              <div className="flex flex-wrap gap-2 mt-1.5">
                                <span className="text-xs text-white/40">
                                  Order: <span className="text-white/60">{p.order_index}</span>
                                </span>
                                <span className="text-xs text-white/40">
                                  Type: <span className="text-white/60 capitalize">{p.proposal_type || "proposal"}</span>
                                </span>
                                {p.proposed_by && (
                                  <span className="text-xs text-white/40">
                                    By: <span className="text-white/60">{p.proposed_by}</span>
                                  </span>
                                )}
                                <span className="text-xs text-white/40">
                                  Effective: <span className="text-white/60">{p.effective_date || "TBD"}</span>
                                </span>
                                <span className="text-xs rounded-full bg-green-600/20 text-green-400 px-2 py-0.5">
                                  Live
                                </span>
                              </div>
                              {p.summary && (
                                <p className="text-sm text-white/60 mt-2 line-clamp-2">{p.summary}</p>
                              )}
                            </div>
                            <div className="flex gap-2 flex-shrink-0 ml-4">
                              <button
                                onClick={() => openEditModal(p, item.title)}
                                className="text-xs text-[#0ea5e9] hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProposal(p.id)}
                                className="text-xs text-red-400 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-white/30 italic">No proposals yet</p>
                    )}

                    <button
                      onClick={() => openAddModal(item.id, item.title)}
                      className="text-xs text-[#0ea5e9] hover:underline"
                    >
                      + Add New Proposal
                    </button>
                  </div>
                </div>
              ))}

              {articleBuckets.length === 0 && (
                <p className="text-white/30 text-center py-8">No constitution articles found. Ensure articles are configured in the database.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ===== Proposal Modal Form ===== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/20 bg-[#0b0b0b] p-6 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold">
                  {editingProposalId ? "Edit Proposal" : "New Proposal"}
                </h3>
                <p className="text-xs text-white/40 mt-1">{modalArticleTitle}</p>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white text-sm">✕</button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs text-white/50 block mb-1">Title</label>
                <input
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
                  placeholder="Proposal title"
                />
              </div>

              {/* Order & Type (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Order (Slide Position)</label>
                  <input
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => updateField("order_index", Number(e.target.value))}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                    min={1}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Type</label>
                  <select
                    value={formData.proposal_type}
                    onChange={(e) => updateField("proposal_type", e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    <option value="proposal">Proposal</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {/* Proposed by & Effective Date (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Proposed By</label>
                  <select
                    value={formData.proposed_by}
                    onChange={(e) => updateField("proposed_by", e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Select team...</option>
                    {teams.map((t) => (
                      <option key={t.teamId} value={t.teamName}>
                        {t.teamName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Effective Date</label>
                  <select
                    value={formData.effective_date}
                    onChange={(e) => updateField("effective_date", e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    {EFFECTIVE_DATE_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Article Section(s) – multiselect */}
              <div>
                <label className="text-xs text-white/50 block mb-1">
                  Article Section(s)
                  {modalSections.length === 0 && (
                    <span className="text-white/30 ml-1">(No sections found for this article)</span>
                  )}
                </label>
                {modalSections.length > 0 ? (
                  <div className="flex flex-wrap gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 min-h-[2.5rem]">
                    {modalSections.map((sec) => {
                      const isSelected = formData.article_sections.includes(sec.id);
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => toggleArticleSection(sec.id)}
                          className={`text-xs rounded-full border px-3 py-1 transition ${
                            isSelected
                              ? "border-[#0ea5e9] bg-[#0ea5e9]/20 text-[#0ea5e9]"
                              : "border-white/20 text-white/50 hover:border-white/40 hover:text-white/70"
                          }`}
                        >
                          Section {sec.section_num}: {sec.section_title}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/30 italic">
                    No sections available
                  </div>
                )}
              </div>

              {/* Details */}
              <div>
                <label className="text-xs text-white/50 block mb-1">Details</label>
                <textarea
                  value={formData.summary}
                  onChange={(e) => updateField("summary", e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
                  placeholder="Describe the proposal details..."
                />
              </div>

              {/* Pros & Cons (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Pros (one per line)</label>
                  <textarea
                    value={formData.pros}
                    onChange={(e) => updateField("pros", e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
                    placeholder="Enter pros, one per line..."
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Cons (one per line)</label>
                  <textarea
                    value={formData.cons}
                    onChange={(e) => updateField("cons", e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
                    placeholder="Enter cons, one per line..."
                  />
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t border-white/10">
              <button
                onClick={handleSaveProposal}
                disabled={saving || !formData.title.trim()}
                className="flex-1 rounded-lg bg-[#0ea5e9] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0ea5e9]/90 disabled:opacity-50 transition"
              >
                {saving ? "Saving..." : editingProposalId ? "Save Changes" : "Save & Go Live"}
              </button>
              <button
                onClick={closeModal}
                className="rounded-lg border border-white/20 px-5 py-2.5 text-sm text-white/70 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
