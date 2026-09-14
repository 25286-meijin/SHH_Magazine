import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { getIssue } from "@/lib/content";
import { createOpaqueQrId, getPublicSiteUrl } from "@/lib/qr";
import { isFixedQrPlacement } from "@/lib/qr-placements";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase
      .from("qr_routes")
      .select("id,qr_id,destination_path,active,created_at,topic:qr_topics(id,issue_id,title,page_number),placement:placements(id,name)")
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
    const issueId = cleanText(body.issue_id, 32);
    const title = cleanText(body.title, 160);
    const pageNumber = positiveInteger(body.page_number);
    const placementId = typeof body.placement_id === "string" ? body.placement_id : "";
    if (!await getIssue(issueId) || !title || !pageNumber || !uuidPattern.test(placementId)) {
      return NextResponse.json({ ok: false, error: "請選擇有效月份、填寫主題與頁碼、並選擇公播區域" }, { status: 400 });
    }

    const { data: placement } = await supabase
      .from("placements").select("id,name").eq("id", placementId).eq("active", true).maybeSingle();
    if (!placement || !isFixedQrPlacement(placement.name)) {
      return NextResponse.json({ ok: false, error: "公播區域不存在，或目前未啟用" }, { status: 400 });
    }

    const destinationPath = `/read/${issueId}`;
    const topic = await findOrCreateTopic(supabase, user.id, {
      issueId, title, pageNumber, destinationPath,
    });

    const qrId = createOpaqueQrId();
    const { data, error } = await supabase.from("qr_routes").insert({
      qr_id: qrId,
      topic_id: topic.id,
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

type AdminSupabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function findOrCreateTopic(
  supabase: AdminSupabase,
  userId: string,
  values: { issueId: string; title: string; pageNumber: number; destinationPath: string },
) {
  const query = () => supabase.from("qr_topics")
    .select("id,destination_path,active")
    .eq("issue_id", values.issueId)
    .eq("title", values.title)
    .eq("page_number", values.pageNumber)
    .maybeSingle();
  const { data: existing, error: lookupError } = await query();
  if (lookupError) throw lookupError;
  if (existing) {
    if (existing.active && existing.destination_path === values.destinationPath) return existing;
    const { data, error } = await supabase.from("qr_topics").update({
      active: true,
      destination_path: values.destinationPath,
    }).eq("id", existing.id).select("id,destination_path,active").single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from("qr_topics").insert({
    issue_id: values.issueId,
    title: values.title,
    page_number: values.pageNumber,
    destination_path: values.destinationPath,
    created_by: userId,
  }).select("id,destination_path,active").single();
  if (!error) return data;
  if (error.code !== "23505") throw error;

  const { data: racedTopic, error: racedError } = await query();
  if (racedError || !racedTopic) throw racedError ?? error;
  return racedTopic;
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 9_999 ? parsed : null;
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json() as Record<string, unknown>;
    const qrId = typeof body.qr_id === "string" ? body.qr_id : "";
    if (!/^qr_[A-Za-z0-9_-]{20,80}$/.test(qrId) || body.active !== false) {
      return NextResponse.json({ ok: false, error: "只能停用有效的 QR Code" }, { status: 400 });
    }

    const { data, error } = await supabase.from("qr_routes").update({
      active: false,
      deactivated_at: new Date().toISOString(),
    }).eq("qr_id", qrId).eq("active", true).select("qr_id,active,deactivated_at").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "找不到啟用中的 QR Code" }, { status: 404 });
    return NextResponse.json({ ok: true, route: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
