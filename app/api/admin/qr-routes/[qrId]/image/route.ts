import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { getPublicSiteUrl } from "@/lib/qr";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { qrId: string } }) {
  try {
    const { supabase } = await requireAdmin();
    const { data: route, error } = await supabase
      .from("qr_routes")
      .select("qr_id")
      .eq("qr_id", params.qrId)
      .maybeSingle();
    if (error) throw error;
    if (!route) return NextResponse.json({ ok: false, error: "找不到 QR Code" }, { status: 404 });

    const value = `${getPublicSiteUrl()}/q/${route.qr_id}`;
    const format = request.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    const headers = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${disposition}; filename="${route.qr_id}.${format}"`,
    };
    if (format === "svg") {
      const svg = await QRCode.toString(value, { type: "svg", errorCorrectionLevel: "H", margin: 4 });
      return new NextResponse(svg, { headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" } });
    }
    const png = await QRCode.toBuffer(value, { type: "png", errorCorrectionLevel: "H", margin: 4, width: 1200 });
    return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
