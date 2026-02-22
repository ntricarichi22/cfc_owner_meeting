"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

interface ImportFormProps {
  teamName: string;
  isCommissioner: boolean;
}

export default function ImportForm({ teamName, isCommissioner }: ImportFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    articlesInserted?: number;
    sectionsInserted?: number;
    dedupedAnchors?: { article_num: number; section_num: string; anchor: string }[];
    error?: string;
  } | null>(null);

  const logout = useCallback(async () => {
    await fetch("/api/session/release", { method: "POST" });
    router.push("/");
  }, [router]);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/constitution/import-docx", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || "Import failed" });
      } else {
        setResult(data);
      }
    } catch (e: unknown) {
      setResult({ error: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Nav teamName={teamName} isCommissioner={isCommissioner} onLogout={logout} />

      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Import Constitution</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
          <p className="text-gray-400 text-sm">
            Upload a DOCX file to import the constitution. Article headings should use
            Heading 1 style (e.g., &quot;Article I: Name&quot;) and section headings should use
            Heading 2 style (e.g., &quot;Section 1: Title&quot;). Tables and lists will be preserved.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              DOCX File
            </label>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500"
            />
          </div>

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 px-6 rounded transition-colors"
          >
            {importing ? "Importing…" : "Import Constitution"}
          </button>

          {result?.error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded">
              {result.error}
            </div>
          )}

          {result?.ok && (
            <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded">
              Import successful: {result.articlesInserted} articles and{" "}
              {result.sectionsInserted} sections imported.
              {result.dedupedAnchors && result.dedupedAnchors.length > 0 && (
                <p className="mt-2 text-yellow-300 text-sm">
                  {result.dedupedAnchors.length} duplicate anchor(s) were renamed.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
