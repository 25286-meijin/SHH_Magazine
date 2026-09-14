import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdmin();
    const body = await request.json() as Record<string, unknown>;
    const issueId = typeof body.issue_id === "string" ? body.issue_id.trim() : "";
    const size = Number(body.pdf_size);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(issueId)) {
      return NextResponse.json({ ok: false, error: "正式期號必須使用 YYYY-MM 格式" }, { status: 400 });
    }
    if (!Number.isInteger(size) || size <= 0 || size > MAX_PDF_BYTES) {
      return NextResponse.json({ ok: false, error: "PDF 必須小於 50 MB" }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase 尚未設定" }, { status: 503 });
    }
    const folder = `${user.id}/${randomUUID()}`;
    const pdfPath = `${folder}/${issueId}.pdf`;
    const coverPath = `${folder}/${issueId}.jpg`;
    const [{ data: pdf, error: pdfError }, { data: cover, error: coverError }] = await Promise.all([
      supabase.storage.from("magazine-staging").createSignedUploadUrl(pdfPath),
      supabase.storage.from("magazine-staging").createSignedUploadUrl(coverPath),
    ]);
    if (pdfError) throw pdfError;
    if (coverError) throw coverError;
    return NextResponse.json({
      ok: true,
      pdf: { path: pdfPath, token: pdf.token },
      cover: { path: coverPath, token: cover.token },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
