import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase/server";

export class AdminAuthError extends Error {
  constructor(public status: 401 | 403 | 503, message: string) {
    super(message);
  }
}

export async function requireAdmin() {
  const supabase = createUserSupabaseClient();
  if (!supabase) throw new AdminAuthError(503, "Supabase 尚未設定");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AdminAuthError(401, "需要管理員登入");
  if (data.user.app_metadata.role !== "admin") {
    throw new AdminAuthError(403, "此帳號沒有管理員權限");
  }
  return { supabase, user: data.user };
}

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("Admin API error", error);
  return NextResponse.json({ ok: false, error: "伺服器暫時無法處理要求" }, { status: 500 });
}

