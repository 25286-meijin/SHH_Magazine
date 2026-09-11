import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const { supabase } = await requireAdmin();
    const { data, error, count } = await supabase
      .from("qr_events")
      .select("id,received_at_utc,topic_title,placement_name,issue_id,qr_id", { count: "exact" })
      .eq("event_type", "qr_entry")
      .order("received_at_utc", { ascending: false })
      .limit(200);
    if (error) throw error;

    const [{ data: topicCounts, error: topicError }, { data: placementCounts, error: placementError }] =
      await Promise.all([
        supabase.rpc("qr_topic_counts"),
        supabase.rpc("qr_placement_counts"),
      ]);
    if (topicError) throw topicError;
    if (placementError) throw placementError;
    return NextResponse.json({
      ok: true,
      totalQrEntries: count ?? 0,
      recentEntries: data ?? [],
      topicCounts: topicCounts ?? [],
      placementCounts: placementCounts ?? [],
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

