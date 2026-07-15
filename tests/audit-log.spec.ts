import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { QA_PASSWORD, QA_USERS } from "./setup/qa-user";

const RUN = Date.now();
const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570"; // كيمياء — real subject row reused across suites
const GRADE = "الأول ثانوي";
const SECTION = `AL-${RUN}`;
const LESSON_NUMBER = 2;
const LESSON_NAME = "الحصة الثانية";

let admin: SupabaseClient;
let mainTeacherId: string;
let studentId: string;

const syntheticIds: string[] = [];

function nextAllowedIsoDate(): { iso: string; dayAr: string } {
  const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const d = new Date();
  for (let i = 0; i < 14; i++) {
    if (d.getDay() <= 4) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { iso, dayAr: WEEKDAY_AR[d.getDay()] };
    }
    d.setDate(d.getDate() + 1);
  }
  throw new Error("could not find an allowed weekday");
}
const { iso: ACTION_DATE, dayAr: ACTION_DAY_AR } = nextAllowedIsoDate();

async function login(page: Page, role: "principal" | "admin" | "vice_principal" | "teacher" | "student") {
  const { email } = QA_USERS[role];
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function gotoAuditLog(page: Page) {
  await page.goto("/audit-log");
  await expect(page.getByRole("heading", { name: "سجل التدقيق (Audit Log)" })).toBeVisible({ timeout: 15_000 });
}

function formSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: /تفاصيل الطلب|تعديل الطلب/ }) });
}

/** The audit-log page renders BOTH a mobile card list (<article>, "lg:hidden")
 * and a desktop table (<tr>, "hidden lg:block") at all viewport widths — only
 * one is actually visible via CSS at a time. `:visible` picks whichever one
 * the current project's viewport is actually showing, so the same test works
 * unmodified on both the chromium (desktop) and mobile Playwright projects. */
function logRow(page: Page, text: string | RegExp) {
  return page.locator("article:visible, tr:visible").filter({ hasText: text });
}

/** Same reasoning as logRow: the expanded detail panel exists twice in the DOM
 * (once inside the hidden mobile card, once inside the hidden-or-visible
 * desktop sibling row) — only one copy is ever actually visible at a time. */
function visibleText(page: Page, text: string | RegExp) {
  return page.getByText(text).and(page.locator(":visible"));
}

async function cleanupAll() {
  if (studentId) {
    const { data: actions } = await admin.from("student_actions").select("id").eq("student_id", studentId);
    const actionIds = (actions ?? []).map((a) => a.id);
    if (actionIds.length) {
      await admin.from("notifications").delete().in("student_action_id", actionIds);
      await admin.from("audit_logs").delete().in("student_action_id", actionIds);
      await admin.from("student_actions").delete().in("id", actionIds);
    }
  }
  if (syntheticIds.length) await admin.from("audit_logs").delete().in("id", syntheticIds);
  await admin.from("audit_logs").delete().ilike("details", `%${RUN}%`);
  if (studentId) await admin.from("students").delete().eq("id", studentId);
  await admin.from("class_schedule").delete().eq("grade", GRADE).eq("section", SECTION);
  await admin.from("teacher_assignments").delete().eq("grade", GRADE).eq("section", SECTION);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Resolved via a live sign-in rather than a profiles.full_name lookup: this
  // shared test environment has accumulated orphaned profiles rows (auth
  // user deleted without a cascaded profile cleanup from earlier interrupted
  // runs) that share the same canonical full_name and make a
  // full_name-keyed .maybeSingle() error on "multiple rows returned".
  const anonForLookup = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const teacherSignIn = await anonForLookup.auth.signInWithPassword({ email: QA_USERS.teacher.email, password: QA_PASSWORD });
  if (teacherSignIn.error || !teacherSignIn.data.user) {
    throw new Error(`QA Reports Teacher sign-in failed — global-setup should have created it: ${teacherSignIn.error?.message}`);
  }
  mainTeacherId = teacherSignIn.data.user.id;

  studentId = crypto.randomUUID();
  const { error: studErr } = await admin.from("students").insert({
    id: studentId,
    full_name: `طالب سجل عمليات ${RUN}`,
    grade: GRADE,
    section: SECTION,
    entry_code: `EAL-${RUN}`,
    national_id: `5${String(RUN).slice(-9)}`,
    status: "active",
  });
  if (studErr) throw new Error(`could not seed test student: ${studErr.message}`);

  const { error: scheduleErr } = await admin.from("class_schedule").insert({
    day_of_week: ACTION_DAY_AR,
    period: LESSON_NUMBER,
    grade: GRADE,
    section: SECTION,
    subject_id: SUBJECT_ID,
    teacher_id: mainTeacherId,
  });
  if (scheduleErr) throw new Error(`could not seed class_schedule row: ${scheduleErr.message}`);

  // class_schedule only covers LESSON_NUMBER (period 2); the double-click test
  // reuses the same section for a different lesson and relies on the
  // teacher_assignments fallback to auto-resolve it too (same pattern as
  // student-actions.spec.ts / notifications.spec.ts).
  const { error: assignErr } = await admin
    .from("teacher_assignments")
    .insert({ teacher_id: mainTeacherId, subject_id: SUBJECT_ID, grade: GRADE, section: SECTION });
  if (assignErr) throw new Error(`could not seed teacher_assignments row: ${assignErr.message}`);
});

test.afterAll(async () => {
  await cleanupAll();
});

test.describe("سجل العمليات — الوصول والصلاحيات", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/audit-log");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("teacher role is redirected away from /audit-log", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/audit-log");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("student role is redirected away from /audit-log", async ({ page }) => {
    await login(page, "student");
    await page.goto("/audit-log");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("old /operations-log route redirects to /audit-log", async ({ page }) => {
    await login(page, "principal");
    await page.goto("/operations-log");
    await page.waitForURL(/\/audit-log$/, { timeout: 15_000 });
  });

  test("principal, admin and vice_principal all have full read access", async ({ page }) => {
    for (const role of ["principal", "admin", "vice_principal"] as const) {
      await page.context().clearCookies();
      await login(page, role);
      await gotoAuditLog(page);
    }
  });

  test("RLS itself blocks a teacher's SELECT on audit_logs (not just the app-level redirect)", async ({}) => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: signInErr } = await anon.auth.signInWithPassword({ email: QA_USERS.teacher.email, password: QA_PASSWORD });
    expect(signInErr).toBeFalsy();
    const { data, error } = await anon.from("audit_logs").select("id").limit(1);
    expect(error).toBeFalsy(); // RLS returns an empty set, not a query error
    expect(data?.length ?? 0).toBe(0);
    await anon.auth.signOut();
  });
});

test.describe("سجل العمليات — الدورة الكاملة: إجراء طالب", () => {
  test("create -> complete: both write distinct audit_logs rows that show up correctly in the page, with old/new values, and persist after logout/login", async ({
    page,
    context,
  }) => {
    const studentName = `طالب سجل عمليات ${RUN}`;

    await test.step("principal creates استدعاء", async () => {
      await login(page, "principal");
      await page.goto("/student-actions");
      await expect(page.getByRole("heading", { name: "استدعاء / استئذان / دخول" })).toBeVisible({ timeout: 15_000 });

      await page.getByPlaceholder("ابحث بالاسم، رقم الهوية، رقم الطالب، الصف أو الشعبة").fill(studentName);
      await expect(page.getByRole("button", { name: new RegExp(studentName) })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: new RegExp(studentName) }).click();
      await page.getByRole("button", { name: "استدعاء طالب" }).click();

      const section = formSection(page);
      await section.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب اختبار سجل العمليات ${RUN}`);
      await section.locator('input[type="date"]').fill(ACTION_DATE);
      await section.locator('input[type="time"]').fill("09:00");
      await section.locator("select").first().selectOption({ label: LESSON_NAME });
      await expect(section.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
      await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data } = await admin.from("student_actions").select("id").eq("student_id", studentId).eq("type", "summon").maybeSingle();
      expect(data?.id).toBeTruthy();
    });

    await test.step("'إنشاء إجراء طالب' appears in /audit-log with correct actor/date and new_values", async () => {
      await gotoAuditLog(page);
      await page.getByPlaceholder("بحث بالاسم أو الوصف أو نوع العملية").fill(studentName);
      const row = logRow(page, "إنشاء إجراء طالب");
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row.getByText(QA_USERS.principal.fullName)).toBeVisible();

      // The expanded detail panel is a nested block on mobile cards but a
      // sibling <tr> on the desktop table, so check it page-wide rather than
      // scoped to `row` — either layout, this is unambiguous once expanded.
      await row.getByRole("button", { name: "عرض التفاصيل" }).click();
      await expect(visibleText(page, "اسم الطالب")).toBeVisible();
      // studentName also legitimately appears in the row's own truncated `details`
      // summary — .last() picks the diff-table occurrence (DOM order: row, then panel).
      await expect(visibleText(page, studentName).last()).toBeVisible();
    });

    await test.step("teacher completes it from /notifications", async () => {
      await context.clearCookies();
      await login(page, "teacher");
      await page.goto("/notifications");
      const card = page.locator("article", { hasText: studentName });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByRole("button", { name: "تم التنفيذ" }).click();
      await expect(page.getByText("تم تنفيذ الطلب بنجاح.")).toBeVisible({ timeout: 15_000 });
    });

    await test.step("'تنفيذ إجراء طالب' appears in /audit-log attributed to the teacher, filterable by action + entity type", async () => {
      await context.clearCookies();
      await login(page, "principal");
      await gotoAuditLog(page);
      await page.getByPlaceholder("بحث بالاسم أو الوصف أو نوع العملية").fill(studentName);

      const actionSelect = page.locator("section").filter({ has: page.getByText("فلاتر") }).locator("select").first();
      await actionSelect.selectOption("تنفيذ إجراء طالب");
      const row = logRow(page, "تنفيذ إجراء طالب");
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row.getByText(QA_USERS.teacher.fullName)).toBeVisible();

      const entitySelect = page.locator("section").filter({ has: page.getByText("فلاتر") }).locator("select").nth(1);
      await entitySelect.selectOption("student_action");
      await expect(row).toBeVisible({ timeout: 15_000 });
    });

    await test.step("both rows persist after a real logout/login cycle", async () => {
      await context.clearCookies();
      await login(page, "principal");
      await gotoAuditLog(page);
      await page.getByPlaceholder("بحث بالاسم أو الوصف أو نوع العملية").fill(studentName);
      await expect(logRow(page, "إنشاء إجراء طالب")).toBeVisible({ timeout: 15_000 });
      await expect(logRow(page, "تنفيذ إجراء طالب")).toBeVisible({ timeout: 15_000 });
    });
  });

  test("rapid double-click on تم التنفيذ does not duplicate the audit_logs row", async ({ page }) => {
    const studentName = `طالب سجل عمليات ${RUN}`;

    await test.step("principal creates a second استدعاء", async () => {
      await login(page, "principal");
      await page.goto("/student-actions");
      await expect(page.getByRole("heading", { name: "استدعاء / استئذان / دخول" })).toBeVisible({ timeout: 15_000 });
      await page.getByPlaceholder("ابحث بالاسم، رقم الهوية، رقم الطالب، الصف أو الشعبة").fill(studentName);
      await page.getByRole("button", { name: new RegExp(studentName) }).click();
      await page.getByRole("button", { name: "استدعاء طالب" }).click();

      const section = formSection(page);
      await section.getByPlaceholder("اكتب سبب الإجراء").fill(`منع تكرار ${RUN}`);
      await section.locator('input[type="date"]').fill(ACTION_DATE);
      await section.locator('input[type="time"]').fill("13:00");
      await section.locator("select").first().selectOption({ label: "الحصة السادسة" });
      await expect(section.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
      await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });
    });

    let secondActionId: string;
    await test.step("teacher double-clicks تم التنفيذ rapidly", async () => {
      await page.context().clearCookies();
      await login(page, "teacher");
      await page.goto("/notifications");
      // Newest-first order: the earlier (test 7) summon request for this same
      // student is already completed by now and has no button, so .first()
      // (not .last()) is the one still pending.
      const card = page.locator("article", { hasText: studentName }).filter({ hasText: "استدعاء" }).first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByRole("button", { name: "تم التنفيذ" })).toBeVisible({ timeout: 15_000 });

      const button = card.getByRole("button", { name: "تم التنفيذ" });
      // dispatchEvent bypasses Playwright's actionability retry/stability loop
      // (which otherwise fights with the button's own disabled-while-busy state
      // and can hang) — it fires both click events near-simultaneously, which is
      // what actually simulates a double-click race.
      await Promise.all([button.dispatchEvent("click"), button.dispatchEvent("click")]);
      await expect(page.getByText("تم تنفيذ الطلب بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data } = await admin
        .from("student_actions")
        .select("id")
        .eq("student_id", studentId)
        .eq("type", "summon")
        .eq("lesson", "الحصة السادسة")
        .maybeSingle();
      expect(data?.id).toBeTruthy();
      secondActionId = data!.id;
    });

    await test.step("exactly one 'تنفيذ إجراء طالب' row exists for this action", async () => {
      const { data } = await admin
        .from("audit_logs")
        .select("id")
        .eq("student_action_id", secondActionId!)
        .eq("action", "تنفيذ إجراء طالب");
      expect(data?.length).toBe(1);
    });
  });
});

test.describe("سجل العمليات — التكامل مع إدارة الطلاب واستيراد نور", () => {
  test("a real 'إضافة طالب جديد' event from /students shows up correctly in /audit-log", async ({ page }) => {
    const newName = `طالب سجل عمليات جديد ${RUN}`;
    const newNationalId = `4${String(RUN).slice(-9)}`;

    await test.step("principal adds a student from /students", async () => {
      await login(page, "principal");
      await page.goto("/students");
      await expect(page.getByRole("heading", { name: "إدارة الطلاب" })).toBeVisible({ timeout: 15_000 });

      await page.getByPlaceholder("مثال: طلال الجهني").fill(newName);
      await page.locator("select").first().selectOption(GRADE);
      await page.getByPlaceholder("مثال: أ").fill(`${SECTION}-B`);
      await page.getByPlaceholder("مثال: 1234").fill(`ENEW-${RUN}`);
      await page.getByPlaceholder("رقم الهوية الوطنية").fill(newNationalId);
      await page.getByRole("button", { name: "إضافة الطالب" }).click();
      await expect(page.getByText("تمت إضافة الطالب بنجاح.")).toBeVisible({ timeout: 10_000 });
    });

    await test.step("it appears in /audit-log with the new student's data in 'القيمة'", async () => {
      await gotoAuditLog(page);
      await page.getByPlaceholder("بحث بالاسم أو الوصف أو نوع العملية").fill(newName);
      // .first(): newest-first order, so this is today's fresh row even if an
      // uncleaned row from an earlier interrupted run also matches the search.
      const row = logRow(page, "إضافة طالب جديد").first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row.getByText(newName)).toBeVisible(); // already in the row's own `details` text
      await row.getByRole("button", { name: "عرض التفاصيل" }).click();
      await expect(visibleText(page, newName).last()).toBeVisible();
    });

    const { data } = await admin.from("students").select("id").eq("national_id", newNationalId).maybeSingle();
    if (data?.id) {
      await admin.from("audit_logs").delete().eq("student_id", data.id);
      await admin.from("students").delete().eq("id", data.id);
    }
  });

  test("a synthetic 'استيراد بيانات نور' row (matching the real /api/noor-import shape proven by noor-import.spec.ts) is filterable under the 'نظام' entity type", async ({
    page,
  }) => {
    const { data: inserted, error } = await admin
      .from("audit_logs")
      .insert({
        actor_id: null,
        actor_name: QA_USERS.principal.fullName,
        actor_role: "principal",
        action: "استيراد بيانات نور",
        details: `الملف: noor-${RUN}.xlsx — إضافة: 3، تحديث: 1، تجاوز: 0، مرفوض: 0`,
        new_values: { inserted: 3, updated: 1, skipped: 0, rejected: 0 },
      })
      .select("id")
      .single();
    expect(error).toBeFalsy();
    syntheticIds.push(inserted!.id);

    await login(page, "principal");
    await gotoAuditLog(page);
    await page.getByPlaceholder("بحث بالاسم أو الوصف أو نوع العملية").fill(`noor-${RUN}`);
    const row = logRow(page, "استيراد بيانات نور");
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("نظام")).toBeVisible();

    await row.getByRole("button", { name: "عرض التفاصيل" }).click();
    await expect(visibleText(page, "تمت إضافتهم")).toBeVisible();
  });
});

test.describe("سجل العمليات — الحماية من Append-only ومنع التلاعب", () => {
  test("an authenticated manager cannot UPDATE or DELETE an existing audit_logs row (RLS has no such policy)", async ({}) => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: signInErr } = await anon.auth.signInWithPassword({ email: QA_USERS.principal.email, password: QA_PASSWORD });
    expect(signInErr).toBeFalsy();

    const { data: existing } = await admin.from("audit_logs").select("id, details").ilike("details", `%${RUN}%`).limit(1).maybeSingle();
    expect(existing?.id).toBeTruthy();

    const { data: updateResult, error: updateErr } = await anon
      .from("audit_logs")
      .update({ details: "تم العبث بالسجل" })
      .eq("id", existing!.id)
      .select();
    // No UPDATE policy exists -> RLS silently matches zero rows (PostgREST
    // returns success with an empty array), it does not error.
    expect(updateErr).toBeFalsy();
    expect(updateResult?.length ?? 0).toBe(0);

    const { data: deleteResult, error: deleteErr } = await anon.from("audit_logs").delete().eq("id", existing!.id).select();
    expect(deleteErr).toBeFalsy();
    expect(deleteResult?.length ?? 0).toBe(0);

    const { data: stillThere } = await admin.from("audit_logs").select("details").eq("id", existing!.id).maybeSingle();
    expect(stillThere?.details).toBe(existing!.details);

    await anon.auth.signOut();
  });

  test("INSERT is always self-attributed — a client cannot forge actor_id for another user", async ({}) => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({ email: QA_USERS.principal.email, password: QA_PASSWORD });
    expect(signInErr).toBeFalsy();
    const realId = signInData.user!.id;

    const { data, error } = await anon
      .from("audit_logs")
      .insert({
        actor_id: mainTeacherId, // forged — not the signed-in user
        actor_name: "منتحل",
        actor_role: "principal",
        action: `محاولة انتحال ${RUN}`,
        details: "test",
      })
      .select();

    expect(data?.length ?? 0).toBe(0); // WITH CHECK (actor_id = auth.uid()) rejects the row
    expect(error).toBeTruthy();

    await anon.auth.signOut();
    void realId;
  });
});

test.describe("سجل العمليات — تصدير CSV وحماية Formula Injection", () => {
  test("export sanitizes a cell starting with '=' so it can't execute as a formula in Excel", async ({ page }) => {
    const marker = `csvtest-${RUN}`;
    const { data: inserted, error } = await admin
      .from("audit_logs")
      .insert({
        actor_id: null,
        actor_name: `=cmd|'/c calc'!A1 ${marker}`,
        actor_role: "principal",
        action: `عملية اختبار ${marker}`,
        details: `تفاصيل ${marker}`,
      })
      .select("id")
      .single();
    expect(error).toBeFalsy();
    syntheticIds.push(inserted!.id);

    await login(page, "principal");
    await gotoAuditLog(page);
    await page.getByPlaceholder("بحث بالاسم أو الوصف أو نوع العملية").fill(marker);
    await expect(logRow(page, marker)).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير CSV" }).click();
    const download = await downloadPromise;
    const csvPath = await download.path();
    expect(csvPath).toBeTruthy();

    const fs = await import("fs");
    const content = fs.readFileSync(csvPath!, "utf-8");
    expect(content).toContain(marker);
    // The malicious cell must be neutralized with a leading safety character —
    // never appear as a raw formula starting with =, +, -, or @.
    expect(content).not.toMatch(/,"=cmd/);
    expect(content).toContain("'=cmd");
  });
});

test.describe("سجل العمليات — الجوال وConsole/Network", () => {
  test("no horizontal overflow on a mobile viewport", async ({ page }) => {
    await login(page, "principal");
    await gotoAuditLog(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("no console errors, uncaught exceptions, or unexpected 4xx/5xx while loading and filtering", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => {
      if (req.failure()?.errorText !== "net::ERR_ABORTED") {
        failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    await login(page, "principal");
    await gotoAuditLog(page);
    await page.waitForTimeout(500);
    await page.getByPlaceholder("بحث بالاسم أو الوصف أو نوع العملية").fill(RUN.toString());
    await page.waitForTimeout(500);

    const ownConsoleErrors = consoleErrors.filter((e) => !e.includes("getCurrentUser") && !e.includes("loadSession"));

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(ownConsoleErrors, `Unexpected console errors: ${ownConsoleErrors.join(" | ")}`).toEqual([]);
    expect(failedRequests, `Unexpected failed/erroring network requests: ${failedRequests.join(" | ")}`).toEqual([]);
  });
});

test.describe("سجل العمليات — فلاتر، بحث، وترقيم صفحات", () => {
  test("date-range filter and pagination controls work against Supabase", async ({ page }) => {
    await login(page, "principal");
    await gotoAuditLog(page);
    await expect(page.getByText(/صفحة \d+ من \d+/)).toBeVisible({ timeout: 15_000 });

    const today = ACTION_DATE;
    const filterSection = page.locator("section").filter({ has: page.getByText("فلاتر") });
    const dateInputs = filterSection.locator('input[type="date"]');
    await dateInputs.first().fill(today);
    await dateInputs.nth(1).fill(today);
    await expect(page.getByText(/صفحة \d+ من \d+/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "إعادة تعيين الفلاتر" }).click();
    await expect(dateInputs.first()).toHaveValue("");
  });
});
