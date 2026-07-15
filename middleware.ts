import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type Role = "admin" | "vice_principal" | "principal" | "teacher" | "student";

const PUBLIC_PATHS = ["/login", "/register"];

const ALLOWED_PREFIXES: Record<Role, string[]> = {
  admin: ["/"],
  vice_principal: ["/"],
  principal: ["/"],
  teacher: ["/dashboard", "/attendance", "/absence-records", "/reports", "/notifications", "/students", "/settings"],
  student: ["/dashboard", "/attendance", "/reports", "/notifications"],
};

function isPathAllowed(role: Role, pathname: string) {
  const allowed = ALLOWED_PREFIXES[role] ?? [];
  return allowed.some((prefix) => {
    if (prefix === "/") return true;
    return pathname === prefix || pathname.startsWith(prefix + "/");
  });
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const cookies: Array<{ name: string; value: string; options: any }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookies.push(...cookiesToSet);
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user) {
    if (PUBLIC_PATHS.includes(pathname)) {
      cookies.forEach((cookie) => response.cookies.set(cookie.name, cookie.value, cookie.options));
      return response;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.role) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = profile.role as Role;

  const { data: settingsRow } = await supabase
    .from("school_settings")
    .select("id")
    .eq("id", true)
    .maybeSingle();

  const setupComplete = !!settingsRow;

  if (pathname === "/setup") {
    if (setupComplete) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    cookies.forEach((cookie) => response.cookies.set(cookie.name, cookie.value, cookie.options));
    return response;
  }

  if (!setupComplete) {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  if (!isPathAllowed(role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  cookies.forEach((cookie) => response.cookies.set(cookie.name, cookie.value, cookie.options));
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.png|manifest.json|.*\\..*).*)"],
};
