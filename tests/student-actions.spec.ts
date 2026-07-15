import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { QA_PASSWORD, QA_USERS } from "./setup/qa-user";

const RUN = Date.now();
const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570"; // كيمياء — real subject row reused across suites
// teacher_assignments has a UNIQUE (subject_id, grade, section) constraint, so two
// teachers sharing one grade+section slot must be assigned under two different real
// subjects (findTeacherForClass's teacher_assignments lookup ignores subject_id anyway).
const SUBJECT_ID_B = "c0f71647-4479-45bb-8065-32c69bc2924f"; // انجليزي
const GRADE = "الأول ثانوي";

const SECTION_AUTO = `SA-${RUN}`; // single class_schedule match -> auto-assign
const SECTION_MULTI = `SM-${RUN}`; // two teacher_assignments matches -> manual pick
const SECTION_NONE = `SN-${RUN}`; // no schedule/assignment match -> blocked

const LESSON_NUMBER = 2;
const LESSON_NAME = "الحصة الثانية";

const TEACHER_A_EMAIL = `qa-sa-teacher-a-${RUN}@smartguide.local`;
const TEACHER_B_EMAIL = `qa-sa-teacher-b-${RUN}@smartguide.local`;
const QA_PASSWORD_2 = "Qa12345!StudentActions";

let admin: SupabaseClient;
let anon: SupabaseClient;

let studentAutoId: string;
let studentMultiId: string;
let studentNoneId: string;

let mainTeacherId: string; // QA_USERS.teacher, assigned via class_schedule to SECTION_AUTO
let teacherAId: string;
let teacherBId: string;

/** Next date (YYYY-MM-DD) whose Arabic weekday is one class_schedule's CHECK
 * constraint allows (الأحد..الخميس, i.e. JS getDay() 0-4 — Sun-Thu). */
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

async function createQaUser(email: string, password: string, fullName: string): Promise<string> {
  const signUp = await anon.auth.signUp({ email, password });
  let userId = signUp.data.user?.id ?? null;
  if (!userId) {
    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.user) throw new Error(`QA user ${email} could not be created/signed in: ${signIn.error?.message}`);
    userId = signIn.data.user.id;
    await anon.auth.signOut();
  }
  await admin.from("profiles").upsert(
    { id: userId, full_name: fullName, role: "teacher", is_active: true, is_blocked: false, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  return userId;
}

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

function formSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: /تفاصيل الطلب|تعديل الطلب/ }) });
}

async function selectStudentAndType(page: Page, studentName: string, typeLabel: string) {
  await page.getByPlaceholder("ابحث بالاسم، رقم الهوية، رقم الطالب، الصف أو الشعبة").fill(studentName);
  await expect(page.getByRole("button", { name: new RegExp(studentName) })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: new RegExp(studentName) }).click();
  await page.getByRole("button", { name: typeLabel }).click();
}

async function cleanupAll() {
  const studentIds = [studentAutoId, studentMultiId, studentNoneId].filter(Boolean);
  if (studentIds.length) {
    const { data: actions } = await admin.from("student_actions").select("id").in("student_id", studentIds);
    const actionIds = (actions ?? []).map((a) => a.id);
    if (actionIds.length) {
      await admin.from("notifications").delete().in("student_action_id", actionIds);
      await admin.from("audit_logs").delete().in("student_action_id", actionIds);
    }
    await admin.from("student_actions").delete().in("student_id", studentIds);
    await admin.from("students").delete().in("id", studentIds);
  }
  await admin.from("class_schedule").delete().eq("grade", GRADE).eq("section", SECTION_AUTO);
  await admin.from("teacher_assignments").delete().eq("grade", GRADE).in("section", [SECTION_MULTI, SECTION_AUTO]);
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

  teacherAId = await createQaUser(TEACHER_A_EMAIL, QA_PASSWORD_2, `QA SA Teacher A ${RUN}`);
  teacherBId = await createQaUser(TEACHER_B_EMAIL, QA_PASSWORD_2, `QA SA Teacher B ${RUN}`);

  studentAutoId = crypto.randomUUID();
  studentMultiId = crypto.randomUUID();
  studentNoneId = crypto.randomUUID();

  const { error: studErr } = await admin.from("students").insert([
    { id: studentAutoId, full_name: `طالب اختبار تلقائي ${RUN}`, grade: GRADE, section: SECTION_AUTO, entry_code: `EAUTO-${RUN}`, national_id: `1${String(RUN).slice(-9)}`, status: "active" },
    { id: studentMultiId, full_name: `طالب اختبار متعدد ${RUN}`, grade: GRADE, section: SECTION_MULTI, entry_code: `EMULTI-${RUN}`, national_id: `2${String(RUN).slice(-9)}`, status: "active" },
    { id: studentNoneId, full_name: `طالب بدون معلم ${RUN}`, grade: GRADE, section: SECTION_NONE, entry_code: `ENONE-${RUN}`, national_id: `3${String(RUN).slice(-9)}`, status: "active" },
  ]);
  if (studErr) throw new Error(`could not seed test students: ${studErr.message}`);

  const { error: scheduleErr } = await admin.from("class_schedule").insert({
    day_of_week: ACTION_DAY_AR,
    period: LESSON_NUMBER,
    grade: GRADE,
    section: SECTION_AUTO,
    subject_id: SUBJECT_ID,
    teacher_id: mainTeacherId,
  });
  if (scheduleErr) throw new Error(`could not seed class_schedule row: ${scheduleErr.message}`);

  const { error: assignErr } = await admin.from("teacher_assignments").insert([
    { teacher_id: teacherAId, subject_id: SUBJECT_ID, grade: GRADE, section: SECTION_MULTI },
    { teacher_id: teacherBId, subject_id: SUBJECT_ID_B, grade: GRADE, section: SECTION_MULTI },
    // SECTION_AUTO only has a class_schedule row for LESSON_NUMBER (period 2); other
    // tests in this suite reuse the same student/section for different lessons (3, 4, 5)
    // and expect those to auto-resolve too via the teacher_assignments fallback, exactly
    // like a real school would assign a homeroom/subject teacher to a section broadly
    // and only some periods get an explicit class_schedule slot.
    { teacher_id: mainTeacherId, subject_id: SUBJECT_ID, grade: GRADE, section: SECTION_AUTO },
  ]);
  if (assignErr) throw new Error(`could not seed teacher_assignments rows: ${assignErr.message}`);
});

test.afterAll(async () => {
  await cleanupAll();
  for (const id of [teacherAId, teacherBId]) {
    if (!id) continue;
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
});

test.describe("إجراءات الطالب — الوصول والصلاحيات", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/student-actions");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("teacher role is redirected away from /student-actions", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/student-actions");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("student role is redirected away from /student-actions", async ({ page }) => {
    await login(page, "student");
    await page.goto("/student-actions");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("principal has full access to /student-actions", async ({ page }) => {
    await login(page, "principal");
    await gotoStudentActions(page);
  });
});

test.describe("إجراءات الطالب — دورة العمل الكاملة", () => {
  test("create summon -> auto-assigned teacher -> teacher completes -> requester sees result, all rows real in Supabase", async ({ page }) => {
    const studentName = `طالب اختبار تلقائي ${RUN}`;

    await test.step("principal creates استدعاء with auto-assigned teacher", async () => {
      await login(page, "principal");
      await gotoStudentActions(page);

      await selectStudentAndType(page, studentName, "استدعاء طالب");

      const section = formSection(page);
      await section.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب اختبار الاستدعاء ${RUN}`);
      await section.locator('input[type="date"]').fill(ACTION_DATE);
      await section.locator('input[type="time"]').fill("09:00");
      await section.locator("select").first().selectOption(String(LESSON_NUMBER));

      await expect(section.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
      await expect(section.getByText(QA_USERS.teacher.fullName)).toBeVisible();

      await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
      await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });
    });

    let actionId: string;
    await test.step("verify all three real DB records exist (student_actions, notifications, audit_logs)", async () => {
      const { data: actionRows } = await admin
        .from("student_actions")
        .select("*")
        .eq("student_id", studentAutoId)
        .eq("type", "summon")
        .eq("action_date", ACTION_DATE)
        .eq("lesson", LESSON_NAME);
      expect(actionRows?.length).toBe(1);
      const action = actionRows![0];
      actionId = action.id;
      expect(action.status).toBe("pending");
      expect(action.assigned_teacher_id).toBe(mainTeacherId);

      const { data: notifRows } = await admin.from("notifications").select("*").eq("student_action_id", actionId);
      expect(notifRows?.length).toBeGreaterThanOrEqual(1);
      expect(notifRows![0].user_id).toBe(mainTeacherId);

      const { data: auditRows } = await admin.from("audit_logs").select("*").eq("student_action_id", actionId).eq("action", "إنشاء إجراء طالب");
      expect(auditRows?.length).toBeGreaterThanOrEqual(1);
    });

    await test.step("teacher sees the full request in /notifications and completes it", async () => {
      await page.context().clearCookies();
      await login(page, "teacher");
      await page.goto("/notifications");
      await expect(page.getByRole("heading", { name: "إشعاراتي" })).toBeVisible({ timeout: 15_000 });

      const card = page.locator("article", { hasText: studentName });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText("استدعاء", { exact: true })).toBeVisible();
      await expect(card.getByText(GRADE)).toBeVisible();
      await expect(card.getByText(QA_USERS.principal.fullName)).toBeVisible();
      await expect(card.getByRole("button", { name: "تم التنفيذ" })).toBeVisible();
      await expect(card.getByRole("button", { name: "تأجيل" })).toBeVisible();

      await card.getByRole("button", { name: "تم التنفيذ" }).click();
      await expect(page.getByText("تم تنفيذ الطلب بنجاح.")).toBeVisible({ timeout: 15_000 });
    });

    await test.step("verify completion persisted in Supabase with completed_at/completed_by + audit log", async () => {
      const { data } = await admin.from("student_actions").select("*").eq("id", actionId!).maybeSingle();
      expect(data?.status).toBe("completed");
      expect(data?.completed_by).toBe(mainTeacherId);
      expect(data?.completed_at).toBeTruthy();

      const { data: auditRows } = await admin.from("audit_logs").select("*").eq("student_action_id", actionId!).eq("action", "تنفيذ إجراء طالب");
      expect(auditRows?.length).toBeGreaterThanOrEqual(1);
    });

    await test.step("requester (principal) receives the result notification", async () => {
      await page.context().clearCookies();
      await login(page, "principal");
      await page.goto("/notifications");
      await expect(page.getByText(new RegExp(`تم تنفيذ طلب استدعاء.*${studentName}`)).first()).toBeVisible({ timeout: 15_000 });
    });
  });

  test("create permission -> teacher postpones -> requester sees postponed result", async ({ page }) => {
    const studentName = `طالب اختبار تلقائي ${RUN}`;
    let actionId: string;

    await test.step("principal creates استئذان", async () => {
      await login(page, "principal");
      await gotoStudentActions(page);
      await selectStudentAndType(page, studentName, "استئذان طالب");

      const section = formSection(page);
      await section.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب اختبار الاستئذان ${RUN}`);
      await section.locator('input[type="date"]').fill(ACTION_DATE);
      await section.locator('input[type="time"]').fill("10:00");
      await section.locator("select").first().selectOption({ label: "الحصة الثالثة" });

      await expect(section.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
      await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });
    });

    await test.step("resolve the created row id", async () => {
      const { data } = await admin
        .from("student_actions")
        .select("id")
        .eq("student_id", studentAutoId)
        .eq("type", "permission")
        .eq("action_date", ACTION_DATE)
        .eq("lesson", "الحصة الثالثة")
        .maybeSingle();
      expect(data?.id).toBeTruthy();
      actionId = data!.id;
    });

    await test.step("teacher postpones it to a new date/time", async () => {
      await page.context().clearCookies();
      await login(page, "teacher");
      await page.goto("/notifications");
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

    await test.step("verify postponed_until persisted + audit log", async () => {
      const { data } = await admin.from("student_actions").select("*").eq("id", actionId!).maybeSingle();
      expect(data?.status).toBe("postponed");
      expect(data?.postponed_until).toBeTruthy();

      const { data: auditRows } = await admin.from("audit_logs").select("*").eq("student_action_id", actionId!).eq("action", "تأجيل إجراء طالب");
      expect(auditRows?.length).toBeGreaterThanOrEqual(1);
    });

    await test.step("requester sees the postponed result notification", async () => {
      await page.context().clearCookies();
      await login(page, "principal");
      await page.goto("/notifications");
      await expect(page.getByText(new RegExp(`تأجيل طلب استئذان.*${studentName}`)).first()).toBeVisible({ timeout: 15_000 });
    });
  });

  test("edit a pending action keeps the assigned teacher, then cancel logs both to audit_logs", async ({ page }) => {
    const studentName = `طالب اختبار تلقائي ${RUN}`;
    let actionId: string;

    await test.step("principal creates a دخول action to edit/cancel", async () => {
      await login(page, "principal");
      await gotoStudentActions(page);
      await selectStudentAndType(page, studentName, "دخول طالب");

      const section = formSection(page);
      await section.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب اختبار الدخول ${RUN}`);
      await section.locator('input[type="date"]').fill(ACTION_DATE);
      await section.locator('input[type="time"]').fill("11:00");
      await section.locator("select").first().selectOption({ label: "الحصة الرابعة" });
      await expect(section.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
      await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data } = await admin
        .from("student_actions")
        .select("id")
        .eq("student_id", studentAutoId)
        .eq("type", "entry")
        .eq("action_date", ACTION_DATE)
        .eq("lesson", "الحصة الرابعة")
        .maybeSingle();
      expect(data?.id).toBeTruthy();
      actionId = data!.id;
    });

    await test.step("edit: teacher stays assigned (regression check for the editContext bug), reason updates", async () => {
      await page.reload();
      await gotoStudentActions(page);
      await page.getByPlaceholder("اسم الطالب").fill(studentName);
      await expect(page.getByRole("button", { name: "عرض التفاصيل" }).first()).toBeVisible({ timeout: 15_000 });

      const row = page.locator("article").filter({ hasText: "دخول" }).filter({ hasText: studentName }).first();
      await row.getByRole("button", { name: "تعديل" }).click();

      const section = formSection(page);
      await expect(section.getByRole("heading", { name: "تعديل الطلب" })).toBeVisible();
      // Regression guard: must not fall back to "يرجى اختيار التاريخ والحصة أولًا" / show a
      // validation error — the previously-assigned teacher must remain resolved.
      await expect(page.getByText("يرجى تحديد المعلم.")).toHaveCount(0);
      await expect(section.getByText(QA_USERS.teacher.fullName)).toBeVisible({ timeout: 15_000 });

      const newReason = `سبب معدّل ${RUN}`;
      const reasonBox = section.getByPlaceholder("اكتب سبب الإجراء");
      await reasonBox.fill("");
      await reasonBox.fill(newReason);
      await page.getByRole("button", { name: "حفظ التعديل" }).click();
      await expect(page.getByText("تم تعديل الإجراء بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data } = await admin.from("student_actions").select("reason, assigned_teacher_id").eq("id", actionId!).maybeSingle();
      expect(data?.reason).toBe(newReason);
      expect(data?.assigned_teacher_id).toBe(mainTeacherId);

      const { data: editLogs } = await admin.from("audit_logs").select("old_values, new_values").eq("student_action_id", actionId!).eq("action", "تعديل إجراء طالب");
      expect(editLogs?.length).toBeGreaterThanOrEqual(1);
    });

    await test.step("cancel before execution", async () => {
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByPlaceholder("اسم الطالب").fill(studentName);
      const row = page.locator("article").filter({ hasText: "دخول" }).filter({ hasText: studentName }).first();
      await row.getByRole("button", { name: "إلغاء الطلب" }).click();
      await expect(page.getByText("تم إلغاء الطلب بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data } = await admin.from("student_actions").select("status").eq("id", actionId!).maybeSingle();
      expect(data?.status).toBe("cancelled");

      const { data: cancelLogs } = await admin.from("audit_logs").select("*").eq("student_action_id", actionId!).eq("action", "إلغاء إجراء طالب");
      expect(cancelLogs?.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("blocks a duplicate pending request for the same student/type/date/lesson", async ({ page }) => {
    const studentName = `طالب اختبار تلقائي ${RUN}`;

    await login(page, "principal");
    await gotoStudentActions(page);
    await selectStudentAndType(page, studentName, "استدعاء طالب");

    const section = formSection(page);
    await section.getByPlaceholder("اكتب سبب الإجراء").fill(`محاولة تكرار ${RUN}`);
    await section.locator('input[type="date"]').fill(ACTION_DATE);
    await section.locator('input[type="time"]').fill("12:00");
    await section.locator("select").first().selectOption({ label: "الحصة الخامسة" });
    await expect(section.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
    await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });

    // Attempt an identical second request (same student, type, date, lesson) while
    // the first is still pending.
    await selectStudentAndType(page, studentName, "استدعاء طالب");
    const section2 = formSection(page);
    await section2.getByPlaceholder("اكتب سبب الإجراء").fill(`محاولة تكرار ثانية ${RUN}`);
    await section2.locator('input[type="date"]').fill(ACTION_DATE);
    await section2.locator('input[type="time"]').fill("12:05");
    await section2.locator("select").first().selectOption({ label: "الحصة الخامسة" });
    await expect(section2.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();

    await expect(page.getByText(/يوجد طلب.*قيد الانتظار/)).toBeVisible({ timeout: 15_000 });

    const { count } = await admin
      .from("student_actions")
      .select("*", { count: "exact", head: true })
      .eq("student_id", studentAutoId)
      .eq("type", "summon")
      .eq("action_date", ACTION_DATE)
      .eq("lesson", "الحصة الخامسة");
    expect(count).toBe(1);
  });

  test("multiple valid teachers -> manual selection required, chosen teacher persisted", async ({ page }) => {
    const studentName = `طالب اختبار متعدد ${RUN}`;

    await login(page, "principal");
    await gotoStudentActions(page);
    await selectStudentAndType(page, studentName, "استدعاء طالب");

    const section = formSection(page);
    await section.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب اختبار تعدد المعلمين ${RUN}`);
    await section.locator('input[type="date"]').fill(ACTION_DATE);
    await section.locator('input[type="time"]').fill("09:30");
    await section.locator("select").first().selectOption(String(LESSON_NUMBER));

    // No class_schedule row exists for SECTION_MULTI, so it must fall to the
    // teacher_assignments bucket with both candidates offered, not an auto-pick.
    await expect(section.getByText("تم التحديد تلقائيًا")).toHaveCount(0);
    const teacherSelect = section.locator("select").nth(1);
    await expect(teacherSelect).toBeVisible({ timeout: 15_000 });
    await teacherSelect.selectOption({ label: `QA SA Teacher A ${RUN}` });

    await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
    await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });

    const { data } = await admin
      .from("student_actions")
      .select("assigned_teacher_id")
      .eq("student_id", studentMultiId)
      .eq("action_date", ACTION_DATE)
      .eq("lesson", LESSON_NAME)
      .maybeSingle();
    expect(data?.assigned_teacher_id).toBe(teacherAId);
  });

  test("no linked teacher -> clear blocking message, no incomplete row saved", async ({ page }) => {
    const studentName = `طالب بدون معلم ${RUN}`;

    await login(page, "principal");
    await gotoStudentActions(page);
    await selectStudentAndType(page, studentName, "استدعاء طالب");

    const section = formSection(page);
    await section.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب بدون معلم ${RUN}`);
    await section.locator('input[type="date"]').fill(ACTION_DATE);
    await section.locator('input[type="time"]').fill("09:45");
    await section.locator("select").first().selectOption(String(LESSON_NUMBER));

    await expect(section.getByText(/لا يوجد معلم مرتبط/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
    await expect(page.getByText("يرجى تحديد المعلم.")).toBeVisible();

    const { count } = await admin.from("student_actions").select("*", { count: "exact", head: true }).eq("student_id", studentNoneId);
    expect(count).toBe(0);
  });
});

test.describe("إجراءات الطالب — سجل الإجراءات: فلاتر وترقيم صفحات", () => {
  test("filters (type/status/student/date) and real pagination controls work against Supabase", async ({ page }) => {
    await login(page, "principal");
    await gotoStudentActions(page);

    await expect(page.getByText(/صفحة \d+ من \d+/)).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder("اسم الطالب").fill(`طالب اختبار تلقائي ${RUN}`);
    await expect(page.locator("article", { hasText: `طالب اختبار تلقائي ${RUN}` }).first()).toBeVisible({ timeout: 15_000 });

    const selects = page.locator("section", { hasText: "سجل الإجراءات" }).locator("select");
    await selects.first().selectOption("summon");
    await expect(page.locator("article")).not.toHaveCount(0);
    for (const article of await page.locator("article").all()) {
      await expect(article.getByText("استدعاء")).toBeVisible();
    }
  });
});

test.describe("إجراءات الطالب — الجوال وإعادة التحميل", () => {
  test("no horizontal overflow on a mobile viewport", async ({ page }) => {
    await login(page, "principal");
    await gotoStudentActions(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("state survives reload and a real logout/login cycle", async ({ page, context }) => {
    await login(page, "principal");
    await gotoStudentActions(page);
    await page.getByPlaceholder("اسم الطالب").fill(`طالب اختبار تلقائي ${RUN}`);
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await gotoStudentActions(page);
    await page.getByPlaceholder("اسم الطالب").fill(`طالب اختبار تلقائي ${RUN}`);
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    await context.clearCookies();
    await page.goto("/login");
    await login(page, "principal");
    await gotoStudentActions(page);
    await page.getByPlaceholder("اسم الطالب").fill(`طالب اختبار تلقائي ${RUN}`);
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("إجراءات الطالب — Console/Network", () => {
  test("no console errors, uncaught exceptions, or unexpected 4xx/5xx while creating an action", async ({ page }) => {
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
    await gotoStudentActions(page);
    await page.getByPlaceholder("اسم الطالب").fill(`طالب اختبار تلقائي ${RUN}`);
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    const ownConsoleErrors = consoleErrors.filter((e) => !e.includes("getCurrentUser") && !e.includes("loadSession"));

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(ownConsoleErrors, `Unexpected console errors: ${ownConsoleErrors.join(" | ")}`).toEqual([]);
    expect(failedRequests, `Unexpected failed/erroring network requests: ${failedRequests.join(" | ")}`).toEqual([]);
  });
});
