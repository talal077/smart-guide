import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Exercises the exact 8-step protocol requested: 5 real students (from the real
// `students` table, never a client-side mock array), mark 3 absent with a note, save,
// verify all 5 attendance_records rows exist in Supabase (not just the 3 touched ones),
// reload, log out, log back in, reopen the same lesson, and verify retrieval from
// Supabase -- not from the "تم الحفظ" success toast, which proves nothing about storage.
//
// All fixtures here (teacher, assignment, 5 students, attendance rows) are created in
// beforeAll and fully deleted in afterAll -- a self-cleaning test harness, not a
// persistent write to shared/production data. The separately-requested *persistent*
// seed data (a long-lived demo teacher account) is delivered instead as a reviewable
// SQL file per the task's explicit instruction not to write that directly.

const EMAIL = "qa-attendance-roster@smartguide.local";
const PASSWORD = "Qa12345!Roster";
const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570"; // كيمياء — real subject row
const GRADE = "الأول ثانوي"; // real grade
const SECTION = `TEST-${Date.now()}`; // isolated, not a real school section
const LESSON_NAME = "الحصة الأولى";
const STUDENT_NAMES = ["طالب اختبار 1", "طالب اختبار 2", "طالب اختبار 3", "طالب اختبار 4", "طالب اختبار 5"];
const ABSENT_NAMES = STUDENT_NAMES.slice(0, 3); // mark exactly 3 of the 5 absent
const NOTE_PREFIX = `ملاحظة اختبار الجذر الكامل ${Date.now()}`;

let admin: SupabaseClient;
let teacherId: string;
let studentIds: string[];
let todayIso: string;

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const signUp = await anon.auth.signUp({ email: EMAIL, password: PASSWORD });
  let userId = signUp.data.user?.id ?? null;
  if (!userId) {
    const signIn = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error || !signIn.data.user) throw new Error(`QA roster teacher could not be created/signed in: ${signIn.error?.message}`);
    userId = signIn.data.user.id;
    await anon.auth.signOut();
  }
  teacherId = userId;

  await admin.from("profiles").upsert(
    { id: teacherId, full_name: "QA Roster Teacher", role: "teacher", is_active: true, is_blocked: false, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  await admin.from("teacher_assignments").delete().eq("teacher_id", teacherId);
  const { error: assignError } = await admin.from("teacher_assignments").insert({ teacher_id: teacherId, subject_id: SUBJECT_ID, grade: GRADE, section: SECTION });
  if (assignError) throw new Error(`teacher_assignments insert failed: ${assignError.message}`);

  await admin.from("students").delete().eq("grade", GRADE).eq("section", SECTION);
  const studentRows = STUDENT_NAMES.map((full_name) => ({ id: crypto.randomUUID(), full_name, grade: GRADE, section: SECTION, entry_code: null }));
  const { data: insertedStudents, error: studentsError } = await admin.from("students").insert(studentRows).select("id, full_name");
  if (studentsError || !insertedStudents) throw new Error(`students insert failed: ${studentsError?.message}`);
  studentIds = insertedStudents.map((s) => s.id);

  todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  await admin.from("attendance_records").delete().eq("grade", GRADE).eq("section", SECTION).eq("date", todayIso).eq("lesson", LESSON_NAME);
  await admin.from("lesson_submissions").delete().eq("grade", GRADE).eq("section", SECTION).eq("date", todayIso).eq("lesson", LESSON_NAME);
});

test.afterAll(async () => {
  await admin.from("attendance_records").delete().eq("grade", GRADE).eq("section", SECTION).eq("date", todayIso).eq("lesson", LESSON_NAME);
  await admin.from("lesson_submissions").delete().eq("grade", GRADE).eq("section", SECTION).eq("date", todayIso).eq("lesson", LESSON_NAME);
  await admin.from("students").delete().in("id", studentIds ?? []);
  await admin.from("teacher_assignments").delete().eq("teacher_id", teacherId);
  await admin.from("profiles").delete().eq("id", teacherId);
  await admin.auth.admin.deleteUser(teacherId);
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(EMAIL);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

test("full 8-step protocol: 5 real students, 3 marked absent, verified in Supabase across a real logout/login", async ({ page, context }) => {
  await test.step("أ+ب. تسجيل الدخول بالمعلم التجريبي وفتح الحصة المرتبطة به", async () => {
    await login(page);
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();
    await expect(page.locator("select").nth(2)).toHaveValue(GRADE, { timeout: 15_000 });
    await expect(page.locator("select").nth(3)).toHaveValue(SECTION);
  });

  await test.step("ج. تأكد أن الطلاب الخمسة جاؤوا من جدول students (لا رسالة بيانات تجريبية، ولا طلاب 'طالب تجريبي')", async () => {
    await expect(page.getByText("لم يتم إسناد أي مواد أو صفوف لك بعد")).toHaveCount(0);
    await expect(page.getByText("بيانات تجريبية", { exact: false })).toHaveCount(0);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(STUDENT_NAMES.length, { timeout: 15_000 });
    for (const name of STUDENT_NAMES) {
      await expect(page.locator("tr", { hasText: name })).toBeVisible();
    }
  });

  await test.step("د. غيّر 3 طلاب إلى غائب وأضف ملاحظة لكل واحد", async () => {
    for (const name of ABSENT_NAMES) {
      const row = page.locator("tr", { hasText: name });
      await row.locator("select").selectOption("absent");
      await row.locator('input[placeholder="ملاحظة"]').fill(`${NOTE_PREFIX} - ${name}`);
    }
  });

  await test.step("هـ+و. اضغط حفظ التحضير، ثم تحقق مباشرة من Supabase أن 5 سجلات attendance_records أُنشئت", async () => {
    await page.getByRole("button", { name: "حفظ التحضير" }).click();
    await expect(page.getByText("تم حفظ التحضير بنجاح")).toBeVisible({ timeout: 15_000 });

    const { data: records, error } = await admin
      .from("attendance_records")
      .select("student_id, status, notes")
      .eq("grade", GRADE)
      .eq("section", SECTION)
      .eq("date", todayIso)
      .eq("lesson", LESSON_NAME);

    expect(error).toBeNull();
    expect(records?.length).toBe(5); // NOT 3 -- the full roster, including the 2 untouched "present" students

    const byStudent = new Map((records ?? []).map((r) => [r.student_id, r]));
    for (const id of studentIds) {
      expect(byStudent.has(id), `missing attendance_records row for student ${id}`).toBe(true);
    }

    const absentCount = (records ?? []).filter((r) => r.status === "absent").length;
    const presentCount = (records ?? []).filter((r) => r.status === "present").length;
    expect(absentCount).toBe(3);
    expect(presentCount).toBe(2);
  });

  await test.step("ز. حدّث الصفحة وتأكد أن الحالات بقيت", async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();

    for (const name of ABSENT_NAMES) {
      const row = page.locator("tr", { hasText: name });
      await expect(row.locator("select")).toHaveValue("absent", { timeout: 15_000 });
      await expect(row.locator('input[placeholder="ملاحظة"]')).toHaveValue(`${NOTE_PREFIX} - ${name}`);
    }
  });

  await test.step("ح+ط. سجل خروجًا ثم سجل دخولًا بنفس المعلم", async () => {
    await context.clearCookies();
    await page.goto("/login");
    await login(page);
  });

  await test.step("ي+ك. افتح نفس التاريخ والمادة والصف والشعبة والحصة، وتأكد أن الحالات والملاحظات رجعت من Supabase", async () => {
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();

    await expect(page.locator("select").nth(2)).toHaveValue(GRADE, { timeout: 15_000 });
    await expect(page.locator("select").nth(3)).toHaveValue(SECTION);
    await expect(page.locator('input[type="date"]')).toHaveValue(todayIso);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(STUDENT_NAMES.length, { timeout: 15_000 });

    for (const name of ABSENT_NAMES) {
      const row = page.locator("tr", { hasText: name });
      await expect(row.locator("select")).toHaveValue("absent", { timeout: 15_000 });
      await expect(row.locator('input[placeholder="ملاحظة"]')).toHaveValue(`${NOTE_PREFIX} - ${name}`);
    }

    const untouchedName = STUDENT_NAMES.find((n) => !ABSENT_NAMES.includes(n))!;
    const untouchedRow = page.locator("tr", { hasText: untouchedName });
    await expect(untouchedRow.locator("select")).toHaveValue("present");
  });
});
