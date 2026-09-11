import { NextRequest, NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createUserSupabaseClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase 尚未設定" }, { status: 503 });
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ ok: false, error: "請輸入電子郵件與密碼" }, { status: 400 });
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
  if (error || data.user?.app_metadata.role !== "admin") {
    if (data.session) await supabase.auth.signOut();
    return NextResponse.json({ ok: false, error: "登入失敗或帳號沒有管理員權限" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = createUserSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

