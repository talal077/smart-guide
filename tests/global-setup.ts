import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { QA_PASSWORD, QA_USERS, type QaRole } from "./setup/qa-user";
import { REPORTS_SCOPE_MARKER, REPORTS_SCOPE_OTHER_TEACHER_ID, REPORTS_SCOPE_STUDENT_NAME } from "./setup/reports-scope-fixture";

/**
 * Creates (or reuses) one throwaway QA account per role so the reports-page
 * Playwright suite can exercise real authenticated flows for every role.
 * global-teardown.ts removes all of them again once the suite finishes.
 */
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY for Playwright global setup.");
  }

  const anon = createClient(url, anonKey);
  const admin = serviceRole ? createClient(url, serviceRole) : null;

  let teacherUserId: string | null = null;

  for (const role of Object.keys(QA_USERS) as QaRole[]) {
    const { email, fullName } = QA_USERS[role];

    const signUp = await anon.auth.signUp({ email, password: QA_PASSWORD });
    let userId = signUp.data.user?.id ?? null;

    if (!userId) {
      const signIn = await anon.auth.signInWithPassword({ email, password: QA_PASSWORD });
      if (signIn.error || !signIn.data.user) {
        throw new Error(`QA user (${role}) could not be created or signed in: ${signIn.error?.message ?? "unknown error"}`);
      }
      userId = signIn.data.user.id;
      await anon.auth.signOut();
    }

    if (role === "teacher") teacherUserId = userId;

    if (admin) {
      await admin.from("profiles").upsert(
        {
          id: userId,
          full_name: fullName,
          role,
          is_active: true,
          is_blocked: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    }
  }

  // Fixture data for the reports-scoping/search Playwright tests: a dedicated
  // grade/section (REPORTS_SCOPE_MARKER) that cannot collide with real school
  // data, with attendance owned by the QA teacher plus one row owned by an
  // unrelated teacher_id, so tests can assert the teacher-role RPC scoping
  // (migration 021/022) actually excludes the other teacher's row.
  if (admin && teacherUserId) {
    await admin.from("attendance_records").delete().eq("grade", REPORTS_SCOPE_MARKER);
    await admin.from("students").delete().eq("grade", REPORTS_SCOPE_MARKER);
    await admin.from("sections").delete().eq("name", REPORTS_SCOPE_MARKER);

    // The "الشعبة" filter dropdown is populated from public.sections (a fixed
    // reference/catalog table, see migration 009) rather than from distinct
    // students.section values, so the marker section must also exist there or
    // selectOption(REPORTS_SCOPE_MARKER) on that dropdown can never find it.
    const sectionInsert = await admin.from("sections").insert({ name: REPORTS_SCOPE_MARKER, sort_order: 999 });
    if (sectionInsert.error) {
      throw new Error(`Failed to seed reports-scope fixture section: ${sectionInsert.error.message}`);
    }

    const studentId = randomUUID();

    const studentInsert = await admin.from("students").insert({
      id: studentId,
      full_name: REPORTS_SCOPE_STUDENT_NAME,
      grade: REPORTS_SCOPE_MARKER,
      section: REPORTS_SCOPE_MARKER,
      entry_code: `qa-scope-${Date.now()}`,
    });
    if (studentInsert.error) {
      throw new Error(`Failed to seed reports-scope fixture student: ${studentInsert.error.message}`);
    }

    const today = new Date().toISOString().slice(0, 10);

    const attendanceInsert = await admin.from("attendance_records").insert([
      { id: randomUUID(), student_id: studentId, student_name: REPORTS_SCOPE_STUDENT_NAME, grade: REPORTS_SCOPE_MARKER, section: REPORTS_SCOPE_MARKER, date: today, lesson: "1", status: "absent", teacher_id: teacherUserId },
      { id: randomUUID(), student_id: studentId, student_name: REPORTS_SCOPE_STUDENT_NAME, grade: REPORTS_SCOPE_MARKER, section: REPORTS_SCOPE_MARKER, date: today, lesson: "2", status: "absent", teacher_id: teacherUserId },
      { id: randomUUID(), student_id: studentId, student_name: REPORTS_SCOPE_STUDENT_NAME, grade: REPORTS_SCOPE_MARKER, section: REPORTS_SCOPE_MARKER, date: today, lesson: "3", status: "present", teacher_id: teacherUserId },
      { id: randomUUID(), student_id: studentId, student_name: REPORTS_SCOPE_STUDENT_NAME, grade: REPORTS_SCOPE_MARKER, section: REPORTS_SCOPE_MARKER, date: today, lesson: "4", status: "absent", teacher_id: REPORTS_SCOPE_OTHER_TEACHER_ID },
    ]);
    if (attendanceInsert.error) {
      throw new Error(`Failed to seed reports-scope fixture attendance records: ${attendanceInsert.error.message}`);
    }
  }
}
