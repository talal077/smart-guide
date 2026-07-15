import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// This test specifically exercises the bug scenario: a teacher with MORE THAN ONE
// assignment. Without deterministic ordering + persisted-last-context restore, which
// class the /attendance page defaults to after a fresh login is arbitrary, so a teacher
// who was last working on assignment #2 could silently land back on assignment #1 after
// logging back in -- looking exactly like "my saved attendance disappeared".

const EMAIL = "qa-attendance-multi@smartguide.local";
const PASSWORD = "Qa12345!Attend2";

const ASSIGNMENT_1 = { subjectId: "14892239-f95f-4d28-af85-4b9de36d8570", subjectName: "كيمياء", grade: "الأول ثانوي", section: "أ" };
const ASSIGNMENT_2 = { subjectId: "c0f71647-4479-45bb-8065-32c69bc2924f", subjectName: "انجليزي", grade: "الثاني ثانوي", section: "أ" };
const LESSON_NAME = "الحصة الأولى";
const NOTE_TEXT = `ملاحظة تعدد الإسنادات ${Date.now()}`;

let admin: SupabaseClient;
let teacherId: string;
let todayIso: string;
let targetStudentName: string;

async function cleanupAttendanceRows() {
  for (const a of [ASSIGNMENT_1, ASSIGNMENT_2]) {
    await admin.from("attendance_records").delete().eq("grade", a.grade).eq("section", a.section).eq("date", todayIso).eq("lesson", LESSON_NAME);
    await admin.from("lesson_submissions").delete().eq("grade", a.grade).eq("section", a.section).eq("date", todayIso).eq("lesson", LESSON_NAME);
  }
}

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const signUp = await anon.auth.signUp({ email: EMAIL, password: PASSWORD });
  let userId = signUp.data.user?.id ?? null;
  if (!userId) {
    const signIn = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error || !signIn.data.user) throw new Error(`QA multi-assignment teacher could not be created/signed in: ${signIn.error?.message}`);
    userId = signIn.data.user.id;
    await anon.auth.signOut();
  }
  teacherId = userId;

  await admin.from("profiles").upsert(
    { id: teacherId, full_name: "QA Multi Assignment Teacher", role: "teacher", is_active: true, is_blocked: false, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  await admin.from("teacher_assignments").delete().eq("teacher_id", teacherId);
  // Insert assignment #1 BEFORE #2, so the deterministic created_at-ordered default is
  // #1 -- the OLDER assignment, not the one the teacher will actually work in below.
  // This means the test can only pass if the persisted-last-used-context restore
  // correctly overrides that ordering default back to #2; it deliberately cannot pass
  // "by accident" just because ordering happens to already favor #2.
  const insert1 = await admin.from("teacher_assignments").insert({ teacher_id: teacherId, subject_id: ASSIGNMENT_1.subjectId, grade: ASSIGNMENT_1.grade, section: ASSIGNMENT_1.section });
  if (insert1.error) throw new Error(`assignment #1 insert failed: ${insert1.error.message}`);
  const insert2 = await admin.from("teacher_assignments").insert({ teacher_id: teacherId, subject_id: ASSIGNMENT_2.subjectId, grade: ASSIGNMENT_2.grade, section: ASSIGNMENT_2.section });
  if (insert2.error) throw new Error(`assignment #2 insert failed: ${insert2.error.message}`);

  const { data: students } = await admin.from("students").select("full_name").eq("grade", ASSIGNMENT_2.grade).eq("section", ASSIGNMENT_2.section).order("full_name").limit(1);
  if (!students?.length) throw new Error("no real students found for ASSIGNMENT_2 grade/section");
  targetStudentName = students[0].full_name;

  todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  await cleanupAttendanceRows();
});

test.afterAll(async () => {
  await cleanupAttendanceRows();
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

test("re-login restores the SAME (second) assignment the teacher was last working on, not an arbitrary default", async ({ page, context }) => {
  await test.step("save attendance against assignment #2 (انجليزي / الثاني ثانوي / أ), explicitly selected", async () => {
    await login(page);
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();
    await expect(page.locator("select").nth(2)).toBeVisible({ timeout: 15_000 });

    // Explicitly switch subject -> this also reloads classes for that subject.
    await page.locator("select").nth(1).selectOption({ label: ASSIGNMENT_2.subjectName });
    await page.waitForTimeout(600);
    await page.locator("select").nth(2).selectOption(ASSIGNMENT_2.grade);
    await page.waitForTimeout(300);
    await page.locator("select").nth(3).selectOption(ASSIGNMENT_2.section);
    await page.waitForTimeout(800);

    const row = page.locator("tr", { hasText: targetStudentName });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator("select").selectOption("absent");
    await row.locator('input[placeholder="ملاحظة"]').fill(NOTE_TEXT);

    await page.getByRole("button", { name: "حفظ التحضير" }).click();
    await expect(page.getByText("تم حفظ التحضير بنجاح")).toBeVisible({ timeout: 15_000 });
  });

  await test.step("log out (clear session), log back in", async () => {
    await context.clearCookies();
    await page.goto("/login");
    await login(page);
  });

  await test.step("reopening /attendance defaults back to assignment #2, with the saved status+note intact", async () => {
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();

    await expect(page.locator("select").nth(2)).toHaveValue(ASSIGNMENT_2.grade, { timeout: 15_000 });
    await expect(page.locator("select").nth(3)).toHaveValue(ASSIGNMENT_2.section);

    const row = page.locator("tr", { hasText: targetStudentName });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator("select")).toHaveValue("absent", { timeout: 15_000 });
    await expect(row.locator('input[placeholder="ملاحظة"]')).toHaveValue(NOTE_TEXT);
  });
});
