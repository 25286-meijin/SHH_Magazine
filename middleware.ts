import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config) {
    return new NextResponse("管理介面尚未設定 Supabase 驗證。", { status: 503 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const path = request.nextUrl.pathname;
  if (path === "/admin/login" || path === "/api/admin/session") return response;

  const { data } = await supabase.auth.getUser();
  if (data.user?.app_metadata.role === "admin") return response;

  if (path.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "需要管理員登入" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/admin/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
