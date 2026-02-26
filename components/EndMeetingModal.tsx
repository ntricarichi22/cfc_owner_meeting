"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function EndMeetingModal({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setTranscriptFile(file);
    setError(null);
  };

  const handleConfirm = async () => {
    if (!transcriptFile || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("transcript", transcriptFile);
      formData.append("meetingId", meetingId);
      const res = await fetch("/api/meetings/end", { method: "POST", body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || "Failed to end meeting. Please try again.");
        return;
      }
      router.push(`/meeting/minutes?meetingId=${meetingId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(11,11,15,0.5)] backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border-4 border-[#111111] bg-[#F6F1E7] shadow-[6px_6px_0_#111111] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#DC2626] border-b-4 border-[#111111]">
          <h2 className="text-xl font-black uppercase tracking-wide text-white">End Meeting</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-white/80 hover:text-white transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-[#111111] leading-relaxed">
            Ending the meeting will <strong>lock all results</strong> and begin minutes review. Votes cannot be
            changed afterward. Please upload the meeting transcript before continuing.
          </p>

          {/* File upload */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#111111] mb-2">
              Meeting Transcript (.docx)
            </label>
            <div
              className="flex items-center gap-3 border-2 border-dashed border-[#111111] rounded-xl px-4 py-3 cursor-pointer hover:bg-[#e8e2d9] transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="w-5 h-5 shrink-0 text-[#111111]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm text-[#111111] truncate">
                {transcriptFile ? transcriptFile.name : "Click to upload .docx transcript"}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleFileChange}
            />
            {transcriptFile && (
              <p className="mt-1 text-xs text-[rgba(11,11,15,0.6)]">
                {(transcriptFile.size / 1024).toFixed(1)} KB selected
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-[#DC2626] font-semibold">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-3 font-bold uppercase tracking-wide text-sm text-[#111111] bg-[#F6F1E7] border-2 border-[#111111] rounded-xl shadow-[3px_3px_0_#111111] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!transcriptFile || uploading}
            className="flex-1 py-3 font-black uppercase tracking-wide text-sm text-white bg-[#DC2626] border-2 border-[#111111] rounded-xl shadow-[3px_3px_0_#111111] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? "Ending meeting…" : "Confirm End Meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}
