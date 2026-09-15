import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type TrackingEvent = { event: string; [key: string]: unknown };

export async function trackServerEvent(payload: TrackingEvent) {
  // Adapter seam for GA4 or a durable event store. Tracking is deliberately best-effort.
  if (process.env.ANALYTICS_ENDPOINT) {
    await fetch(process.env.ANALYTICS_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(800) });
  }
}

const eventNames = new Set([
  "read_start", "read_25", "read_50", "read_75", "read_90",
  "read_complete", "engagement_heartbeat", "page_jump", "reader_error",
]);

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

export async function recordClientEvent(payload: Record<string, unknown>) {
  const event = typeof payload.event === "string" ? payload.event : "";
  const entryId = typeof payload.entry_id === "string" ? payload.entry_id : "";
  if (!eventNames.has(event) || !/^[0-9a-f-]{36}$/i.test(entryId)) return;

  const supabase = createServiceSupabaseClient();
  if (!supabase) return;

  const { data: entry, error: lookupError } = await supabase
    .from("qr_events")
    .select("entry_id,qr_id,topic_id,topic_title,placement_id,placement_name,issue_id,qr_entry_at_utc")
    .eq("event_type", "qr_entry")
    .eq("entry_id", entryId)
    .order("received_at_utc", { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(800))
    .maybeSingle();
  if (lookupError || !entry) return;

  const sessionId = typeof payload.session_id === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.session_id) ? payload.session_id : null;
  const { error } = await supabase.from("qr_events").insert({
    event_type: event,
    received_at_utc: new Date().toISOString(),
    qr_entry_at_utc: entry.qr_entry_at_utc,
    entry_id: entry.entry_id,
    session_id: sessionId,
    qr_id: entry.qr_id,
    topic_id: entry.topic_id,
    topic_title: entry.topic_title,
    placement_id: entry.placement_id,
    placement_name: entry.placement_name,
    issue_id: entry.issue_id,
    page_number: nonNegativeInteger(payload.page),
    active_engagement_seconds: nonNegativeInteger(payload.active_engagement_seconds),
    elapsed_session_seconds: nonNegativeInteger(payload.elapsed_session_seconds),
    final: payload.final === true,
  }).abortSignal(AbortSignal.timeout(800));
  if (error) throw error;
}
