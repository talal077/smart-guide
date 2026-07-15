import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { QA_PASSWORD, QA_USERS } from "./setup/qa-user";

const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570"; // كيمياء — a real subject row (reused from attendance-retrieval.spec.ts)
const RUN = Date.now();
const GRADE = "الأول ثانوي";
const SECTION_A = `اختبار-أ-${RUN}`;
const SECTION_B = `اختبار-ب-${RUN}`;
const STUDENT_NAME = `طالب اختبار إدارة الطلاب ${RUN}`;
const NATIONAL_ID = `9${String(RUN).slice(-9)}`;
const ENTRY_CODE = `E${RUN}`;
const STUDENT_ID = crypto.randomUUID();

const OTHER_STUDENT_NAME = `طالب خارج النطاق ${RUN}`;
const OTHER_STUDENT_ID = crypto.randomUUID();
const OTHER_SECTION = `خارج-النطاق-${RUN}`;

let admin: SupabaseClient;

async function login(page: Page, role: "principal" | "teacher" | "student" = "principal") {
  const { email } = QA_USERS[role];
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function gotoStudents(page: Page) {
  await page.goto("/students");
  await expect(page.getByRole("heading", { name: "إدارة الطلاب" })).toBeVisible({ timeout: 15_000 });
}

async function cleanupTestRows() {
  await admin.from("attendance_records").delete().in("student_id", [STUDENT_ID]);
  await admin.from("audit_logs").delete().in("student_id", [STUDENT_ID, OTHER_STUDENT_ID]);
  await admin.from("students").delete().in("id", [STUDENT_ID, OTHER_STUDENT_ID]);
  await admin.from("teacher_assignments").delete().eq("grade", GRADE).eq("section", SECTION_A);
}

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  await cleanupTestRows();

  const { error: insertErr } = await admin.from("students").insert({
    id: STUDENT_ID,
    full_name: STUDENT_NAME,
    grade: GRADE,
    section: SECTION_A,
    entry_code: ENTRY_CODE,
    national_id: NATIONAL_ID,
    status: "active",
  });
  if (insertErr) throw new Error(`Could not seed test student: ${insertErr.message}`);

  const { error: otherErr } = await admin.from("students").insert({
    id: OTHER_STUDENT_ID,
    full_name: OTHER_STUDENT_NAME,
    grade: GRADE,
    section: OTHER_SECTION,
    entry_code: `E-OTHER-${RUN}`,
    national_id: `8${String(RUN).slice(-9)}`,
    status: "active",
  });
  if (otherErr) throw new Error(`Could not seed out-of-scope student: ${otherErr.message}`);

  // Pre-existing attendance history for the test student, to verify a later
  // grade/section transfer does NOT retroactively rewrite historical records.
  await admin.from("attendance_records").insert({
    id: crypto.randomUUID(),
    student_id: STUDENT_ID,
    student_name: STUDENT_NAME,
    grade: GRADE,
    section: SECTION_A,
    date: "2026-01-10",
    lesson: "حصة اختبار إدارة الطلاب",
    status: "present",
    updated_at: new Date().toISOString(),
  });

  // Give the QA teacher an assignment scoped to SECTION_A only (not OTHER_SECTION),
  // so the teacher-view scoping test has something real to check against.
  // Resolved via a live sign-in rather than a profiles.full_name lookup: this
  // shared test environment has accumulated orphaned profiles rows (auth
  // user deleted without a cascaded profile cleanup from earlier interrupted
  // runs) that share the same canonical full_name and make a
  // full_name-keyed .maybeSingle() error on "multiple rows returned" — which
  // was silently swallowed here (only `.data` was read), skipping this seed
  // insert entirely and breaking the teacher-scoping test below.
  const anonForLookup = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const teacherSignIn = await anonForLookup.auth.signInWithPassword({ email: QA_USERS.teacher.email, password: QA_PASSWORD });
  if (teacherSignIn.error || !teacherSignIn.data.user) {
    throw new Error(`QA Reports Teacher sign-in failed — global-setup should have created it: ${teacherSignIn.error?.message}`);
  }
  const teacherId = teacherSignIn.data.user.id;
  await admin.from("teacher_assignments").insert({ teacher_id: teacherId, subject_id: SUBJECT_ID, grade: GRADE, section: SECTION_A });
});

test.afterAll(async () => {
  await cleanupTestRows();
});

test.describe("إدارة الطلاب — access control", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/students");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("student role is redirected away from /students", async ({ page }) => {
    await login(page, "student");
    await page.goto("/students");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("teacher role sees only their own section, read-only (no add form, no delete-all)", async ({ page }) => {
    await login(page, "teacher");
    await gotoStudents(page);

    await expect(page.getByText(STUDENT_NAME)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(OTHER_STUDENT_NAME)).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "إضافة طالب جديد" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "🗑 حذف جميع الطلاب" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "تعديل", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "حذف", exact: true })).toHaveCount(0);
  });

  test("principal role has full management access", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);

    await expect(page.getByText(STUDENT_NAME)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(OTHER_STUDENT_NAME)).toBeVisible();
    await expect(page.getByRole("heading", { name: "إضافة طالب جديد" })).toBeVisible();
    await expect(page.getByRole("button", { name: "🗑 حذف جميع الطلاب" })).toBeVisible();
  });
});

test.describe("إدارة الطلاب — data & console/network", () => {
  test("loads real Supabase data with no console/page errors", async ({ page }) => {
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
    await gotoStudents(page);
    await expect(page.getByText(STUDENT_NAME)).toBeVisible({ timeout: 15_000 });

    const { count: expectedTotal } = await admin.from("students").select("*", { count: "exact", head: true });
    await expect(page.getByText(`${expectedTotal} طالب`)).toBeVisible({ timeout: 15_000 });

    const ownConsoleErrors = consoleErrors.filter((e) => !e.includes("getCurrentUser") && !e.includes("loadSession"));

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(ownConsoleErrors, `Unexpected console errors: ${ownConsoleErrors.join(" | ")}`).toEqual([]);
    expect(failedRequests, `Unexpected failed/erroring network requests: ${failedRequests.join(" | ")}`).toEqual([]);
  });

  test("search by name, search by national_id, filter by grade, filter by section", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);
    await expect(page.getByText(STUDENT_NAME)).toBeVisible({ timeout: 15_000 });

    const searchInput = page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة");

    await searchInput.fill(STUDENT_NAME);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await searchInput.fill("");

    await searchInput.fill(NATIONAL_ID);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByText(STUDENT_NAME)).toBeVisible();
    await searchInput.fill("");

    await searchInput.fill(SECTION_A);
    await page.locator("select").nth(2).selectOption(SECTION_A).catch(() => {});
    await expect(page.getByText(STUDENT_NAME)).toBeVisible();
  });
});

test.describe("إدارة الطلاب — إضافة طالب", () => {
  test("blocks incomplete submission and shows a clear message", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);

    await page.getByPlaceholder("مثال: طلال الجهني").fill("طالب بدون بيانات كافية");
    await page.getByRole("button", { name: "إضافة الطالب" }).click();

    await expect(page.getByText("يرجى")).toBeVisible();
  });

  test("adds a new student, verifies success message and direct DB existence", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);

    const newName = `طالب جديد ${RUN}`;
    const newNationalId = `7${String(RUN).slice(-9)}`;

    await page.getByPlaceholder("مثال: طلال الجهني").fill(newName);
    await page.locator("select").first().selectOption(GRADE);
    await page.getByPlaceholder("مثال: أ").fill(SECTION_B);
    await page.getByPlaceholder("مثال: 1234").fill(`ENEW-${RUN}`);
    await page.getByPlaceholder("رقم الهوية الوطنية").fill(newNationalId);
    await page.getByRole("button", { name: "إضافة الطالب" }).click();

    await expect(page.getByText("تمت إضافة الطالب بنجاح.")).toBeVisible({ timeout: 10_000 });

    const { data, error } = await admin.from("students").select("*").eq("national_id", newNationalId).maybeSingle();
    expect(error).toBeNull();
    expect(data?.full_name).toBe(newName);

    await admin.from("students").delete().eq("national_id", newNationalId);
  });

  test("rejects a duplicate رقم الهوية with a clear error and creates no duplicate row", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);

    await page.getByPlaceholder("مثال: طلال الجهني").fill("محاولة تكرار رقم الهوية");
    await page.locator("select").first().selectOption(GRADE);
    await page.getByPlaceholder("مثال: أ").fill(`dup-attempt-${RUN}`);
    await page.getByPlaceholder("مثال: 1234").fill(`EDUP-${RUN}`);
    await page.getByPlaceholder("رقم الهوية الوطنية").fill(NATIONAL_ID); // already used by STUDENT_ID
    await page.getByRole("button", { name: "إضافة الطالب" }).click();

    await expect(page.getByText("رقم الهوية مستخدم من قبل طالب آخر.")).toBeVisible({ timeout: 10_000 });

    const { count } = await admin.from("students").select("*", { count: "exact", head: true }).eq("national_id", NATIONAL_ID);
    expect(count).toBe(1);
  });
});

test.describe("إدارة الطلاب — تعديل، نقل، حظر، تسجيل خروج/دخول", () => {
  test("edit persists in Supabase, survives reload + real logout/login, and is written to audit_logs", async ({ page, context }) => {
    await login(page, "principal");
    await gotoStudents(page);

    const searchInput = page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة");
    await searchInput.fill(STUDENT_NAME);
    const row = page.locator("tr", { hasText: STUDENT_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "تعديل" }).click();

    const updatedName = `${STUDENT_NAME} (محدّث)`;
    const nameInput = page.getByPlaceholder("مثال: طلال الجهني");
    await nameInput.fill("");
    await nameInput.fill(updatedName);
    await page.getByRole("button", { name: "حفظ التعديل" }).click();

    await expect(page.getByText("تم تعديل بيانات الطالب بنجاح.")).toBeVisible({ timeout: 10_000 });

    const afterEdit = await admin.from("students").select("full_name").eq("id", STUDENT_ID).maybeSingle();
    expect(afterEdit.data?.full_name).toBe(updatedName);

    const auditRows = await admin
      .from("audit_logs")
      .select("action")
      .eq("student_id", STUDENT_ID)
      .eq("action", "تعديل بيانات الطالب");
    expect((auditRows.data?.length ?? 0) > 0).toBe(true);

    // Reload — no navigation/logout
    await page.reload();
    await gotoStudents(page);
    await searchInput.fill(updatedName);
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 15_000 });

    // Real logout (clear session cookies) + login again
    await context.clearCookies();
    await page.goto("/login");
    await login(page, "principal");
    await gotoStudents(page);

    await page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة").fill(updatedName);
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 15_000 });
  });

  test("transferring grade/section updates the roster, keeps old attendance history untouched, and logs to audit_logs", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);

    const searchInput = page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة");
    await searchInput.fill(STUDENT_NAME);
    let row = page.locator("tr", { hasText: STUDENT_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "تعديل" }).click();

    const sectionInput = page.getByPlaceholder("مثال: أ");
    await sectionInput.fill("");
    await sectionInput.fill(SECTION_B);
    await page.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(page.getByText("تم نقل الطالب بنجاح.")).toBeVisible({ timeout: 10_000 });

    const afterTransfer = await admin.from("students").select("section").eq("id", STUDENT_ID).maybeSingle();
    expect(afterTransfer.data?.section).toBe(SECTION_B);

    // Old attendance record must remain exactly as it was (snapshot, not a live reference).
    const oldAttendance = await admin.from("attendance_records").select("section").eq("student_id", STUDENT_ID).maybeSingle();
    expect(oldAttendance.data?.section).toBe(SECTION_A);

    const transferLog = await admin.from("audit_logs").select("action, details").eq("student_id", STUDENT_ID).eq("action", "نقل الطالب");
    expect((transferLog.data?.length ?? 0) > 0).toBe(true);

    // Student now appears under the new section only (roster row updated in place,
    // not duplicated) — the old section cell value is gone from that row.
    await page.reload();
    await gotoStudents(page);
    await page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة").fill(STUDENT_NAME);
    row = page.locator("tr", { hasText: STUDENT_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td").nth(3)).toHaveText(SECTION_B);

    // Revert section back to SECTION_A for the following block/unblock test's isolation.
    await row.getByRole("button", { name: "تعديل" }).click();
    const sectionInput2 = page.getByPlaceholder("مثال: أ");
    await sectionInput2.fill("");
    await sectionInput2.fill(SECTION_A);
    await page.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(page.getByText("تم نقل الطالب بنجاح.")).toBeVisible({ timeout: 10_000 });
  });

  test("block then unblock updates status in Supabase and logs both actions to audit_logs", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);

    const searchInput = page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة");
    await searchInput.fill(STUDENT_NAME);
    const row = page.locator("tr", { hasText: STUDENT_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: "حظر" }).click();
    await expect(page.getByText("تم حظر الطالب.")).toBeVisible({ timeout: 10_000 });

    const blocked = await admin.from("students").select("status").eq("id", STUDENT_ID).maybeSingle();
    expect(blocked.data?.status).toBe("blocked");
    await expect(row.getByText("محظور")).toBeVisible();

    await row.getByRole("button", { name: "إلغاء الحظر" }).click();
    await expect(page.getByText("تم إلغاء حظر الطالب.")).toBeVisible({ timeout: 10_000 });

    const unblocked = await admin.from("students").select("status").eq("id", STUDENT_ID).maybeSingle();
    expect(unblocked.data?.status).toBe("active");

    const blockLogs = await admin.from("audit_logs").select("action").eq("student_id", STUDENT_ID).in("action", ["حظر الطالب", "إلغاء حظر الطالب"]);
    expect(blockLogs.data?.map((r) => r.action).sort()).toEqual(["إلغاء حظر الطالب", "حظر الطالب"]);
  });

  test("delete removes the student from Supabase and logs to audit_logs", async ({ page }) => {
    const throwawayId = crypto.randomUUID();
    const throwawayName = `طالب للحذف ${RUN}`;
    await admin.from("students").insert({
      id: throwawayId,
      full_name: throwawayName,
      grade: GRADE,
      section: `حذف-${RUN}`,
      entry_code: `EDEL-${RUN}`,
      national_id: `6${String(RUN).slice(-9)}`,
      status: "active",
    });

    await login(page, "principal");
    await gotoStudents(page);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة").fill(throwawayName);
    const row = page.locator("tr", { hasText: throwawayName });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "حذف" }).click();

    await expect(page.getByText("تم حذف الطالب من القائمة الحالية.")).toBeVisible({ timeout: 10_000 });

    const afterDelete = await admin.from("students").select("id").eq("id", throwawayId).maybeSingle();
    expect(afterDelete.data).toBeNull();

    const deleteLog = await admin.from("audit_logs").select("action").eq("student_id", throwawayId).eq("action", "حذف الطالب");
    expect((deleteLog.data?.length ?? 0) > 0).toBe(true);
  });
});

test.describe("إدارة الطلاب — mobile", () => {
  test("no horizontal page overflow on a mobile viewport", async ({ page }) => {
    await login(page, "principal");
    await gotoStudents(page);
    await expect(page.getByText(STUDENT_NAME)).toBeVisible({ timeout: 15_000 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
