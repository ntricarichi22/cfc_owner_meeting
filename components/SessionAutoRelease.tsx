"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 15_000;

export default function SessionHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function ping() {
      // Only ping if the session cookie exists (non-httpOnly name check
      // isn't possible, so we just fire the request; the server is a no-op
      // when no session cookie is present).
      fetch("/api/session/ping", { method: "POST" }).catch(() => {});
    }

    // Initial ping on mount, then every 15 seconds
    ping();
    timer = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}
