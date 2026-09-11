import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { getIssue } from "@/lib/content";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const issueId = request.nextUrl.searchParams.get("issue_id") ?? "";
    if (!getIssue(issueId)) {
      return NextResponse.json({ ok: false, error: "請選擇有效的醫訊月份" }, { status: 400 });
    }
    const { data, error, count } = await supabase
      .from("qr_events")
      .select("id,received_at_utc,topic_title,placement_name,issue_id,qr_id", { count: "exact" })
      .eq("event_type", "qr_entry")
      .eq("issue_id", issueId)
      .order("received_at_utc", { ascending: false })
      .limit(200);
    if (error) throw error;

    const [{ data: topicCounts, error: topicError }, { data: placementCounts, error: placementError }] =
      await Promise.all([
        supabase.rpc("qr_topic_counts_by_issue", { target_issue_id: issueId }),
        supabase.rpc("qr_placement_counts_by_issue", { target_issue_id: issueId }),
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
