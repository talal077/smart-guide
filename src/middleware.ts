import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canAccess, type UserRole } from "@/lib/permissions";

// Rewritten during the الإعدادات review: this previously checked a
// "smart-guide-session" cookie that nothing in the real login flow ever wrote
// (its only writer, saveSession() in src/lib/session.ts, was dead code called
// from nowhere) — so `if (!session)` was true for every request, and the
// `!session` branch's redirect to /login should have fired for literally
// every visitor including logged-in managers. In practice this meant the edge
// gate was not a real access-control layer at all; every page's own
// client-side getCurrentUser()+role check (see e.g. src/app/audit-log/page.tsx)
// was the only thing actually enforcing anything. This now uses the same
// Supabase SSR cookie session every other part of the app already relies on
// (see src/app/api/auth/login/route.ts for the same createServerClient
// pattern), so the edge gate is real and matches src/lib/auth.ts's notion of
// "signed in".
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: profile } = await supabase.from("profiles").select("role, is_active, is_blocked").eq("id", user.id).maybeSingle();

  if (!profile || profile.is_blocked || profile.is_active === false) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!canAccess(profile.role as UserRole, request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/attendance/:path*",
    "/students/:path*",
    "/reports/:path*",
    "/analytics/:path*",
    "/notifications/:path*",
    "/operations-log/:path*",
    "/teachers/:path*",
    "/classes/:path*",
    "/subjects/:path*",
    "/settings/:path*",
    "/student-actions/:path*",
    "/audit-log/:path*",
    "/admin/:path*",
    "/vice-principal/:path*",
  ],
};
