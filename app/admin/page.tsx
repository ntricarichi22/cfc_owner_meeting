"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/components/TeamSelector";
import Nav from "@/components/Nav";
import {
  getOwners, updateOwner, createOwner,
  getMeetings, createMeeting, updateMeetingStatus,
  getAgendaSections, createAgendaSection, updateAgendaSection, deleteAgendaSection,
  getAgendaItems, createAgendaItem, updateAgendaItem, deleteAgendaItem,
  getProposal, updateProposal, getProposalVersions, updateProposalVersion,
  getConstitutionArticles, createConstitutionArticle, updateConstitutionArticle, deleteConstitutionArticle,
  createConstitutionSection, updateConstitutionSection, deleteConstitutionSection,
  addProposalConstitutionLink, removeProposalConstitutionLink, getProposalConstitutionLinks,
  generateMeetingRecap, getMeetingMinutes,
} from "@/lib/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

const tabs = ["Owners", "Meetings", "Constitution", "Finalize"] as const;
type Tab = (typeof tabs)[number];

const btn = "px-3 py-1.5 rounded text-sm font-medium disabled:opacity-40";
const btnPrimary = `${btn} bg-blue-600 hover:bg-blue-700 text-white`;
const btnDanger = `${btn} bg-red-700 hover:bg-red-800 text-white`;
const btnSecondary = `${btn} bg-gray-700 hover:bg-gray-600 text-white`;
const input = "bg-black border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:border-blue-500 outline-none";
const label = "text-xs text-gray-400 mb-1";

// ─── Owners Tab ──────────────────────────────────────────
function OwnersTab() {
  const [owners, setOwners] = useState<R[]>([]);
  const [edits, setEdits] = useState<Record<string, R>>({});
  const [newOwner, setNewOwner] = useState({ display_name: "", email: "", team_name: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setOwners(await getOwners());
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (o: R) => {
    try {
      await updateOwner(o.id, edits[o.id] || {});
      setMsg("Saved");
      setEdits((p) => { const n = { ...p }; delete n[o.id]; return n; });
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const addOwner = async () => {
    if (!newOwner.display_name || !newOwner.team_name) return;
    try {
      await createOwner(newOwner);
      setNewOwner({ display_name: "", email: "", team_name: "" });
      setMsg("Owner created");
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const field = (ownerId: string, key: string) =>
    edits[ownerId]?.[key] ?? owners.find((o) => o.id === ownerId)?.[key] ?? "";

  const setField = (ownerId: string, key: string, val: string) =>
    setEdits((p) => ({ ...p, [ownerId]: { ...(p[ownerId] || {}), [key]: val } }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Owners</h2>
      {msg && <p className="text-sm text-yellow-400">{msg}</p>}

      <div className="space-y-3">
        {owners.map((o) => (
          <div key={o.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-wrap gap-3 items-end">
            <div>
              <p className={label}>Display Name</p>
              <input className={input} value={field(o.id, "display_name")} onChange={(e) => setField(o.id, "display_name", e.target.value)} />
            </div>
            <div>
              <p className={label}>Email</p>
              <input className={input} value={field(o.id, "email")} onChange={(e) => setField(o.id, "email", e.target.value)} />
            </div>
            <div>
              <p className={label}>Team Name</p>
              <input className={input} value={field(o.id, "team_name")} onChange={(e) => setField(o.id, "team_name", e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              {o.role === "commissioner" && (
                <span className="px-2 py-0.5 bg-yellow-600 text-black text-xs rounded-full font-semibold">Commissioner</span>
              )}
              <button className={btnPrimary} onClick={() => save(o)} disabled={!edits[o.id]}>Save</button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add New Owner</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className={label}>Display Name *</p>
            <input className={input} value={newOwner.display_name} onChange={(e) => setNewOwner({ ...newOwner, display_name: e.target.value })} />
          </div>
          <div>
            <p className={label}>Email</p>
            <input className={input} value={newOwner.email} onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })} />
          </div>
          <div>
            <p className={label}>Team Name *</p>
            <input className={input} value={newOwner.team_name} onChange={(e) => setNewOwner({ ...newOwner, team_name: e.target.value })} />
          </div>
          <button className={btnPrimary} onClick={addOwner}>Add Owner</button>
        </div>
      </div>
    </div>
  );
}

// ─── Meetings Tab ────────────────────────────────────────
function MeetingsTab() {
  const [meetings, setMeetings] = useState<R[]>([]);
  const [newYear, setNewYear] = useState("");
  const [newDate, setNewDate] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState<R | null>(null);
  const [sections, setSections] = useState<R[]>([]);
  const [items, setItems] = useState<R[]>([]);
  const [msg, setMsg] = useState("");

  // Section form
  const [secTitle, setSecTitle] = useState("");
  const [secOrder, setSecOrder] = useState("0");

  // Item form
  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState("admin");
  const [itemSection, setItemSection] = useState("");
  const [itemVoting, setItemVoting] = useState(false);
  const [itemTimer, setItemTimer] = useState("600");
  const [itemOrder, setItemOrder] = useState("0");

  // Editing
  const [editingSection, setEditingSection] = useState<R | null>(null);
  const [editingItem, setEditingItem] = useState<R | null>(null);
  const [proposalPanel, setProposalPanel] = useState<R | null>(null);

  const loadMeetings = useCallback(async () => { setMeetings(await getMeetings()); }, []);
  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  const loadMeetingData = useCallback(async (m: R) => {
    setSections(await getAgendaSections(m.id));
    setItems(await getAgendaItems(m.id));
  }, []);

  const selectMeeting = (m: R) => {
    setSelectedMeeting(m);
    loadMeetingData(m);
    setProposalPanel(null);
  };

  const addMeeting = async () => {
    if (!newYear) return;
    try {
      await createMeeting(parseInt(newYear), newDate || undefined);
      setNewYear(""); setNewDate("");
      setMsg("Meeting created");
      await loadMeetings();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const addSection = async () => {
    if (!selectedMeeting || !secTitle) return;
    try {
      await createAgendaSection(selectedMeeting.id, secTitle, parseInt(secOrder) || 0);
      setSecTitle(""); setSecOrder("0");
      await loadMeetingData(selectedMeeting);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const saveSection = async () => {
    if (!editingSection) return;
    try {
      await updateAgendaSection(editingSection.id, { title: editingSection.title, sort_order: editingSection.sort_order });
      setEditingSection(null);
      if (selectedMeeting) await loadMeetingData(selectedMeeting);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const removeSection = async (id: string) => {
    try {
      await deleteAgendaSection(id);
      if (selectedMeeting) await loadMeetingData(selectedMeeting);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const addItem = async () => {
    if (!selectedMeeting || !itemTitle) return;
    try {
      await createAgendaItem(selectedMeeting.id, {
        title: itemTitle,
        category: itemType,
        order_index: parseInt(itemOrder) || 0,
      });
      setItemTitle(""); setItemType("admin"); setItemSection(""); setItemVoting(false); setItemTimer("600"); setItemOrder("0");
      await loadMeetingData(selectedMeeting);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const saveItem = async () => {
    if (!editingItem) return;
    try {
      await updateAgendaItem(editingItem.id, {
        title: editingItem.title,
        type: editingItem.type,
        section_id: editingItem.section_id || null,
        voting_required: editingItem.voting_required,
        timer_duration_seconds: editingItem.timer_duration_seconds,
        sort_order: editingItem.sort_order,
      });
      setEditingItem(null);
      if (selectedMeeting) await loadMeetingData(selectedMeeting);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const removeItem = async (id: string) => {
    try {
      await deleteAgendaItem(id);
      if (selectedMeeting) await loadMeetingData(selectedMeeting);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Meetings</h2>
      {msg && <p className="text-sm text-yellow-400">{msg}</p>}

      {/* Create meeting */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Create Meeting</h3>
        <div className="flex gap-3 items-end">
          <div><p className={label}>Year *</p><input className={input} type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} /></div>
          <div><p className={label}>Date</p><input className={input} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
          <button className={btnPrimary} onClick={addMeeting}>Create</button>
        </div>
      </div>

      {/* Meeting list */}
      <div className="grid gap-2">
        {meetings.map((m) => (
          <button key={m.id} onClick={() => selectMeeting(m)}
            className={`text-left bg-gray-900 border rounded-lg p-3 transition ${selectedMeeting?.id === m.id ? "border-blue-500" : "border-gray-800 hover:border-gray-600"}`}>
            <div className="flex justify-between">
              <span className="font-semibold">{m.club_year} Meeting</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === "live" ? "bg-green-700 text-green-100" : m.status === "finalized" ? "bg-blue-700 text-blue-100" : "bg-gray-700 text-gray-300"}`}>{m.status}</span>
            </div>
            {m.meeting_date && <p className="text-gray-500 text-xs mt-1">{m.meeting_date}</p>}
          </button>
        ))}
      </div>

      {/* Selected meeting detail */}
      {selectedMeeting && (
        <div className="space-y-6 border-t border-gray-800 pt-6">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{selectedMeeting.club_year} Meeting</h3>
            <button className={btnSecondary} onClick={async () => { await updateMeetingStatus(selectedMeeting.id, "live"); await loadMeetings(); selectMeeting({ ...selectedMeeting, status: "live" }); }}>Set Live</button>
            <button className={btnSecondary} onClick={async () => { await updateMeetingStatus(selectedMeeting.id, "draft"); await loadMeetings(); selectMeeting({ ...selectedMeeting, status: "draft" }); }}>Set Draft</button>
          </div>

          {/* Agenda Sections */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold">Agenda Sections</h4>
            {sections.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-black rounded p-2">
                {editingSection?.id === s.id ? (
                  <>
                    <input className={input} value={editingSection!.title} onChange={(e) => setEditingSection({ ...editingSection!, title: e.target.value })} />
                    <input className={`${input} w-16`} type="number" value={editingSection!.sort_order} onChange={(e) => setEditingSection({ ...editingSection!, sort_order: parseInt(e.target.value) || 0 })} />
                    <button className={btnPrimary} onClick={saveSection}>Save</button>
                    <button className={btnSecondary} onClick={() => setEditingSection(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">{s.title}</span>
                    <span className="text-xs text-gray-500">order: {s.sort_order}</span>
                    <button className={btnSecondary} onClick={() => setEditingSection({ ...s })}>Edit</button>
                    <button className={btnDanger} onClick={() => removeSection(s.id)}>Delete</button>
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2 items-end pt-2">
              <div><p className={label}>Title</p><input className={input} value={secTitle} onChange={(e) => setSecTitle(e.target.value)} /></div>
              <div><p className={label}>Order</p><input className={`${input} w-16`} type="number" value={secOrder} onChange={(e) => setSecOrder(e.target.value)} /></div>
              <button className={btnPrimary} onClick={addSection}>Add Section</button>
            </div>
          </div>

          {/* Agenda Items */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold">Agenda Items</h4>
            {items.map((it) => (
              <div key={it.id} className="bg-black rounded p-3 space-y-2">
                {editingItem?.id === it.id ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 items-end">
                      <div><p className={label}>Title</p><input className={input} value={editingItem!.title} onChange={(e) => setEditingItem({ ...editingItem!, title: e.target.value })} /></div>
                      <div>
                        <p className={label}>Type</p>
                        <select className={input} value={editingItem!.type} onChange={(e) => setEditingItem({ ...editingItem!, type: e.target.value })}>
                          <option value="admin">Admin</option><option value="proposal">Proposal</option>
                        </select>
                      </div>
                      <div>
                        <p className={label}>Section</p>
                        <select className={input} value={editingItem!.section_id || ""} onChange={(e) => setEditingItem({ ...editingItem!, section_id: e.target.value || null })}>
                          <option value="">None</option>
                          {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                      </div>
                      <div><p className={label}>Order</p><input className={`${input} w-16`} type="number" value={editingItem!.sort_order} onChange={(e) => setEditingItem({ ...editingItem!, sort_order: parseInt(e.target.value) || 0 })} /></div>
                      <div><p className={label}>Timer (s)</p><input className={`${input} w-20`} type="number" value={editingItem!.timer_duration_seconds} onChange={(e) => setEditingItem({ ...editingItem!, timer_duration_seconds: parseInt(e.target.value) || 600 })} /></div>
                      <div className="flex items-center gap-1">
                        <input type="checkbox" checked={editingItem!.voting_required} onChange={(e) => setEditingItem({ ...editingItem!, voting_required: e.target.checked })} />
                        <span className="text-xs text-gray-400">Voting</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className={btnPrimary} onClick={saveItem}>Save</button>
                      <button className={btnSecondary} onClick={() => setEditingItem(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex-1 font-medium">{it.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${it.type === "proposal" ? "bg-purple-800 text-purple-200" : "bg-gray-700 text-gray-300"}`}>{it.type}</span>
                    {it.voting_required && <span className="text-xs text-yellow-400">voting</span>}
                    <span className="text-xs text-gray-500">order: {it.sort_order}</span>
                    <button className={btnSecondary} onClick={() => setEditingItem({ ...it })}>Edit</button>
                    {it.type === "proposal" && <button className={`${btn} bg-purple-700 hover:bg-purple-600 text-white`} onClick={() => setProposalPanel(it)}>Proposal</button>}
                    <button className={btnDanger} onClick={() => removeItem(it.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
            <div className="border-t border-gray-800 pt-3 space-y-2">
              <h5 className="text-xs font-semibold text-gray-400">Add Agenda Item</h5>
              <div className="flex flex-wrap gap-2 items-end">
                <div><p className={label}>Title *</p><input className={input} value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} /></div>
                <div>
                  <p className={label}>Type</p>
                  <select className={input} value={itemType} onChange={(e) => setItemType(e.target.value)}>
                    <option value="admin">Admin</option><option value="proposal">Proposal</option>
                  </select>
                </div>
                <div>
                  <p className={label}>Section</p>
                  <select className={input} value={itemSection} onChange={(e) => setItemSection(e.target.value)}>
                    <option value="">None</option>
                    {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
                <div><p className={label}>Order</p><input className={`${input} w-16`} type="number" value={itemOrder} onChange={(e) => setItemOrder(e.target.value)} /></div>
                <div><p className={label}>Timer (s)</p><input className={`${input} w-20`} type="number" value={itemTimer} onChange={(e) => setItemTimer(e.target.value)} /></div>
                <div className="flex items-center gap-1">
                  <input type="checkbox" checked={itemVoting} onChange={(e) => setItemVoting(e.target.checked)} />
                  <span className="text-xs text-gray-400">Voting</span>
                </div>
                <button className={btnPrimary} onClick={addItem}>Add Item</button>
              </div>
            </div>
          </div>

          {/* Proposal editor panel */}
          {proposalPanel && <ProposalEditor agendaItem={proposalPanel} onClose={() => setProposalPanel(null)} />}
        </div>
      )}
    </div>
  );
}

// ─── Proposal Editor ─────────────────────────────────────
function ProposalEditor({ agendaItem, onClose }: { agendaItem: R; onClose: () => void }) {
  const [proposal, setProposal] = useState<R | null>(null);
  const [versions, setVersions] = useState<R[]>([]);
  const [links, setLinks] = useState<R[]>([]);
  const [articles, setArticles] = useState<R[]>([]);
  const [fields, setFields] = useState({ summary: "", pros: "", cons: "", effective_date: "" });
  const [versionText, setVersionText] = useState("");
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [linkSectionId, setLinkSectionId] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const p = await getProposal(agendaItem.id);
    setProposal(p);
    if (p) {
      setFields({ summary: p.summary || "", pros: p.pros || "", cons: p.cons || "", effective_date: p.effective_date || "" });
      const v = await getProposalVersions(p.id);
      setVersions(v);
      const l = await getProposalConstitutionLinks(p.id);
      setLinks(l);
    }
    const arts = await getConstitutionArticles();
    setArticles(arts);
  }, [agendaItem.id]);

  useEffect(() => { load(); }, [load]);

  const saveProposal = async () => {
    if (!proposal) return;
    try {
      await updateProposal(proposal.id, fields);
      setMsg("Proposal saved");
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const saveVersion = async (vId: string) => {
    try {
      await updateProposalVersion(vId, { full_text: versionText });
      setEditingVersionId(null);
      setMsg("Version saved");
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const addLink = async () => {
    if (!proposal || !linkSectionId) return;
    try {
      await addProposalConstitutionLink(proposal.id, linkSectionId);
      setLinkSectionId("");
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const removeLink = async (id: string) => {
    try {
      await removeProposalConstitutionLink(id);
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const allSections = articles.flatMap((a: R) =>
    (a.constitution_sections || []).map((s: R) => ({ ...s, articleTitle: a.article_title, articleNum: a.article_num }))
  );

  return (
    <div className="bg-gray-900 border border-purple-800 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold text-purple-300">Proposal: {agendaItem.title}</h4>
        <button className={btnSecondary} onClick={onClose}>Close</button>
      </div>
      {msg && <p className="text-sm text-yellow-400">{msg}</p>}

      {proposal && (
        <>
          {/* Proposal fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><p className={label}>Summary</p><textarea className={`${input} w-full`} rows={3} value={fields.summary} onChange={(e) => setFields({ ...fields, summary: e.target.value })} /></div>
            <div><p className={label}>Pros</p><textarea className={`${input} w-full`} rows={3} value={fields.pros} onChange={(e) => setFields({ ...fields, pros: e.target.value })} /></div>
            <div><p className={label}>Cons</p><textarea className={`${input} w-full`} rows={3} value={fields.cons} onChange={(e) => setFields({ ...fields, cons: e.target.value })} /></div>
            <div><p className={label}>Effective Date</p><input className={`${input} w-full`} value={fields.effective_date} onChange={(e) => setFields({ ...fields, effective_date: e.target.value })} /></div>
          </div>
          <button className={btnPrimary} onClick={saveProposal}>Save Proposal</button>

          {/* Versions */}
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-gray-300">Versions</h5>
            {versions.map((v) => (
              <div key={v.id} className="bg-black rounded p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">v{v.version_number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${v.status === "active" ? "bg-green-800 text-green-200" : v.status === "final" ? "bg-blue-800 text-blue-200" : "bg-gray-700 text-gray-400"}`}>{v.status}</span>
                  <button className={btnSecondary} onClick={() => { setEditingVersionId(v.id); setVersionText(v.full_text || ""); }}>Edit</button>
                </div>
                {editingVersionId === v.id ? (
                  <div className="space-y-2">
                    <textarea className={`${input} w-full`} rows={8} value={versionText} onChange={(e) => setVersionText(e.target.value)} />
                    <div className="flex gap-2">
                      <button className={btnPrimary} onClick={() => saveVersion(v.id)}>Save</button>
                      <button className={btnSecondary} onClick={() => setEditingVersionId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  v.full_text && <pre className="text-xs text-gray-400 whitespace-pre-wrap max-h-40 overflow-y-auto">{v.full_text}</pre>
                )}
              </div>
            ))}
          </div>

          {/* Constitution Links */}
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-gray-300">Constitution Links</h5>
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 bg-black rounded p-2">
                <span className="flex-1 text-sm">
                  {l.section?.article?.article_num} - {l.section?.section_num}: {l.section?.section_title}
                </span>
                <button className={btnDanger} onClick={() => removeLink(l.id)}>Remove</button>
              </div>
            ))}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <p className={label}>Link to Section</p>
                <select className={`${input} w-full`} value={linkSectionId} onChange={(e) => setLinkSectionId(e.target.value)}>
                  <option value="">Select section...</option>
                  {allSections.map((s: R) => (
                    <option key={s.id} value={s.id}>{s.articleNum} {s.articleTitle} &gt; {s.section_num} {s.section_title}</option>
                  ))}
                </select>
              </div>
              <button className={btnPrimary} onClick={addLink}>Add Link</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Constitution Tab ────────────────────────────────────
function ConstitutionTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [articles, setArticles] = useState<R[]>([]);
  const [msg, setMsg] = useState("");

  // Article form
  const [newArt, setNewArt] = useState({ article_num: "", article_title: "", sort_order: 0 });
  const [editingArt, setEditingArt] = useState<R | null>(null);

  // Section form
  const [expandedArt, setExpandedArt] = useState<string | null>(null);
  const [newSec, setNewSec] = useState({ section_num: "", section_title: "", body: "", anchor: "", sort_order: 0 });
  const [editingSec, setEditingSec] = useState<R | null>(null);

  const load = useCallback(async () => {
    setArticles(await getConstitutionArticles(year));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const addArticle = async () => {
    if (!newArt.article_num || !newArt.article_title) return;
    try {
      await createConstitutionArticle({ club_year: year, ...newArt });
      setNewArt({ article_num: "", article_title: "", sort_order: 0 });
      setMsg("Article created");
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const saveArticle = async () => {
    if (!editingArt) return;
    try {
      await updateConstitutionArticle(editingArt.id, { article_num: editingArt.article_num, article_title: editingArt.article_title, sort_order: editingArt.sort_order });
      setEditingArt(null);
      setMsg("Article updated");
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const removeArticle = async (id: string) => {
    if (!confirm("Delete this article and all its sections?")) return;
    try {
      await deleteConstitutionArticle(id);
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const addSection = async (articleId: string) => {
    if (!newSec.section_num || !newSec.section_title) return;
    try {
      await createConstitutionSection({ article_id: articleId, ...newSec });
      setNewSec({ section_num: "", section_title: "", body: "", anchor: "", sort_order: 0 });
      setMsg("Section created");
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const saveSection = async () => {
    if (!editingSec) return;
    try {
      await updateConstitutionSection(editingSec.id, {
        title: editingSec.section_title,
        body: editingSec.body,
      });
      setEditingSec(null);
      setMsg("Section updated");
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const removeSection = async (id: string) => {
    try {
      await deleteConstitutionSection(id);
      await load();
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold">Constitution</h2>
        <div className="flex items-center gap-2">
          <p className={label}>Year</p>
          <input className={`${input} w-24`} type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} />
        </div>
      </div>
      {msg && <p className="text-sm text-yellow-400">{msg}</p>}

      {/* Articles */}
      {articles.map((a) => (
        <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          {editingArt?.id === a.id ? (
            <div className="flex flex-wrap gap-2 items-end">
              <div><p className={label}>Article #</p><input className={input} value={editingArt!.article_num} onChange={(e) => setEditingArt({ ...editingArt!, article_num: e.target.value })} /></div>
              <div><p className={label}>Title</p><input className={input} value={editingArt!.article_title} onChange={(e) => setEditingArt({ ...editingArt!, article_title: e.target.value })} /></div>
              <div><p className={label}>Order</p><input className={`${input} w-16`} type="number" value={editingArt!.sort_order} onChange={(e) => setEditingArt({ ...editingArt!, sort_order: parseInt(e.target.value) || 0 })} /></div>
              <button className={btnPrimary} onClick={saveArticle}>Save</button>
              <button className={btnSecondary} onClick={() => setEditingArt(null)}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button className="flex-1 text-left font-semibold hover:text-blue-400" onClick={() => setExpandedArt(expandedArt === a.id ? null : a.id)}>
                Article {a.article_num}: {a.article_title}
              </button>
              <span className="text-xs text-gray-500">order: {a.sort_order}</span>
              <button className={btnSecondary} onClick={() => setEditingArt({ ...a })}>Edit</button>
              <button className={btnDanger} onClick={() => removeArticle(a.id)}>Delete</button>
            </div>
          )}

          {/* Sections */}
          {expandedArt === a.id && (
            <div className="ml-4 space-y-3 border-l border-gray-800 pl-4">
              {(a.constitution_sections || [])
                .sort((x: R, y: R) => (x.sort_order || 0) - (y.sort_order || 0))
                .map((s: R) => (
                <div key={s.id} className="bg-black rounded p-3 space-y-2">
                  {editingSec?.id === s.id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 items-end">
                        <div><p className={label}>Section #</p><input className={input} value={editingSec!.section_num} onChange={(e) => setEditingSec({ ...editingSec!, section_num: e.target.value })} /></div>
                        <div><p className={label}>Title</p><input className={input} value={editingSec!.section_title} onChange={(e) => setEditingSec({ ...editingSec!, section_title: e.target.value })} /></div>
                        <div><p className={label}>Anchor</p><input className={input} value={editingSec!.anchor} onChange={(e) => setEditingSec({ ...editingSec!, anchor: e.target.value })} /></div>
                        <div><p className={label}>Order</p><input className={`${input} w-16`} type="number" value={editingSec!.sort_order} onChange={(e) => setEditingSec({ ...editingSec!, sort_order: parseInt(e.target.value) || 0 })} /></div>
                      </div>
                      <div>
                        <p className={label}>Body</p>
                        <textarea className={`${input} w-full`} rows={12} value={editingSec!.body} onChange={(e) => setEditingSec({ ...editingSec!, body: e.target.value })} />
                      </div>
                      <div className="flex gap-2">
                        <button className={btnPrimary} onClick={saveSection}>Save</button>
                        <button className={btnSecondary} onClick={() => setEditingSec(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{s.section_num}: {s.section_title}</span>
                        <span className="text-xs text-gray-600">#{s.anchor}</span>
                        <span className="text-xs text-gray-500">order: {s.sort_order}</span>
                        <button className={btnSecondary} onClick={() => setEditingSec({ ...s })}>Edit</button>
                        <button className={btnDanger} onClick={() => removeSection(s.id)}>Delete</button>
                      </div>
                      {s.body && <pre className="text-xs text-gray-400 whitespace-pre-wrap mt-1 max-h-24 overflow-y-auto">{s.body}</pre>}
                    </div>
                  )}
                </div>
              ))}

              {/* Add section form */}
              <div className="bg-black rounded p-3 space-y-2">
                <h5 className="text-xs font-semibold text-gray-400">Add Section</h5>
                <div className="flex flex-wrap gap-2 items-end">
                  <div><p className={label}>Section #</p><input className={input} value={newSec.section_num} onChange={(e) => setNewSec({ ...newSec, section_num: e.target.value })} /></div>
                  <div><p className={label}>Title</p><input className={input} value={newSec.section_title} onChange={(e) => setNewSec({ ...newSec, section_title: e.target.value })} /></div>
                  <div><p className={label}>Anchor</p><input className={input} value={newSec.anchor} onChange={(e) => setNewSec({ ...newSec, anchor: e.target.value })} /></div>
                  <div><p className={label}>Order</p><input className={`${input} w-16`} type="number" value={newSec.sort_order} onChange={(e) => setNewSec({ ...newSec, sort_order: parseInt(e.target.value) || 0 })} /></div>
                </div>
                <div>
                  <p className={label}>Body</p>
                  <textarea className={`${input} w-full`} rows={8} value={newSec.body} onChange={(e) => setNewSec({ ...newSec, body: e.target.value })} />
                </div>
                <button className={btnPrimary} onClick={() => addSection(a.id)}>Add Section</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add article */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add Article</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div><p className={label}>Article # *</p><input className={input} value={newArt.article_num} onChange={(e) => setNewArt({ ...newArt, article_num: e.target.value })} /></div>
          <div><p className={label}>Title *</p><input className={input} value={newArt.article_title} onChange={(e) => setNewArt({ ...newArt, article_title: e.target.value })} /></div>
          <div><p className={label}>Order</p><input className={`${input} w-16`} type="number" value={newArt.sort_order} onChange={(e) => setNewArt({ ...newArt, sort_order: parseInt(e.target.value) || 0 })} /></div>
          <button className={btnPrimary} onClick={addArticle}>Add Article</button>
        </div>
      </div>
    </div>
  );
}

// ─── Finalize Tab ────────────────────────────────────────
function FinalizeTab() {
  const [meetings, setMeetings] = useState<R[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [html, setHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getMeetings().then(setMeetings);
  }, []);

  const loadExisting = async (meetingId: string) => {
    setSelectedId(meetingId);
    const mins = await getMeetingMinutes(meetingId);
    if (mins) {
      setMarkdown(mins.minutes_markdown || "");
      setHtml(mins.email_body_html || "");
      setSubject(mins.email_subject || "");
    } else {
      setMarkdown(""); setHtml(""); setSubject("");
    }
  };

  const generate = async () => {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const result = await generateMeetingRecap(selectedId);
      setMarkdown(result.markdown);
      setHtml(result.html);
      setSubject(result.subject);
      setMsg("Recap generated and saved");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setGenerating(false);
    }
  };

  const finalize = async () => {
    if (!selectedId) return;
    try {
      await updateMeetingStatus(selectedId, "finalized");
      setMsg("Meeting finalized");
      setMeetings(await getMeetings());
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error"); }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Copied to clipboard");
    } catch {
      setMsg("Copy failed — use manual selection");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Finalize Meeting</h2>
      {msg && <p className="text-sm text-yellow-400">{msg}</p>}

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <p className={label}>Select Meeting</p>
          <select className={`${input} w-full`} value={selectedId} onChange={(e) => loadExisting(e.target.value)}>
            <option value="">Choose meeting...</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>{m.club_year} ({m.status})</option>
            ))}
          </select>
        </div>
        <button className={btnPrimary} onClick={generate} disabled={!selectedId || generating}>
          {generating ? "Generating..." : "Generate Recap"}
        </button>
        <button className={`${btn} bg-green-700 hover:bg-green-600 text-white`} onClick={finalize} disabled={!selectedId}>
          Finalize Meeting
        </button>
      </div>

      {selectedId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Markdown */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-300">Markdown</h3>
              <button className={btnSecondary} onClick={() => copyToClipboard(markdown)}>Copy MD</button>
            </div>
            <textarea className={`${input} w-full font-mono text-xs`} rows={20} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
          </div>

          {/* HTML Preview */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-300">HTML Preview</h3>
              <button className={btnSecondary} onClick={() => copyToClipboard(html)}>Copy HTML</button>
            </div>
            <div className="bg-white text-black rounded p-4 text-sm overflow-auto max-h-[500px]" dangerouslySetInnerHTML={{ __html: html }} />
          </div>

          {/* Subject */}
          <div className="lg:col-span-2 space-y-2">
            <h3 className="text-sm font-semibold text-gray-300">Email Subject</h3>
            <input className={`${input} w-full`} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin Page ──────────────────────────────────────────
export default function AdminPage() {
  const { session, loading, logout, isCommissioner } = useSession();
  const [tab, setTab] = useState<Tab>("Owners");

  if (loading) {
    return <main className="min-h-screen bg-black text-white flex items-center justify-center"><p className="text-gray-500">Loading...</p></main>;
  }

  if (!session || !isCommissioner) {
    return (
      <>
        <Nav teamName={session?.team_name} isCommissioner={false} onLogout={logout} />
        <main className="min-h-screen bg-black text-white flex items-center justify-center">
          <p className="text-red-400 text-xl">Unauthorized — Commissioner access required</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
      <main className="min-h-screen bg-black text-white p-6 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Admin</h1>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 border-b border-gray-800 pb-2">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-t text-sm font-medium transition ${tab === t ? "bg-gray-800 text-white" : "text-gray-500 hover:text-white hover:bg-gray-900"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Owners" && <OwnersTab />}
        {tab === "Meetings" && <MeetingsTab />}
        {tab === "Constitution" && <ConstitutionTab />}
        {tab === "Finalize" && <FinalizeTab />}
      </main>
    </>
  );
}
