"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/TeamSelector";
import Nav from "@/components/Nav";
import type { Meeting, AgendaItem, Proposal, ProposalVersion } from "@/lib/types";

/* ---------- rationale helpers ---------- */
function parseRationale(rationale: string | null | undefined) {
  const pros: string[] = [];
  const cons: string[] = [];
  if (!rationale) return { pros, cons };
  let section: "pros" | "cons" | null = null;
  for (const line of rationale.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[PROS]") { section = "pros"; continue; }
    if (trimmed === "[CONS]") { section = "cons"; continue; }
    if (section === "pros" && trimmed) pros.push(trimmed.replace(/^-\s*/, ""));
    if (section === "cons" && trimmed) cons.push(trimmed.replace(/^-\s*/, ""));
  }
  return { pros, cons };
}

/* ---------- types for local state ---------- */
type ProposalWithVersions = Proposal & { proposal_versions?: ProposalVersion[] };
type AgendaItemWithProposals = AgendaItem & { proposals?: ProposalWithVersions[] };

export default function MeetingBuilderPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, isCommissioner, logout } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [items, setItems] = useState<AgendaItemWithProposals[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Agenda item form
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("proposal");
  const [newItemOrder, setNewItemOrder] = useState(1);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemCategory, setEditItemCategory] = useState("");
  const [editItemOrder, setEditItemOrder] = useState(0);

  // Proposal form
  const [addingProposalForItem, setAddingProposalForItem] = useState<string | null>(null);
  const [newProposalTitle, setNewProposalTitle] = useState("");
  const [newProposalSummary, setNewProposalSummary] = useState("");
  const [newProposalEffectiveDate, setNewProposalEffectiveDate] = useState("2026 Club Year");
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editProposalTitle, setEditProposalTitle] = useState("");
  const [editProposalSummary, setEditProposalSummary] = useState("");
  const [editProposalEffectiveDate, setEditProposalEffectiveDate] = useState("");
  const [editProposalStatus, setEditProposalStatus] = useState("draft");

  // Version form
  const [versionProposalId, setVersionProposalId] = useState<string | null>(null);
  const [versionFullText, setVersionFullText] = useState("");
  const [versionPros, setVersionPros] = useState("");
  const [versionCons, setVersionCons] = useState("");

  // Version history
  const [historyProposalId, setHistoryProposalId] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<ProposalVersion[]>([]);

  const [saving, setSaving] = useState(false);

  /* ---------- redirect gate ---------- */
  useEffect(() => {
    if (!sessionLoading && (!session || !isCommissioner)) {
      router.replace("/meeting");
    }
  }, [session, sessionLoading, isCommissioner, router]);

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
      setNewItemOrder(agendaItems.length + 1);
    } catch {
      setError("Failed to load meeting data");
    }
  }, []);

  useEffect(() => {
    if (session && isCommissioner) loadData();
  }, [session, isCommissioner, loadData]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [success]);

  /* ---------- agenda item CRUD ---------- */
  const handleCreateItem = async () => {
    if (!meeting || !newItemTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/agenda-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_id: meeting.id,
          title: newItemTitle.trim(),
          category: newItemCategory,
          order_index: newItemOrder,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create");
      }
      setNewItemTitle("");
      setSuccess("Agenda item created");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create agenda item");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItemId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/agenda-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingItemId,
          title: editItemTitle,
          category: editItemCategory,
          order_index: editItemOrder,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update");
      }
      setEditingItemId(null);
      setSuccess("Agenda item updated");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update agenda item");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Delete this agenda item and all its proposals?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/agenda-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete");
      }
      setSuccess("Agenda item deleted");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete agenda item");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- proposal CRUD ---------- */
  const handleCreateProposal = async (agendaItemId: string) => {
    if (!meeting || !newProposalTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_id: meeting.id,
          agenda_item_id: agendaItemId,
          title: newProposalTitle.trim(),
          summary: newProposalSummary || null,
          effective_date: newProposalEffectiveDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create proposal");
      }
      setAddingProposalForItem(null);
      setNewProposalTitle("");
      setNewProposalSummary("");
      setNewProposalEffectiveDate("2026 Club Year");
      setSuccess("Proposal created");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create proposal");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProposal = async () => {
    if (!editingProposalId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proposals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingProposalId,
          title: editProposalTitle,
          summary: editProposalSummary,
          effective_date: editProposalEffectiveDate,
          status: editProposalStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update proposal");
      }
      setEditingProposalId(null);
      setSuccess("Proposal updated");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update proposal");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProposal = async (id: string) => {
    if (!confirm("Delete this proposal and all its versions?")) return;
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

  /* ---------- proposal versions ---------- */
  const handleCreateVersion = async () => {
    if (!versionProposalId || !versionFullText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proposal-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: versionProposalId,
          full_text: versionFullText,
          pros: versionPros,
          cons: versionCons,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create version");
      }
      setVersionProposalId(null);
      setVersionFullText("");
      setVersionPros("");
      setVersionCons("");
      setSuccess("New active version created");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create version");
    } finally {
      setSaving(false);
    }
  };

  const loadVersionHistory = async (proposalId: string) => {
    try {
      const res = await fetch(`/api/admin/proposal-versions?proposalId=${proposalId}`);
      if (!res.ok) throw new Error("Failed to load");
      setVersionHistory(await res.json());
      setHistoryProposalId(proposalId);
    } catch {
      setError("Failed to load version history");
    }
  };

  const startEditVersion = (proposal: ProposalWithVersions) => {
    const active = proposal.proposal_versions?.find((v) => v.is_active);
    const parsed = parseRationale(active?.rationale);
    setVersionProposalId(proposal.id);
    setVersionFullText(active?.full_text || "");
    setVersionPros(parsed.pros.join("\n"));
    setVersionCons(parsed.cons.join("\n"));
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

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Meeting Builder</h1>
        <p className="text-white/50 text-sm mb-6">Commissioner-only tool to manage agenda items, proposals, and versions.</p>

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
            <a href="/meeting" className="text-[#0ea5e9] hover:underline">Go to Meeting →</a>
          </div>
        ) : (
          <>
            {/* Meeting info */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 mb-6">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Active Meeting</p>
              <p className="text-xl font-semibold mt-1">{meeting.year} — {meeting.title}</p>
            </div>

            {/* Create Agenda Item */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 mb-6">
              <h2 className="text-lg font-semibold mb-3">Add Agenda Item</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-white/50 block mb-1">Title</label>
                  <input
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
                    placeholder="e.g. Roster Size Increase"
                  />
                </div>
                <div className="w-40">
                  <label className="text-xs text-white/50 block mb-1">Category</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    <option value="proposal">proposal</option>
                    <option value="discussion">discussion</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="text-xs text-white/50 block mb-1">Order</label>
                  <input
                    type="number"
                    value={newItemOrder}
                    onChange={(e) => setNewItemOrder(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                    min={1}
                  />
                </div>
                <button
                  onClick={handleCreateItem}
                  disabled={saving || !newItemTitle.trim()}
                  className="rounded-lg bg-[#0ea5e9] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0ea5e9]/90 disabled:opacity-50 transition"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Agenda Items List */}
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5">
                  {editingItemId === item.id ? (
                    /* Edit mode */
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[200px]">
                          <label className="text-xs text-white/50 block mb-1">Title</label>
                          <input
                            value={editItemTitle}
                            onChange={(e) => setEditItemTitle(e.target.value)}
                            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div className="w-40">
                          <label className="text-xs text-white/50 block mb-1">Category</label>
                          <select
                            value={editItemCategory}
                            onChange={(e) => setEditItemCategory(e.target.value)}
                            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                          >
                            <option value="proposal">proposal</option>
                            <option value="discussion">discussion</option>
                            <option value="admin">admin</option>
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="text-xs text-white/50 block mb-1">Order</label>
                          <input
                            type="number"
                            value={editItemOrder}
                            onChange={(e) => setEditItemOrder(Number(e.target.value))}
                            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                            min={1}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleUpdateItem} disabled={saving} className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingItemId(null)} className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 hover:text-white">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* Display mode */
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs uppercase tracking-widest text-white/40 mr-3">#{item.order_index}</span>
                          <span className="font-semibold">{item.title}</span>
                          <span className="ml-2 text-xs rounded-full border border-white/20 px-2 py-0.5 text-white/50">{item.category}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingItemId(item.id);
                              setEditItemTitle(item.title);
                              setEditItemCategory(item.category);
                              setEditItemOrder(item.order_index);
                            }}
                            className="text-xs text-[#0ea5e9] hover:underline"
                          >
                            Edit
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                        </div>
                      </div>

                      {/* Proposals under this item */}
                      <div className="mt-4 ml-4 space-y-3">
                        {item.proposals && item.proposals.length > 0 ? (
                          item.proposals.map((p) => {
                            const activeVer = p.proposal_versions?.find((v) => v.is_active);
                            const parsed = parseRationale(activeVer?.rationale);
                            return (
                              <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
                                {editingProposalId === p.id ? (
                                  /* Edit proposal */
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-xs text-white/50 block mb-1">Title</label>
                                      <input value={editProposalTitle} onChange={(e) => setEditProposalTitle(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-white/50 block mb-1">Summary (Details)</label>
                                      <textarea value={editProposalSummary} onChange={(e) => setEditProposalSummary(e.target.value)} rows={3} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
                                    </div>
                                    <div className="flex gap-3">
                                      <div className="flex-1">
                                        <label className="text-xs text-white/50 block mb-1">Effective Date</label>
                                        <input value={editProposalEffectiveDate} onChange={(e) => setEditProposalEffectiveDate(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
                                      </div>
                                      <div className="w-36">
                                        <label className="text-xs text-white/50 block mb-1">Status</label>
                                        <select value={editProposalStatus} onChange={(e) => setEditProposalStatus(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white">
                                          <option value="draft">draft</option>
                                          <option value="open">open</option>
                                          <option value="passed">passed</option>
                                          <option value="failed">failed</option>
                                          <option value="tabled">tabled</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={handleUpdateProposal} disabled={saving} className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">Save</button>
                                      <button onClick={() => setEditingProposalId(null)} className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 hover:text-white">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  /* Display proposal */
                                  <div>
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <p className="font-medium">{p.title}</p>
                                        <p className="text-xs text-white/40 mt-1">Status: <span className="text-white/60">{p.status}</span> · Effective: <span className="text-white/60">{p.effective_date || "TBD"}</span></p>
                                        {p.summary && <p className="text-sm text-white/60 mt-2">{p.summary}</p>}
                                      </div>
                                      <div className="flex gap-2 flex-shrink-0 ml-4">
                                        <button
                                          onClick={() => {
                                            setEditingProposalId(p.id);
                                            setEditProposalTitle(p.title);
                                            setEditProposalSummary(p.summary || "");
                                            setEditProposalEffectiveDate(p.effective_date || "");
                                            setEditProposalStatus(p.status);
                                          }}
                                          className="text-xs text-[#0ea5e9] hover:underline"
                                        >
                                          Edit
                                        </button>
                                        <button onClick={() => handleDeleteProposal(p.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                                      </div>
                                    </div>

                                    {/* Active version info */}
                                    <div className="mt-3 pt-3 border-t border-white/10">
                                      {activeVer ? (
                                        <div className="space-y-1">
                                          <p className="text-xs text-white/40">Active Version: v{activeVer.version_number} by {activeVer.created_by_team || "unknown"}</p>
                                          <p className="text-sm text-white/70 line-clamp-2">{activeVer.full_text}</p>
                                          {parsed.pros.length > 0 && <p className="text-xs text-green-400/70">Pros: {parsed.pros.join("; ")}</p>}
                                          {parsed.cons.length > 0 && <p className="text-xs text-red-400/70">Cons: {parsed.cons.join("; ")}</p>}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-white/40 italic">No active version yet</p>
                                      )}
                                      <div className="flex gap-2 mt-2">
                                        <button onClick={() => startEditVersion(p)} className="text-xs text-[#0ea5e9] hover:underline">Set/Update Active Version</button>
                                        <button onClick={() => loadVersionHistory(p.id)} className="text-xs text-white/50 hover:text-white hover:underline">View History</button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-white/30 italic">No proposals yet</p>
                        )}

                        {/* Add proposal button / form */}
                        {addingProposalForItem === item.id ? (
                          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 space-y-3">
                            <h4 className="text-sm font-semibold">New Proposal</h4>
                            <div>
                              <label className="text-xs text-white/50 block mb-1">Title</label>
                              <input value={newProposalTitle} onChange={(e) => setNewProposalTitle(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Proposal title" />
                            </div>
                            <div>
                              <label className="text-xs text-white/50 block mb-1">Summary (Details)</label>
                              <textarea value={newProposalSummary} onChange={(e) => setNewProposalSummary(e.target.value)} rows={3} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Details text for the proposal card" />
                            </div>
                            <div>
                              <label className="text-xs text-white/50 block mb-1">Effective Date</label>
                              <input value={newProposalEffectiveDate} onChange={(e) => setNewProposalEffectiveDate(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleCreateProposal(item.id)} disabled={saving || !newProposalTitle.trim()} className="rounded-lg bg-[#0ea5e9] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#0ea5e9]/90 disabled:opacity-50">Create</button>
                              <button onClick={() => { setAddingProposalForItem(null); setNewProposalTitle(""); setNewProposalSummary(""); }} className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 hover:text-white">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingProposalForItem(item.id)}
                            className="text-xs text-[#0ea5e9] hover:underline"
                          >
                            + Add Proposal
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {items.length === 0 && (
                <p className="text-white/30 text-center py-8">No agenda items yet. Create one above.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Version form modal */}
      {versionProposalId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-[#0b0b0b] p-6 space-y-4 max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold">Set / Update Active Version</h3>
            <div>
              <label className="text-xs text-white/50 block mb-1">Rule Text (full_text)</label>
              <textarea value={versionFullText} onChange={(e) => setVersionFullText(e.target.value)} rows={5} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Enter the full rule text…" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Pros (one per line)</label>
              <textarea value={versionPros} onChange={(e) => setVersionPros(e.target.value)} rows={4} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Enter pros, one per line…" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Cons (one per line)</label>
              <textarea value={versionCons} onChange={(e) => setVersionCons(e.target.value)} rows={4} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Enter cons, one per line…" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateVersion}
                disabled={saving || !versionFullText.trim()}
                className="rounded-lg bg-[#0ea5e9] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0ea5e9]/90 disabled:opacity-50"
              >
                Save as New Active Version
              </button>
              <button onClick={() => setVersionProposalId(null)} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70 hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Version history modal */}
      {historyProposalId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-[#0b0b0b] p-6 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Version History</h3>
              <button onClick={() => setHistoryProposalId(null)} className="text-white/60 hover:text-white text-sm">Close</button>
            </div>
            {versionHistory.length === 0 ? (
              <p className="text-white/40 text-sm">No versions found.</p>
            ) : (
              <div className="space-y-3">
                {versionHistory.map((v) => (
                  <div key={v.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">v{v.version_number}</span>
                        {v.is_active && <span className="text-xs rounded-full bg-green-600/30 text-green-400 px-2 py-0.5">Active</span>}
                      </div>
                      <span className="text-xs text-white/40">{v.created_by_team || "unknown"}</span>
                    </div>
                    <p className="text-xs text-white/40 mt-1">{new Date(v.created_at).toLocaleString()}</p>
                    <p className="text-sm text-white/70 mt-2 line-clamp-3">{v.full_text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
