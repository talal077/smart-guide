import { supabase } from "@/lib/supabase";

export type MyAssignment = { subjectName: string; grade: string; section: string };

/** Self-service update: only ever sends full_name — role/is_active/is_blocked are
 * never included here regardless of the caller's role, matching the column-level
 * protection added in migration 019 (trg_protect_profiles_self_update). */
export async function updateMyFullName(userId: string, fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error("الاسم مطلوب.");
  const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", userId);
  if (error) throw error;
}

const PASSWORD_MIN_LENGTH = 8;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN_LENGTH} أحرف.`;
  if (!/[a-zA-Z]/.test(password)) return "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل.";
  if (!/[0-9]/.test(password)) return "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.";
  return null;
}

/** Changes the signed-in user's own password via Supabase Auth. Supabase's admin
 * API is the only way to verify an old password server-side, which requires
 * service_role (never available in the browser) — so, matching Supabase's own
 * documented pattern, the current session itself (already authenticated) is the
 * proof of identity; there is no "current password" field to leak or store. */
export async function changeMyPassword(newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) throw new Error("كلمتا المرور غير متطابقتين.");
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw new Error(strengthError);

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Read-only: the subject(s) + grade/section combinations assigned to a teacher,
 * for display only on their own "بيانات المستخدم" section. */
export async function getMyAssignments(teacherId: string): Promise<MyAssignment[]> {
  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("grade, section, subjects(name)")
    .eq("teacher_id", teacherId)
    .order("grade", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    subjectName: (Array.isArray(row.subjects) ? row.subjects[0]?.name : row.subjects?.name) ?? "",
    grade: row.grade ?? "",
    section: row.section ?? "",
  }));
}
