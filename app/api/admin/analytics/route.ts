import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const issueId = request.nextUrl.searchParams.get("issue_id") ?? "";
    const [issueResult, entriesResult, topicResult, placementResult] = await Promise.all([
      supabase.from("magazine_issues").select("id").eq("issue_id", issueId).eq("status", "published").maybeSingle(),
      supabase
        .from("qr_events")
        .select("id,received_at_utc,topic_title,placement_name", { count: "exact" })
        .eq("event_type", "qr_entry")
        .eq("issue_id", issueId)
        .order("received_at_utc", { ascending: false })
        .limit(200),
      supabase.rpc("qr_topic_counts_by_issue", { target_issue_id: issueId }),
      supabase.rpc("qr_placement_counts_by_issue", { target_issue_id: issueId }),
    ]);
    if (issueResult.error) throw issueResult.error;
    if (!issueResult.data) {
      return NextResponse.json({ ok: false, error: "請選擇有效的醫訊月份" }, { status: 400 });
    }
    const { data, error, count } = entriesResult;
    const { data: topicCounts, error: topicError } = topicResult;
    const { data: placementCounts, error: placementError } = placementResult;
    if (error) throw error;
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
