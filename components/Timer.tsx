"use client";

import { useEffect, useState, useCallback } from "react";

interface TimerProps {
  durationSeconds: number;
  startedAt: string | null;
  remainingSeconds: number | null;
  isCommissioner: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onExtend: () => void;
}

export default function Timer({
  durationSeconds,
  startedAt,
  remainingSeconds,
  isCommissioner,
  onStart,
  onPause,
  onReset,
  onExtend,
}: TimerProps) {
  const [display, setDisplay] = useState(remainingSeconds ?? durationSeconds);

  const calcRemaining = useCallback(() => {
    if (startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      return Math.max(0, (remainingSeconds ?? durationSeconds) - elapsed);
    }
    return remainingSeconds ?? durationSeconds;
  }, [startedAt, remainingSeconds, durationSeconds]);

  useEffect(() => {
    setDisplay(calcRemaining());
    if (!startedAt) return;

    const interval = setInterval(() => {
      setDisplay(calcRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, remainingSeconds, durationSeconds, calcRemaining]);

  const mins = Math.floor(display / 60);
  const secs = display % 60;
  const isRunning = !!startedAt;
  const isExpired = display <= 0;

  return (
    <div className="flex items-center gap-4">
      <div
        className={`text-4xl font-mono font-bold ${
          isExpired ? "text-red-500 animate-pulse" : isRunning ? "text-green-400" : "text-gray-300"
        }`}
      >
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </div>
      {isCommissioner && (
        <div className="flex gap-2">
          {!isRunning ? (
            <button onClick={onStart} className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700">
              Start
            </button>
          ) : (
            <button onClick={onPause} className="px-3 py-1 bg-yellow-600 rounded text-sm hover:bg-yellow-700">
              Pause
            </button>
          )}
          <button onClick={onReset} className="px-3 py-1 bg-gray-600 rounded text-sm hover:bg-gray-700">
            Reset
          </button>
          <button onClick={onExtend} className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700">
            +10 min
          </button>
        </div>
      )}
    </div>
  );
}
