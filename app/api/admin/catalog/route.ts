import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { getIssue } from "@/lib/content";
import { FIXED_QR_PLACEMENTS } from "@/lib/qr-placements";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const { supabase } = await requireAdmin();
    const { data: placements, error: placementsError } = await supabase
      .from("placements")
      .select("id,name,description,active")
      .in("name", [...FIXED_QR_PLACEMENTS]);
    if (placementsError) throw placementsError;
    const placementOrder = new Map(FIXED_QR_PLACEMENTS.map((name, index) => [name, index]));
    const orderedPlacements = (placements ?? []).sort(
      (left, right) => (placementOrder.get(left.name) ?? 99) - (placementOrder.get(right.name) ?? 99),
    );
    return NextResponse.json({ ok: true, placements: orderedPlacements });
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
      if (!issueId || !title || !await getIssue(issueId)) {
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

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const active = typeof body.active === "boolean" ? body.active : null;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ ok: false, error: "資料識別碼不正確" }, { status: 400 });
    }

    if (body.kind === "topic") {
      const title = cleanText(body.title, 160);
      if (!title || active === null) {
        return NextResponse.json({ ok: false, error: "請填寫正式主題名稱" }, { status: 400 });
      }
      const { data, error } = await supabase.from("qr_topics").update({ title, active }).eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ ok: false, error: "找不到醫訊主題" }, { status: 404 });
      return NextResponse.json({ ok: true, item: data });
    }

    if (body.kind === "placement") {
      const name = cleanText(body.name, 120);
      const description = cleanText(body.description, 500) || null;
      if (!name || active === null) {
        return NextResponse.json({ ok: false, error: "請填寫正式公播區域名稱" }, { status: 400 });
      }
      const { data, error } = await supabase.from("placements").update({ name, description, active }).eq("id", id).select().maybeSingle();
      if (error?.code === "23505") {
        return NextResponse.json({ ok: false, error: "已有相同名稱的公播區域" }, { status: 409 });
      }
      if (error) throw error;
      if (!data) return NextResponse.json({ ok: false, error: "找不到公播區域" }, { status: 404 });
      return NextResponse.json({ ok: true, item: data });
    }

    return NextResponse.json({ ok: false, error: "未知的資料類型" }, { status: 400 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
