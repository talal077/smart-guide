import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { AppRole } from "@/lib/auth";

type LoginPayload = {
  email: string;
  password: string;
  selectedRole: AppRole;
};

async function buildSupabase(request: NextRequest) {
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

  return { supabase, cookies };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LoginPayload;

  if (!body.email || !body.password) {
    return NextResponse.json(
      { success: false, message: "يرجى إدخال البريد الإلكتروني وكلمة المرور." },
      { status: 400 }
    );
  }

  const { supabase, cookies } = await buildSupabase(request);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email.trim(),
    password: body.password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { success: false, message: error?.message || "بيانات الدخول غير صحيحة." },
      { status: 400 }
    );
  }

  const user = data.user;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, is_blocked")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { success: false, message: "حدث خطأ أثناء جلب بيانات الملف الشخصي." },
      { status: 500 }
    );
  }

  if (profile?.is_blocked || profile?.is_active === false) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { success: false, message: "هذا الحساب غير نشط أو محظور." },
      { status: 403 }
    );
  }

  const profileRecord =
    profile ??
    (await supabase
      .from("profiles")
      .insert({
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email || "مستخدم",
        role: body.selectedRole,
        is_active: true,
        is_blocked: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, full_name, role, is_active, is_blocked")
      .single()).data;

  if (!profileRecord) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { success: false, message: "حدث خطأ أثناء إنشاء ملف المستخدم." },
      { status: 500 }
    );
  }

  const response = NextResponse.json(
    {
      success: true,
      user: {
        id: profileRecord.id,
        email: user.email ?? null,
        full_name: profileRecord.full_name,
        role: profileRecord.role,
        is_active: profileRecord.is_active,
        is_blocked: profileRecord.is_blocked,
      },
    },
    { status: 200 }
  );

  cookies.forEach((cookie) => response.cookies.set(cookie.name, cookie.value, cookie.options));

  return response;
}
