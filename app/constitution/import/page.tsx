"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useSession } from "@/components/TeamSelector";

export default function ConstitutionImportPage() {
  const { session, loading, logout, isCommissioner } = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    articlesImported?: number;
    sectionsImported?: number;
    error?: string;
  } | null>(null);

  // Redirect non-commissioners to /constitution
  useEffect(() => {
    if (!loading && session && !isCommissioner) {
      router.replace("/constitution");
    }
  }, [loading, session, isCommissioner, router]);

  if (loading) return <div className="min-h-screen bg-black" />;
  if (!session) return <div className="min-h-screen bg-black text-white p-8">Not logged in.</div>;
  if (!isCommissioner) return <div className="min-h-screen bg-black" />;

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
      <Nav teamName={session.team_name} isCommissioner={isCommissioner} onLogout={logout} />

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

          {result?.success && (
            <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded">
              Import successful: {result.articlesImported} articles and{" "}
              {result.sectionsImported} sections imported.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
