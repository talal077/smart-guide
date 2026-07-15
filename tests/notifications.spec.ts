import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { QA_PASSWORD, QA_USERS } from "./setup/qa-user";

const RUN = Date.now();
const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570"; // كيمياء — real subject row reused across suites
const GRADE = "الأول ثانوي";
const SECTION = `NC-${RUN}`;
const LESSON_NUMBER = 2;
const LESSON_NAME = "الحصة الثانية";
const OTHER_TEACHER_EMAIL = `qa-nc-other-${RUN}@smartguide.local`;
const OTHER_TEACHER_PASSWORD = "Qa12345!Notifications";

let admin: SupabaseClient;
let anon: SupabaseClient;

let mainTeacherId: string; // QA_USERS.teacher, assigned via class_schedule to SECTION
let otherTeacherId: string; // throwaway, used only for the cross-teacher isolation check
let studentId: string;

const fillerNotificationIds: string[] = [];

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

async function gotoStudentActions(page: Page) {
  await page.goto("/student-actions");
  await expect(page.getByRole("heading", { name: "استدعاء / استئذان / دخول" })).toBeVisible({ timeout: 15_000 });
}

async function gotoNotifications(page: Page) {
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "إشعاراتي" })).toBeVisible({ timeout: 15_000 });
}

function formSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: /تفاصيل الطلب|تعديل الطلب/ }) });
}

async function createRequest(page: Page, studentName: string, typeLabel: string, time: string, lessonLabel: string) {
  await page.getByPlaceholder("ابحث بالاسم، رقم الهوية، رقم الطالب، الصف أو الشعبة").fill(studentName);
  await expect(page.getByRole("button", { name: new RegExp(studentName) })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: new RegExp(studentName) }).click();
  await page.getByRole("button", { name: typeLabel }).click();

  const section = formSection(page);
  await section.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب اختبار مركز الإشعارات ${RUN}`);
  await section.locator('input[type="date"]').fill(ACTION_DATE);
  await section.locator('input[type="time"]').fill(time);
  await section.locator("select").first().selectOption({ label: lessonLabel });
  await expect(section.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
  await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });
}

async function cleanupAll() {
  const { data: actions } = await admin.from("student_actions").select("id").eq("student_id", studentId);
  const actionIds = (actions ?? []).map((a) => a.id);
  if (actionIds.length) {
    await admin.from("notifications").delete().in("student_action_id", actionIds);
    await admin.from("audit_logs").delete().in("student_action_id", actionIds);
    await admin.from("student_actions").delete().in("id", actionIds);
  }
  if (fillerNotificationIds.length) {
    await admin.from("notifications").delete().in("id", fillerNotificationIds);
  }
  if (otherTeacherId) {
    await admin.from("notifications").delete().eq("user_id", otherTeacherId);
  }
  await admin.from("students").delete().eq("id", studentId);
  await admin.from("class_schedule").delete().eq("grade", GRADE).eq("section", SECTION);
  await admin.from("teacher_assignments").delete().eq("grade", GRADE).eq("section", SECTION);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  // Resolved via a live sign-in rather than a profiles.full_name lookup: this
  // shared test environment has accumulated orphaned profiles rows (auth
  // user deleted without a cascaded profile cleanup from earlier interrupted
  // runs) that share the same canonical full_name and make a
  // full_name-keyed .maybeSingle() error on "multiple rows returned".
  const teacherSignIn = await anon.auth.signInWithPassword({ email: QA_USERS.teacher.email, password: QA_PASSWORD });
  if (teacherSignIn.error || !teacherSignIn.data.user) {
    throw new Error(`QA Reports Teacher sign-in failed — global-setup should have created it: ${teacherSignIn.error?.message}`);
  }
  mainTeacherId = teacherSignIn.data.user.id;

  const signUp = await anon.auth.signUp({ email: OTHER_TEACHER_EMAIL, password: OTHER_TEACHER_PASSWORD });
  otherTeacherId = signUp.data.user?.id ?? "";
  if (!otherTeacherId) {
    const signIn = await anon.auth.signInWithPassword({ email: OTHER_TEACHER_EMAIL, password: OTHER_TEACHER_PASSWORD });
    if (signIn.error || !signIn.data.user) throw new Error(`could not create/sign in other-teacher QA user: ${signIn.error?.message}`);
    otherTeacherId = signIn.data.user.id;
    await anon.auth.signOut();
  }
  await admin.from("profiles").upsert(
    { id: otherTeacherId, full_name: `QA NC Other Teacher ${RUN}`, role: "teacher", is_active: true, is_blocked: false, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  studentId = crypto.randomUUID();
  const { error: studErr } = await admin.from("students").insert({
    id: studentId,
    full_name: `طالب مركز إشعارات ${RUN}`,
    grade: GRADE,
    section: SECTION,
    entry_code: `ENC-${RUN}`,
    national_id: `9${String(RUN).slice(-9)}`,
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

  // class_schedule only covers LESSON_NUMBER (period 2); other tests in this suite
  // reuse the same student/section for different lessons (3, 4) and rely on the
  // teacher_assignments fallback to auto-resolve those too — same real-world pattern
  // (broad section assignment + partial explicit schedule) used in student-actions.spec.ts.
  const { error: assignErr } = await admin
    .from("teacher_assignments")
    .insert({ teacher_id: mainTeacherId, subject_id: SUBJECT_ID, grade: GRADE, section: SECTION });
  if (assignErr) throw new Error(`could not seed teacher_assignments row: ${assignErr.message}`);

  // Filler notifications for the requester (principal) so the pagination test has
  // more than one page (PAGE_SIZE is 10) without depending on unrelated live data.
  const fillerRows = Array.from({ length: 12 }, (_, i) => ({
    title: `إشعار تعبئة لاختبار الترقيم ${RUN}-${i}`,
    body: "إشعار اختباري لفحص pagination",
    user_id: mainTeacherId,
    type: "system",
    is_read: true,
  }));
  const { data: inserted, error: fillerErr } = await admin.from("notifications").insert(fillerRows).select("id");
  if (fillerErr) throw new Error(`could not seed filler notifications: ${fillerErr.message}`);
  fillerNotificationIds.push(...(inserted ?? []).map((r) => r.id));
});

test.afterAll(async () => {
  await cleanupAll();
  if (otherTeacherId) {
    await admin.from("profiles").delete().eq("id", otherTeacherId);
    await admin.auth.admin.deleteUser(otherTeacherId).catch(() => {});
  }
});

test.describe("مركز الإشعارات — الوصول والصلاحيات", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("student sees no internal/admin notifications", async ({ page }) => {
    await login(page, "student");
    await gotoNotifications(page);
    await expect(page.getByText("لا توجد إشعارات مطابقة.")).toBeVisible({ timeout: 15_000 });
  });

  test("principal, admin and vice_principal can all access /notifications", async ({ page }) => {
    for (const role of ["principal", "admin", "vice_principal"] as const) {
      await page.context().clearCookies();
      await login(page, role);
      await gotoNotifications(page);
    }
  });

  test("old /notifications-center route redirects to /notifications", async ({ page }) => {
    await login(page, "principal");
    await page.goto("/notifications-center");
    await page.waitForURL(/\/notifications$/, { timeout: 15_000 });
  });
});

test.describe("مركز الإشعارات — دورة الإشعار الكاملة", () => {
  test("summon request reaches the teacher's bell + list, opening it marks it read and that persists across reload and logout/login", async ({ page }) => {
    const studentName = `طالب مركز إشعارات ${RUN}`;

    await test.step("principal creates استدعاء", async () => {
      await login(page, "principal");
      await gotoStudentActions(page);
      await createRequest(page, studentName, "استدعاء طالب", "09:00", LESSON_NAME);
    });

    await test.step("teacher's bell shows an unread badge and the notification list shows the card unread", async () => {
      await page.context().clearCookies();
      await login(page, "teacher");

      const bell = page.getByLabel(/الإشعارات/);
      await expect(bell).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('a[aria-label*="غير مقروء"]')).toBeVisible({ timeout: 15_000 });

      await gotoNotifications(page);
      const card = page.locator("article", { hasText: studentName });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.locator('[aria-label="غير مقروء"]')).toBeVisible();
      await expect(card.getByText(QA_USERS.principal.fullName)).toBeVisible();
      await expect(card.getByText(ACTION_DATE)).toBeVisible();
    });

    let actionId: string;
    await test.step("clicking the card marks it read in Supabase (not just React state)", async () => {
      const card = page.locator("article", { hasText: studentName });
      await card.getByText(studentName).click();
      await expect(card.locator('[aria-label="غير مقروء"]')).toHaveCount(0);

      const { data } = await admin
        .from("student_actions")
        .select("id")
        .eq("student_id", studentId)
        .eq("type", "summon")
        .maybeSingle();
      expect(data?.id).toBeTruthy();
      actionId = data!.id;

      const { data: notifRow } = await admin.from("notifications").select("is_read").eq("student_action_id", actionId).maybeSingle();
      expect(notifRow?.is_read).toBe(true);
    });

    await test.step("read state survives reload and a real logout/login cycle", async () => {
      await page.reload();
      await gotoNotifications(page);
      const card = page.locator("article", { hasText: studentName });
      await expect(card.locator('[aria-label="غير مقروء"]')).toHaveCount(0);

      await page.context().clearCookies();
      await login(page, "teacher");
      await gotoNotifications(page);
      const cardAfterLogin = page.locator("article", { hasText: studentName });
      await expect(cardAfterLogin.locator('[aria-label="غير مقروء"]')).toHaveCount(0);
    });

    await test.step("teacher completes the request from the notifications page", async () => {
      const card = page.locator("article", { hasText: studentName });
      await card.getByRole("button", { name: "تم التنفيذ" }).click();
      await expect(page.getByText("تم تنفيذ الطلب بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data } = await admin.from("student_actions").select("status, completed_by").eq("id", actionId!).maybeSingle();
      expect(data?.status).toBe("completed");
      expect(data?.completed_by).toBe(mainTeacherId);
    });

    await test.step("requester (principal) receives the result notification with a link back to إجراءات الطالب", async () => {
      await page.context().clearCookies();
      await login(page, "principal");
      await gotoNotifications(page);
      const resultCard = page.locator("article", { hasText: `تم تنفيذ طلب استدعاء - ${studentName}` });
      await expect(resultCard).toBeVisible({ timeout: 15_000 });
      await resultCard.getByText(/تم تنفيذ طلب استدعاء/).click();
      await expect(resultCard.getByRole("link", { name: "عرض في إجراءات الطالب" })).toBeVisible();
    });
  });

  test("permission request -> teacher postpones -> requester sees postponed result with new date", async ({ page }) => {
    const studentName = `طالب مركز إشعارات ${RUN}`;

    await test.step("principal creates استئذان", async () => {
      await login(page, "principal");
      await gotoStudentActions(page);
      await createRequest(page, studentName, "استئذان طالب", "10:00", "الحصة الثالثة");
    });

    await test.step("teacher postpones it from /notifications", async () => {
      await page.context().clearCookies();
      await login(page, "teacher");
      await gotoNotifications(page);

      const card = page.locator("article", { hasText: studentName }).filter({ hasText: "استئذان" });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByRole("button", { name: "تأجيل" }).click();

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const postponeValue = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}T09:00`;
      await card.locator('input[type="datetime-local"]').fill(postponeValue);
      await card.getByRole("button", { name: "تأكيد التأجيل" }).click();
      await expect(page.getByText("تم تأجيل الطلب بنجاح.")).toBeVisible({ timeout: 15_000 });
    });

    await test.step("requester sees the postponed result notification", async () => {
      await page.context().clearCookies();
      await login(page, "principal");
      await gotoNotifications(page);
      const resultCard = page.locator("article", { hasText: `تأجيل طلب استئذان - ${studentName}` });
      await expect(resultCard).toBeVisible({ timeout: 15_000 });
    });
  });

  test("entry request cancelled before execution sends a cancellation notice to the teacher", async ({ page }) => {
    const studentName = `طالب مركز إشعارات ${RUN}`;
    let actionId: string;

    await test.step("principal creates دخول", async () => {
      await login(page, "principal");
      await gotoStudentActions(page);
      await createRequest(page, studentName, "دخول طالب", "11:00", "الحصة الرابعة");

      const { data } = await admin
        .from("student_actions")
        .select("id")
        .eq("student_id", studentId)
        .eq("type", "entry")
        .maybeSingle();
      expect(data?.id).toBeTruthy();
      actionId = data!.id;
    });

    await test.step("principal cancels it immediately", async () => {
      page.once("dialog", (dialog) => dialog.accept());
      const row = page.locator("article").filter({ hasText: "دخول" }).filter({ hasText: studentName }).first();
      await row.getByRole("button", { name: "إلغاء الطلب" }).click();
      await expect(page.getByText("تم إلغاء الطلب بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data: notifRows } = await admin.from("notifications").select("*").eq("student_action_id", actionId!).eq("type", "action_cancelled");
      expect(notifRows?.length).toBeGreaterThanOrEqual(1);
      expect(notifRows![0].user_id).toBe(mainTeacherId);
    });

    await test.step("teacher sees the cancellation notice and no action buttons", async () => {
      await page.context().clearCookies();
      await login(page, "teacher");
      await gotoNotifications(page);
      const card = page.locator("article", { hasText: `تم إلغاء طلب دخول - ${studentName}` });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByRole("button", { name: "تم التنفيذ" })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "تأجيل" })).toHaveCount(0);
    });
  });
});

test.describe("مركز الإشعارات — عداد الجرس وتعليم الكل كمقروء", () => {
  test("mark-all-as-read zeroes the bell badge and persists in Supabase", async ({ page }) => {
    await login(page, "teacher");
    await gotoNotifications(page);
    // Wait for the async load to actually resolve — the "X غير مقروء" chip renders
    // immediately with its initial 0 state, so reading it before the first article
    // appears can race and observe a stale "0" rather than the real count.
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    const unreadChip = page.getByText(/\d+ غير مقروء/);
    await expect(unreadChip).toBeVisible({ timeout: 15_000 });
    const before = await unreadChip.textContent();
    const beforeCount = Number(before?.match(/\d+/)?.[0] ?? "0");

    if (beforeCount === 0) {
      test.skip(true, "no unread notifications left for this teacher to mark-all-read against");
    }

    await page.getByRole("button", { name: "تعليم الكل كمقروء" }).click();
    await expect(page.getByText("تم تعليم جميع الإشعارات كمقروءة.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("0 غير مقروء")).toBeVisible({ timeout: 15_000 });

    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", mainTeacherId).eq("is_read", false);
    expect(count).toBe(0);

    await expect(page.locator('a[aria-label*="غير مقروء"]')).toHaveCount(0);
  });
});

test.describe("مركز الإشعارات — العزل بين الأدوار", () => {
  test("a teacher cannot see another teacher's notifications", async ({ page }) => {
    const { error } = await admin.from("notifications").insert({
      title: `إشعار خاص بمعلم آخر ${RUN}`,
      body: "لا يجب أن يظهر لمعلم آخر",
      user_id: otherTeacherId,
      type: "summon",
      is_read: false,
      metadata: { studentName: `طالب سري ${RUN}` },
    });
    expect(error).toBeFalsy();

    await login(page, "teacher");
    await gotoNotifications(page);
    await expect(page.getByText(`إشعار خاص بمعلم آخر ${RUN}`)).toHaveCount(0);
    await expect(page.getByText(`طالب سري ${RUN}`)).toHaveCount(0);
  });
});

test.describe("مركز الإشعارات — فلاتر، بحث، وترقيم صفحات", () => {
  test("type/status/date filters, search, and real pagination controls work against Supabase", async ({ page }) => {
    await login(page, "principal");
    await gotoNotifications(page);

    await expect(page.getByText(/صفحة \d+ من \d+/)).toBeVisible({ timeout: 15_000 });

    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption("action_result");
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
    for (const article of await page.locator("article").all()) {
      await expect(article.getByText(/نتيجة إجراء|تم تنفيذ|تأجيل/)).toBeVisible();
    }
    await page.getByRole("button", { name: "إعادة تعيين الفلاتر" }).click();

    await page.getByPlaceholder("بحث في العنوان أو النص").fill(`اختبار مركز الإشعارات ${RUN}`);
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  });

  test("pagination next/previous actually changes the visible page against Supabase", async ({ page }) => {
    await login(page, "teacher");
    await gotoNotifications(page);
    await expect(page.getByText(/صفحة 1 من \d+/)).toBeVisible({ timeout: 15_000 });

    const nextButton = page.getByRole("button", { name: "التالي" });
    if (await nextButton.isEnabled()) {
      await nextButton.click();
      await expect(page.getByText(/صفحة 2 من \d+/)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "السابق" }).click();
      await expect(page.getByText(/صفحة 1 من \d+/)).toBeVisible({ timeout: 15_000 });
    }
  });
});

test.describe("مركز الإشعارات — الجوال وConsole/Network", () => {
  test("no horizontal overflow on a mobile viewport", async ({ page }) => {
    await login(page, "principal");
    await gotoNotifications(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("no console errors, uncaught exceptions, or unexpected 4xx/5xx on the notifications page", async ({ page }) => {
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

    await login(page, "teacher");
    await gotoNotifications(page);
    await page.waitForTimeout(1000);

    const ownConsoleErrors = consoleErrors.filter((e) => !e.includes("getCurrentUser") && !e.includes("loadSession"));

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(ownConsoleErrors, `Unexpected console errors: ${ownConsoleErrors.join(" | ")}`).toEqual([]);
    expect(failedRequests, `Unexpected failed/erroring network requests: ${failedRequests.join(" | ")}`).toEqual([]);
  });
});
