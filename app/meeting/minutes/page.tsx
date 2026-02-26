"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";

export default function MeetingMinutesPage() {
  const { session, loading, isCommissioner, logout } = useSession();
  const searchParams = useSearchParams();
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const [checklist, setChecklist] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!session || !isCommissioner) return;

    const paramMeetingId = searchParams.get("meetingId");

    const loadMinutes = async (id: string) => {
      const res = await fetch(`/api/meetings/${id}/minutes`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = [body?.error, body?.details, body?.code].filter(Boolean).join(" | ");
        setMessage(`Unable to load minutes${detail ? `: ${detail}` : ""}`);
        return;
      }
      const data = await res.json();
      setMeetingId(id);
      setMinutes(data?.minutes_markdown || "");
      setChecklist(data?.checklist_markdown || "");
    };

    const loadMeetingStatus = async (id: string) => {
      const res = await fetch(`/api/meetings/${id}`).catch(() => null);
      if (res?.ok) {
        const data = await res.json().catch(() => null);
        if (data?.status) setMeetingStatus(data.status);
      } else {
        console.warn("[minutes] Could not load meeting status for", id);
      }
    };

    if (paramMeetingId) {
      loadMinutes(paramMeetingId).catch(() => setMessage("Unable to load minutes"));
      loadMeetingStatus(paramMeetingId).catch(() => {});
    } else {
      fetch("/api/meetings/current")
        .then((res) => res.json())
        .then((meeting) => {
          if (!meeting?.id) return;
          setMeetingStatus(meeting.status ?? null);
          return loadMinutes(meeting.id);
        })
        .catch(() => setMessage("Unable to load minutes"));
    }
  }, [session, isCommissioner, searchParams]);

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-6">Not logged in.</div>;
  if (!isCommissioner) return <div className="min-h-screen bg-black text-white p-6">Commissioner only.</div>;

  const generate = async () => {
    if (!meetingId) return;
    const res = await fetch(`/api/meetings/${meetingId}/minutes/generate`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = [data?.error, data?.details, data?.code].filter(Boolean).join(" | ");
      setMessage(detail || "Generate failed");
      return;
    }
    setMinutes(data?.minutes_markdown || "");
    setChecklist(data?.checklist_markdown || "");
    setMessage("Minutes generated");
  };

  const saveChecklist = async () => {
    if (!meetingId) return;
    const res = await fetch(`/api/meetings/${meetingId}/minutes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist_markdown: checklist }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = [data?.error, data?.details, data?.code].filter(Boolean).join(" | ");
      setMessage(detail || "Save failed");
      return;
    }
    setMessage("Checklist saved");
  };

  const finalizeMinutes = async () => {
    if (!meetingId || finalizing) return;
    setFinalizing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/finalize`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = [data?.error, data?.details, data?.code].filter(Boolean).join(" | ");
        setMessage(detail || "Finalize failed");
        return;
      }
      setMeetingStatus("finalized");
      setMessage("Meeting finalized.");
    } finally {
      setFinalizing(false);
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([`${minutes}\n\n## Checklist\n${checklist}`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meeting-minutes.md";
    link.click();
    URL.revokeObjectURL(url);
  };

  const isEnded = meetingStatus === "ended";
  const isFinalized = meetingStatus === "finalized";

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />
      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Meeting Minutes</h1>
          {isEnded && (
            <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wide bg-yellow-500 text-black rounded">
              Ended – Pending Review
            </span>
          )}
          {isFinalized && (
            <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wide bg-green-600 text-white rounded">
              Finalized
            </span>
          )}
        </div>
        {isEnded && (
          <p className="text-sm text-yellow-300">
            Meeting ended. Review the transcript below, then click &quot;Generate minutes&quot; to produce formatted meeting minutes.
          </p>
        )}
        {message && <p className="text-sm text-blue-300">{message}</p>}
        {isFinalized && (
          <p className="text-sm text-green-300">
            This meeting is finalized and will appear in{" "}
            <Link href="/history" className="underline hover:text-green-100">Meeting History</Link>.
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={generate} className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 text-sm">Generate minutes</button>
          <button onClick={saveChecklist} className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-sm">Save checklist</button>
          <button onClick={downloadMarkdown} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm">Download .md</button>
          {!isFinalized && (
            <button
              onClick={finalizeMinutes}
              disabled={finalizing || !meetingId}
              className="px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 text-sm disabled:opacity-50"
            >
              {finalizing ? "Finalizing…" : "Finalize Minutes"}
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <textarea value={minutes} readOnly className="min-h-[420px] bg-gray-900 border border-gray-800 rounded p-3 text-sm" />
          <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} className="min-h-[420px] bg-gray-900 border border-gray-800 rounded p-3 text-sm" />
        </div>
      </main>
    </div>
  );
}

