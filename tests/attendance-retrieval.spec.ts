import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const EMAIL = "qa-attendance-teacher@smartguide.local";
const PASSWORD = "Qa12345!Attend";
const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570"; // كيمياء — a real subject row
const GRADE = "الأول ثانوي";
const SECTION = "أ";
const LESSON_NAME = "الحصة الأولى";
const STUDENT_NAME = "أسماء الشمري"; // first real student (alphabetically) in GRADE/SECTION
const NOTE_TEXT = `ملاحظة اختبار الاسترجاع ${Date.now()}`;

let admin: SupabaseClient;
let teacherId: string;
let todayIso: string;

async function cleanupAttendanceRows() {
  await admin.from("attendance_records").delete().eq("grade", GRADE).eq("section", SECTION).eq("date", todayIso).eq("lesson", LESSON_NAME);
  await admin.from("lesson_submissions").delete().eq("grade", GRADE).eq("section", SECTION).eq("date", todayIso).eq("lesson", LESSON_NAME);
}

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const signUp = await anon.auth.signUp({ email: EMAIL, password: PASSWORD });
  let userId = signUp.data.user?.id ?? null;
  if (!userId) {
    const signIn = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error || !signIn.data.user) throw new Error(`QA attendance teacher could not be created/signed in: ${signIn.error?.message}`);
    userId = signIn.data.user.id;
    await anon.auth.signOut();
  }
  teacherId = userId;

  await admin.from("profiles").upsert(
    { id: teacherId, full_name: "QA Attendance Teacher", role: "teacher", is_active: true, is_blocked: false, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  // Single, unambiguous real assignment: this teacher teaches exactly one subject/class,
  // so the page's default selection is deterministic even before exercising the
  // persisted-last-context restore this fix adds.
  await admin.from("teacher_assignments").delete().eq("teacher_id", teacherId);
  const { error: assignError } = await admin.from("teacher_assignments").insert({ teacher_id: teacherId, subject_id: SUBJECT_ID, grade: GRADE, section: SECTION });
  if (assignError) throw new Error(`Could not create QA teacher_assignments row: ${assignError.message}`);

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

async function studentRow(page: Page) {
  await expect(page.locator("tr", { hasText: STUDENT_NAME })).toBeVisible({ timeout: 15_000 });
  return page.locator("tr", { hasText: STUDENT_NAME });
}

test("teacher attendance persists across refresh and a real logout/login cycle", async ({ page, context }) => {
  await test.step("A. الحفظ — mark absent + a note, save, verify persisted in Supabase (lesson_submissions + attendance_records)", async () => {
    await login(page);
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();

    // Confirm the page actually landed on our real class (not the demo fallback).
    await expect(page.locator("select").nth(2)).toHaveValue(GRADE, { timeout: 15_000 });
    await expect(page.locator("select").nth(3)).toHaveValue(SECTION);

    const row = await studentRow(page);
    await row.locator("select").selectOption("absent");
    await row.locator('input[placeholder="ملاحظة"]').fill(NOTE_TEXT);

    await page.getByRole("button", { name: "حفظ التحضير" }).click();
    await expect(page.getByText("تم حفظ التحضير بنجاح")).toBeVisible({ timeout: 15_000 });

    // Verify directly against Supabase (not just the UI) that both tables were written.
    const submission = await admin
      .from("lesson_submissions")
      .select("*")
      .eq("grade", GRADE)
      .eq("section", SECTION)
      .eq("date", todayIso)
      .eq("lesson", LESSON_NAME)
      .maybeSingle();
    expect(submission.error).toBeNull();
    expect(submission.data).not.toBeNull();
    expect(submission.data?.teacher_id).toBe(teacherId);

    const record = await admin
      .from("attendance_records")
      .select("*")
      .eq("grade", GRADE)
      .eq("section", SECTION)
      .eq("date", todayIso)
      .eq("lesson", LESSON_NAME)
      .eq("status", "absent")
      .eq("notes", NOTE_TEXT)
      .maybeSingle();
    expect(record.error).toBeNull();
    expect(record.data).not.toBeNull();
  });

  await test.step("B. تحديث الصفحة — reload (no navigation/logout) and verify the status+note survive", async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();

    const row = await studentRow(page);
    await expect(row.locator("select")).toHaveValue("absent", { timeout: 15_000 });
    await expect(row.locator('input[placeholder="ملاحظة"]')).toHaveValue(NOTE_TEXT);
  });

  await test.step("C. تسجيل الخروج والدخول — end the Supabase session (clear the auth cookies @supabase/ssr stores it in) and sign back in", async () => {
    // AppShell's "تسجيل الخروج" link only navigates to /login without ever calling
    // supabase.auth.signOut() (a separate, pre-existing issue outside this task's scope
    // -- see final report). Clearing cookies is what actually ends the session (the app
    // uses createBrowserClient, which is cookie-backed, not localStorage-backed) and is
    // what makes this an honest test of "logged out, then logged back in" -- a fresh
    // React mount with zero prior in-memory state -- rather than just an in-session
    // reload. localStorage is deliberately left untouched: on a real device it survives
    // a logout, which is exactly what lets this fix's last-used-class restore work.
    await context.clearCookies();
    await page.goto("/login");

    await login(page);
  });

  await test.step("D. فتح نفس الحصة — reopen /attendance, confirm the same lesson (same grade/section/subject/date/lesson) auto-restores with the saved status+note from Supabase", async () => {
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible();

    // Confirm the page's default selection landed back on the exact same class.
    await expect(page.locator("select").nth(2)).toHaveValue(GRADE, { timeout: 15_000 });
    await expect(page.locator("select").nth(3)).toHaveValue(SECTION);
    await expect(page.locator('input[type="date"]')).toHaveValue(todayIso);

    const row = await studentRow(page);
    await expect(row.locator("select")).toHaveValue("absent", { timeout: 15_000 });
    await expect(row.locator('input[placeholder="ملاحظة"]')).toHaveValue(NOTE_TEXT);

    // And explicitly re-select the same date/lesson (the user's literal repro script)
    // to prove retrieval works by manual navigation too, not only by the restored default.
    await page.locator('input[type="date"]').fill(todayIso);
    const lessonSelect = page.locator("select").nth(0);
    await lessonSelect.selectOption({ label: LESSON_NAME });
    await page.waitForTimeout(800);

    const rowAfterManualReselect = await studentRow(page);
    await expect(rowAfterManualReselect.locator("select")).toHaveValue("absent", { timeout: 15_000 });
    await expect(rowAfterManualReselect.locator('input[placeholder="ملاحظة"]')).toHaveValue(NOTE_TEXT);
  });
});
