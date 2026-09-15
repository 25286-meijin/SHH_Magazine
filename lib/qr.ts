import { randomBytes } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type StoredQrRoute = {
  qr_id: string;
  destination_path: string;
  topic: { id: string; issue_id: string; title: string; page_number: number | null };
  placement: { id: string; name: string };
};

export function createOpaqueQrId() {
  return `qr_${randomBytes(18).toString("base64url")}`;
}

export function isTrustedIssueDestination(value: string) {
  return /^\/(issues|read)\/[A-Za-z0-9_-]+$/.test(value);
}

export function getPublicSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) throw new Error("NEXT_PUBLIC_SITE_URL is required");
  const url = new URL(raw);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production");
  }
  return url.origin;
}

export async function getStoredQrRoute(qrId: string): Promise<StoredQrRoute | null> {
  if (!/^qr_[A-Za-z0-9_-]{20,80}$/.test(qrId)) return null;
  const supabase = createServiceSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("qr_routes")
    .select("qr_id,destination_path,topic:qr_topics(id,issue_id,title,page_number),placement:placements(id,name)")
    .eq("qr_id", qrId)
    .eq("active", true)
    .abortSignal(AbortSignal.timeout(1_200))
    .maybeSingle();
  if (error || !data) return null;

  const record = data as unknown as StoredQrRoute;
  return isTrustedIssueDestination(record.destination_path) ? record : null;
}

export async function recordQrEntry(route: StoredQrRoute, entryId: string, at: string) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.from("qr_events").insert({
    event_type: "qr_entry",
    received_at_utc: at,
    qr_entry_at_utc: at,
    entry_id: entryId,
    qr_id: route.qr_id,
    topic_id: route.topic.id,
    topic_title: route.topic.title,
    placement_id: route.placement.id,
    placement_name: route.placement.name,
    issue_id: route.topic.issue_id,
  }).abortSignal(AbortSignal.timeout(800));
  if (error) throw error;
}
