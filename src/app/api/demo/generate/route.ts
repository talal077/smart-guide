import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase";
import { generateDemoData, getDemoSummary, isDemoDataPresent } from "@/lib/demoData";

const ALLOWED_ROLES = ["principal", "admin", "vice_principal"];

export async function POST(request: NextRequest) {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // no-op: this route does not need to persist auth cookie refreshes
      },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ success: false, message: "يجب تسجيل الدخول." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (!profile || !ALLOWED_ROLES.includes(String(profile.role))) {
    return NextResponse.json({ success: false, message: "لا تملك صلاحية إنشاء البيانات التجريبية." }, { status: 403 });
  }

  try {
    const admin = createServiceRoleClient();

    if (await isDemoDataPresent(admin)) {
      const summary = await getDemoSummary(admin);
      return NextResponse.json({
        success: true,
        alreadyExisted: true,
        message: "البيانات التجريبية موجودة بالفعل.",
        counts: summary,
      });
    }

    const counts = await generateDemoData(admin);
    return NextResponse.json({ success: true, alreadyExisted: false, counts });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "حدث خطأ أثناء إنشاء البيانات التجريبية." }, { status: 500 });
  }
}
