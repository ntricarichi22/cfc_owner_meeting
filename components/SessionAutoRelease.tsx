"use client";

import { useEffect } from "react";

function releaseSession() {
  try {
    const url = `${window.location.origin}/api/session/release`;
    const sent = navigator.sendBeacon?.(url);
    if (!sent) {
      void fetch("/api/session/release", { method: "POST", keepalive: true });
    }
  } catch {
    void fetch("/api/session/release", { method: "POST", keepalive: true });
  }
}

export default function SessionAutoRelease() {
  useEffect(() => {
    window.addEventListener("pagehide", releaseSession);
    window.addEventListener("beforeunload", releaseSession);
    return () => {
      window.removeEventListener("pagehide", releaseSession);
      window.removeEventListener("beforeunload", releaseSession);
    };
  }, []);

  return null;
}
