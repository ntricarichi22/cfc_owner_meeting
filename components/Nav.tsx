"use client";

import Link from "next/link";

interface NavProps {
  teamName?: string;
  isCommissioner?: boolean;
  onLogout?: () => void;
}

export default function Nav({ teamName, isCommissioner, onLogout }: NavProps) {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-xl font-bold text-white hover:text-gray-300">
          CFC Owners Meeting
        </Link>
        {teamName && (
          <>
            <Link href="/constitution" className="text-gray-400 hover:text-white text-sm">
              Constitution
            </Link>
            <Link href="/history" className="text-gray-400 hover:text-white text-sm">
              History
            </Link>
            <Link href="/past-meetings" className="text-gray-400 hover:text-white text-sm">
              Past Meetings
            </Link>
            {isCommissioner && (
              <>
                <Link href="/meeting/minutes" className="text-yellow-400 hover:text-yellow-300 text-sm">
                  Minutes
                </Link>
                <Link href="/admin" className="text-yellow-400 hover:text-yellow-300 text-sm">
                  Admin
                </Link>
              </>
            )}
          </>
        )}
      </div>
      {teamName && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {teamName}
            {isCommissioner && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-600 text-black text-xs rounded-full font-semibold">
                Commissioner
              </span>
            )}
          </span>
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs text-gray-500 hover:text-white border border-gray-700 px-2 py-1 rounded"
            >
              Switch Team
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
