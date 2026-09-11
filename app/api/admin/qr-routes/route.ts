import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { createOpaqueQrId, getPublicSiteUrl } from "@/lib/qr";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase
      .from("qr_routes")
      .select("id,qr_id,destination_path,active,created_at,topic:qr_topics(id,issue_id,title),placement:placements(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, routes: data, siteUrl: getPublicSiteUrl() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    const body = await request.json() as Record<string, unknown>;
    const topicId = typeof body.topic_id === "string" ? body.topic_id : "";
    const placementId = typeof body.placement_id === "string" ? body.placement_id : "";
    if (!uuidPattern.test(topicId) || !uuidPattern.test(placementId)) {
      return NextResponse.json({ ok: false, error: "請選擇有效的醫訊主題與公播區域" }, { status: 400 });
    }

    const [{ data: topic }, { data: placement }] = await Promise.all([
      supabase.from("qr_topics").select("id,destination_path").eq("id", topicId).eq("active", true).maybeSingle(),
      supabase.from("placements").select("id").eq("id", placementId).eq("active", true).maybeSingle(),
    ]);
    if (!topic || !placement) {
      return NextResponse.json({ ok: false, error: "主題或區域不存在，或目前未啟用" }, { status: 400 });
    }

    const qrId = createOpaqueQrId();
    const { data, error } = await supabase.from("qr_routes").insert({
      qr_id: qrId,
      topic_id: topicId,
      placement_id: placementId,
      destination_path: topic.destination_path,
      created_by: user.id,
    }).select("id,qr_id,destination_path,active,created_at").single();
    if (error?.code === "23505") {
      return NextResponse.json({ ok: false, error: "這個主題與區域已有啟用中的 QR Code" }, { status: 409 });
    }
    if (error) throw error;
    return NextResponse.json({ ok: true, route: data, qrUrl: `${getPublicSiteUrl()}/q/${qrId}` }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

