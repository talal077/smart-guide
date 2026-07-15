import { supabase } from "@/lib/supabase";

export type AppRole =
  | "principal"
  | "teacher"
  | "vice_principal"
  | "admin"
  | "student";

export type AppUser = {
  id: string;
  email: string | null;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  is_blocked: boolean;
};

export type LoginResult =
  | { success: true; user: AppUser }
  | { success: false; message: string };

export async function login(email: string, password: string, selectedRole: AppRole): Promise<LoginResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    return {
      success: false,
      message: error?.message || "بيانات الدخول غير صحيحة",
    };
  }

  const user = data.user;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, is_blocked")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return {
      success: false,
      message: "حدث خطأ أثناء جلب بيانات المستخدم",
    };
  }

  if (profile?.is_blocked || profile?.is_active === false) {
    await supabase.auth.signOut();
    return {
      success: false,
      message: "هذا الحساب غير نشط أو محظور",
    };
  }

  if (!profile) {
    const defaultFullName = user.user_metadata?.full_name || user.email || "مستخدم";
    const { data: createdProfile, error: createError } = await supabase
      .from("profiles")
      .insert(
        {
          id: user.id,
          full_name: defaultFullName,
          role: selectedRole,
          is_active: true,
          is_blocked: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      )
      .select("id, full_name, role, is_active, is_blocked")
      .single();

    if (createError || !createdProfile) {
      await supabase.auth.signOut();
      return {
        success: false,
        message: "حدث خطأ أثناء إنشاء ملف المستخدم",
      };
    }

    return {
      success: true,
      user: {
        id: createdProfile.id,
        email: user.email ?? null,
        full_name: createdProfile.full_name,
        role: createdProfile.role,
        is_active: createdProfile.is_active,
        is_blocked: createdProfile.is_blocked,
      },
    };
  }

  return {
    success: true,
    user: {
      id: profile.id,
      email: user.email ?? null,
      full_name: profile.full_name,
      role: profile.role,
      is_active: profile.is_active,
      is_blocked: profile.is_blocked,
    },
  };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  const user = data.user;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, is_blocked")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  if (profile.is_blocked || profile.is_active === false) {
    await supabase.auth.signOut();
    return null;
  }

  return {
    id: profile.id,
    email: user.email ?? null,
    full_name: profile.full_name,
    role: profile.role,
    is_active: profile.is_active,
    is_blocked: profile.is_blocked,
  };
}
