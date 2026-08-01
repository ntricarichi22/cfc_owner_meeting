"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";

interface SectionRecommendation {
  section_id: string | null;
  label: string;
  anchor: string | null;
  current_body: string;
  recommended_body: string;
}

interface ProposalRecommendation {
  proposal_id: string;
  title: string;
  vote: string;
  effective_date: string | null;
  proposed_by: string | null;
  commissioner_notes: string | null;
  proposal_text: string;
  change_summary: string;
  sections: SectionRecommendation[];
  source: "ai" | "fallback";
}

interface ConstitutionRecommendations {
  generated_at: string;
  provider: string | null;
  items: ProposalRecommendation[];
}

interface MeetingInfo {
  id: string;
  title: string;
  year: number;
  status: string;
}

function buildLeagueUpdateDoc(meeting: MeetingInfo | null, recs: ConstitutionRecommendations): string {
  const lines: string[] = [];
  lines.push(`# Constitution Updates — ${meeting ? `${meeting.title} (${meeting.year})` : "Owners Meeting"}`);
  lines.push("");
  lines.push("The following changes were approved at the owners meeting and will be incorporated into the league constitution.");
  lines.push("");
  for (const item of recs.items) {
    lines.push(`## ${item.title} — ${item.vote}`);
    if (item.proposed_by) lines.push(`*Proposed by: ${item.proposed_by}*`);
    if (item.effective_date) lines.push(`*Effective: ${item.effective_date}*`);
    lines.push("");
    if (item.change_summary) {
      lines.push(item.change_summary);
      lines.push("");
    }
    for (const sec of item.sections) {
      lines.push(`### ${sec.label}`);
      if (sec.recommended_body.trim()) {
        lines.push("**Updated text:**");
        lines.push("");
        lines.push(sec.recommended_body.trim());
      } else if (item.proposal_text) {
        lines.push("**Approved change (wording to be finalized):**");
        lines.push("");
        lines.push(item.proposal_text);
      }
      lines.push("");
    }
    if (item.commissioner_notes) {
      lines.push(`> Commissioner notes: ${item.commissioner_notes}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function ConstitutionUpdatesInner() {
  const { session, loading, isCommissioner, logout } = useSession();
  const searchParams = useSearchParams();

  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [recs, setRecs] = useState<ConstitutionRecommendations | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async (id: string) => {
    setMeetingId(id);
    const [meetingRes, recsRes] = await Promise.all([
      fetch(`/api/meetings/${id}`),
      fetch(`/api/meetings/${id}/constitution-recommendations`),
    ]);
    if (meetingRes.ok) setMeeting(await meetingRes.json());
    if (recsRes.ok) {
      const data = await recsRes.json();
      setRecs(data?.recommendations ?? null);
    }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    const paramId = searchParams.get("meetingId");
    if (paramId) {
      loadData(paramId).catch(() => setMessage("Failed to load data"));
      return;
    }
    (async () => {
      try {
        const listRes = await fetch("/api/meetings");
        const list = listRes.ok ? await listRes.json() : [];
        const reviewable = (Array.isArray(list) ? list : []).find(
          (m) => m?.status === "ended" || m?.status === "finalized",
        );
        if (reviewable?.id) return loadData(reviewable.id);
        setMessage("No meeting available.");
        setLoadingData(false);
      } catch {
        setMessage("Failed to load data");
        setLoadingData(false);
      }
    })();
  }, [session, searchParams, loadData]);

  const generate = async () => {
    if (!meetingId || generating) return;
    setGenerating(true);
    setMessage("Generating recommendations from approved proposals… this can take a minute.");
    try {
      const res = await fetch(`/api/meetings/${meetingId}/constitution-recommendations`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "Generation failed.");
        return;
      }
      setRecs(data.recommendations);
      const n = data.recommendations?.items?.length ?? 0;
      setMessage(
        `Generated recommendations for ${n} approved proposal${n === 1 ? "" : "s"}` +
          (data.recommendations?.provider
            ? "."
            : ". No AI key configured — recommended wording must be written manually."),
      );
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!meetingId || !recs || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/constitution-recommendations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendations: recs }),
      });
      setMessage(res.ok ? "Saved." : "Save failed.");
    } catch {
      setMessage("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  const copyDoc = async () => {
    if (!recs) return;
    try {
      await navigator.clipboard.writeText(buildLeagueUpdateDoc(meeting, recs));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  };

  const updateItem = (proposalId: string, patch: Partial<ProposalRecommendation>) => {
    setRecs((prev) =>
      prev
        ? { ...prev, items: prev.items.map((it) => (it.proposal_id === proposalId ? { ...it, ...patch } : it)) }
        : prev,
    );
  };

  const updateSection = (proposalId: string, index: number, recommended_body: string) => {
    setRecs((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.proposal_id === proposalId
                ? { ...it, sections: it.sections.map((s, i) => (i === index ? { ...s, recommended_body } : s)) }
                : it,
            ),
          }
        : prev,
    );
  };

  if (loading) return <div className="min-h-screen bg-[var(--paper-bg)]" />;
  if (!session)
    return <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] p-8">Not logged in.</div>;
  if (!isCommissioner)
    return (
      <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)] p-8">
        Commissioner access required.{" "}
        <Link href="/meeting/minutes" className="text-[var(--accent-blue)] underline">
          Back to minutes
        </Link>
      </div>
    );

  return (
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--ink)]">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <Link
          href={meetingId ? `/meeting/minutes?meetingId=${meetingId}` : "/meeting/minutes"}
          className="text-[var(--accent-blue)] text-sm underline-offset-4 hover:underline"
        >
          ← Back to Minutes Review
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--ink)]/50">
              CONSTITUTION UPDATES
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight leading-tight">
              {meeting ? `${meeting.title}` : "Loading…"}
            </h1>
            {recs && (
              <p className="text-xs text-[var(--ink)]/55 mt-1">
                Generated {new Date(recs.generated_at).toLocaleString()}
                {recs.provider ? ` · AI (${recs.provider})` : " · manual mode (no AI key configured)"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={generate}
              disabled={generating || !meetingId}
              className="px-4 py-2.5 font-bold uppercase tracking-wide text-xs text-white bg-[#1D4ED8] border-2 border-[#111827] rounded shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition-all disabled:opacity-50"
            >
              {generating ? "Generating…" : recs ? "Regenerate" : "Generate Recommendations"}
            </button>
            {recs && (
              <>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2.5 font-bold uppercase tracking-wide text-xs text-[var(--ink)] bg-[var(--card-surface)] border-2 border-[#111827] rounded shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition-all disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Edits"}
                </button>
                <button
                  onClick={copyDoc}
                  className="px-4 py-2.5 font-bold uppercase tracking-wide text-xs text-[#0B0B0F] bg-[#F5C542] border-2 border-[#111827] rounded shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition-all"
                >
                  {copied ? "Copied!" : "Copy League Update"}
                </button>
              </>
            )}
          </div>
        </div>

        {message && (
          <div className="border-2 border-[var(--border)] bg-[var(--card-surface)] rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-between gap-3">
            <span>{message}</span>
            <button onClick={() => setMessage(null)} className="text-[var(--ink)]/40 hover:text-[var(--ink)]" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        {loadingData && <p className="text-sm text-[var(--ink)]/50">Loading…</p>}

        {!loadingData && !recs && (
          <div className="border-2 border-[var(--border)] bg-[var(--card-surface)] rounded-2xl shadow-[6px_6px_0_#000] p-8 text-center space-y-3">
            <p className="font-semibold">No recommendations generated yet.</p>
            <p className="text-sm text-[var(--ink)]/60 max-w-lg mx-auto">
              Generate recommendations to turn this meeting&apos;s approved proposals into suggested
              constitution edits — using the proposal text, vote results, commissioner notes, and the
              transcript discussion.
            </p>
          </div>
        )}

        {recs?.items.map((item) => (
          <div
            key={item.proposal_id}
            className="border-2 border-[var(--border)] bg-[var(--card-surface)] rounded-2xl shadow-[6px_6px_0_#000] overflow-hidden"
          >
            <div className="px-5 py-4 border-b-2 border-[var(--border)] flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-black uppercase tracking-tight">{item.title}</h2>
              <span className="px-2.5 py-0.5 text-xs font-black uppercase bg-[#16A34A] text-white rounded border border-[#111827]">
                {item.vote}
              </span>
              {item.effective_date && (
                <span className="text-xs font-semibold text-[var(--ink)]/60">Effective {item.effective_date}</span>
              )}
              {item.source === "fallback" && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-[#D97706] text-[#D97706] rounded">
                  Wording needs manual edit
                </span>
              )}
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--ink)]/55 mb-1">
                  Change Summary (goes in the league email)
                </label>
                <textarea
                  value={item.change_summary}
                  onChange={(e) => updateItem(item.proposal_id, { change_summary: e.target.value })}
                  className="w-full min-h-[60px] bg-[var(--paper-bg)] border-2 border-[var(--border)] rounded-xl p-3 text-sm leading-relaxed outline-none"
                />
              </div>

              {item.proposal_text && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-[var(--ink)]/70 hover:text-[var(--ink)]">
                    Approved proposal text
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap bg-[var(--paper-bg)] border border-[var(--border)]/40 rounded-xl p-3 text-[var(--ink)]/80">
                    {item.proposal_text}
                  </p>
                </details>
              )}

              {item.commissioner_notes && (
                <p className="text-sm bg-[#FEF3C7] border border-[#D97706]/50 rounded-xl p-3">
                  <span className="font-bold">Commissioner notes:</span> {item.commissioner_notes}
                </p>
              )}

              {item.sections.map((sec, idx) => (
                <div key={`${item.proposal_id}-${idx}`} className="border-2 border-[var(--border)]/60 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[var(--paper-bg)] border-b border-[var(--border)]/40 flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-sm">{sec.label}</span>
                    {sec.anchor && (
                      <a
                        href={`/constitution#${sec.anchor}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                      >
                        View in constitution ↗
                      </a>
                    )}
                  </div>
                  <div className="p-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]/50 mb-1">
                        Current Text
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-[var(--ink)]/75 bg-[var(--paper-bg)] rounded-lg p-3 min-h-[100px]">
                        {sec.current_body || <span className="italic text-[var(--ink)]/40">No existing section.</span>}
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#16A34A] mb-1">
                        Recommended Text (editable)
                      </div>
                      <textarea
                        value={sec.recommended_body}
                        onChange={(e) => updateSection(item.proposal_id, idx, e.target.value)}
                        placeholder="Write the updated section text…"
                        className="w-full min-h-[100px] h-full bg-[var(--paper-bg)] border-2 border-[#16A34A]/40 rounded-lg p-3 text-sm leading-relaxed outline-none resize-y"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

export default function ConstitutionUpdatesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--paper-bg)]" />}>
      <ConstitutionUpdatesInner />
    </Suspense>
  );
}
