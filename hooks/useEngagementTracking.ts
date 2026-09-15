"use client";

import { useCallback, useEffect, useRef } from "react";

type Context = {
  issueId: string;
  entryId: string | null;
  enabled?: boolean;
};

export function useEngagementTracking({ issueId, entryId, enabled = true }: Context) {
  const sessionId = useRef<string>();
  const sessionStartedAt = useRef(Date.now());
  const activeMilliseconds = useRef(0);
  const lastTickAt = useRef(Date.now());
  const lastActivityAt = useRef(Date.now());

  if (!sessionId.current) sessionId.current = crypto.randomUUID();

  const tick = useCallback(() => {
    const now = Date.now();
    const isEngaged =
      !document.hidden && now - lastActivityAt.current < 30_000;
    if (isEngaged) activeMilliseconds.current += now - lastTickAt.current;
    lastTickAt.current = now;
  }, []);

  const track = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      if (!enabled) return;
      try {
        const body = JSON.stringify({
          event,
          entry_id: entryId ?? undefined,
          session_id: sessionId.current,
          issue_id: issueId,
          session_started_at: new Date(sessionStartedAt.current).toISOString(),
          active_engagement_seconds: Math.round(activeMilliseconds.current / 1000),
          elapsed_session_seconds: Math.round(
            (Date.now() - sessionStartedAt.current) / 1000,
          ),
          ...extra,
        });

        const blob = new Blob([body], { type: "application/json" });
        if (!navigator.sendBeacon("/api/events", blob)) {
          void fetch("/api/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => undefined);
        }
      } catch {
        // Analytics must never interrupt reading.
      }
    },
    [enabled, entryId, issueId],
  );

  useEffect(() => {
    if (!enabled) return;
    const markActivity = () => {
      lastActivityAt.current = Date.now();
    };
    const flush = () => {
      tick();
      track("engagement_heartbeat", { final: true });
    };
    const interval = window.setInterval(() => {
      tick();
      track("engagement_heartbeat");
    }, 15_000);
    const activityEvents = ["scroll", "pointerdown", "touchstart", "keydown"];

    activityEvents.forEach((event) =>
      window.addEventListener(event, markActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((event) =>
        window.removeEventListener(event, markActivity),
      );
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [enabled, tick, track]);

  return track;
}
