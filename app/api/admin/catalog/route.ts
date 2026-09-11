import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { getIssue } from "@/lib/content";

export async function GET() {
  try {
    const { supabase } = await requireAdmin();
    const [{ data: topics, error: topicsError }, { data: placements, error: placementsError }] =
      await Promise.all([
        supabase.from("qr_topics").select("*").order("created_at", { ascending: false }),
        supabase.from("placements").select("*").order("name"),
      ]);
    if (topicsError) throw topicsError;
    if (placementsError) throw placementsError;
    return NextResponse.json({ ok: true, topics, placements });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "資料格式不正確" }, { status: 400 });
    }
    const value = body as Record<string, unknown>;

    if (value.kind === "topic") {
      const issueId = cleanText(value.issue_id, 32);
      const title = cleanText(value.title, 160);
      if (!issueId || !title || !getIssue(issueId)) {
        return NextResponse.json({ ok: false, error: "請選擇有效期號並填寫正式主題名稱" }, { status: 400 });
      }
      const { data, error } = await supabase.from("qr_topics").insert({
        issue_id: issueId,
        title,
        destination_path: `/issues/${issueId}`,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ ok: true, item: data }, { status: 201 });
    }

    if (value.kind === "placement") {
      const name = cleanText(value.name, 120);
      const description = cleanText(value.description, 500) || null;
      if (!name) {
        return NextResponse.json({ ok: false, error: "請填寫正式公播區域名稱" }, { status: 400 });
      }
      const { data, error } = await supabase.from("placements").insert({
        name, description, created_by: user.id,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ ok: true, item: data }, { status: 201 });
    }

    return NextResponse.json({ ok: false, error: "未知的資料類型" }, { status: 400 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

