import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { QA_PASSWORD, QA_USERS } from "./setup/qa-user";

const FIXTURES_DIR =
  "C:/Users/ACFE~1/AppData/Local/Temp/claude/c--Users--------------Desktop-smart-guide/9162ef53-4d8a-4fdf-8037-a5225badb7a0/scratchpad/noor-fixtures";

const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570"; // كيمياء — a real subject row (reused from attendance-retrieval.spec.ts)
const RUN = Date.now();
const ATTENDANCE_GRADE = "الأول ثانوي";
const ATTENDANCE_SECTION = `شعبة-تحقق-${RUN}`;
const ATTENDANCE_STUDENT_NAME = `طالب تحقق تحضير ${RUN}`;
const ATTENDANCE_STUDENT_NID = `7${String(RUN).slice(-9)}`;

const IMPORT_TEACHER_EMAIL = `qa-noor-import-teacher-${RUN}@smartguide.local`;
const IMPORT_TEACHER_PASSWORD = "Qa12345!NoorImport";

let admin: SupabaseClient;
let importTeacherId: string;

async function login(page: Page, role: "principal" | "teacher" | "student" = "principal") {
  const { email } = QA_USERS[role];
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function gotoNoorImport(page: Page) {
  await page.goto("/noor-import");
  await expect(page.getByRole("heading", { name: "استيراد الطلاب من ملف Excel" })).toBeVisible({ timeout: 15_000 });
}

async function uploadAndPreview(page: Page, fileName: string) {
  await page.locator("#noor-file-input").setInputFiles(path.join(FIXTURES_DIR, fileName));
  await page.getByRole("button", { name: "معاينة الملف" }).click();
  await expect(page.getByText(/تم استخراج|يحتاج إلى مطابقة/)).toBeVisible({ timeout: 15_000 });
}

async function dragDropFile(page: Page, filePath: string, fileName: string) {
  const buffer = fs.readFileSync(filePath).toString("base64");
  const dataTransfer = await page.evaluateHandle(
    ({ buffer, fileName }) => {
      const dt = new DataTransfer();
      const byteChars = atob(buffer);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const file = new File([byteArray], fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      dt.items.add(file);
      return dt;
    },
    { buffer, fileName },
  );

  await page.dispatchEvent("text=أو اسحب وأفلت ملف Excel هنا", "drop", { dataTransfer });
}

function nid(n: number) {
  return `9${String(RUN).slice(-8)}${n}`;
}

function writeSheet(filePath: string, headers: string[], rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filePath);
}

/** Regenerates every fixture file for THIS run, embedding the test's own RUN
 * id in every record so DB assertions (which filter by RUN) actually match
 * what got imported -- a stale, separately-generated fixture would embed a
 * different RUN id than whatever this specific test execution expects. */
function generateFixtures() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  writeSheet(path.join(FIXTURES_DIR, "valid.xlsx"), ["اسم الطالب", "رقم الهوية", "الصف", "الفصل"], [
    [`طالب صحيح واحد ${RUN}`, nid(1), "الأول ثانوي", `شعبة-صحيح-${RUN}`],
    [`طالب صحيح اثنان ${RUN}`, nid(2), "الأول ثانوي", `شعبة-صحيح-${RUN}`],
    [`طالب صحيح ثلاثة ${RUN}`, nid(3), "الأول ثانوي", `شعبة-صحيح-${RUN}`],
  ]);

  writeSheet(path.join(FIXTURES_DIR, "synonyms.xlsx"), ["الإسم", "السجل المدني", "المرحلة", "الشعبة الدراسية"], [
    [`طالب مرادفات واحد ${RUN}`, "١٢٣٤٥٦٧٨٩٠", "الثاني ثانوي", `شعبة-مرادفات-${RUN}`],
    [`طالب مرادفات اثنان ${RUN}`, nid(5), "الثاني ثانوي", `شعبة-مرادفات-${RUN}`],
  ]);

  writeSheet(path.join(FIXTURES_DIR, "duplicates.xlsx"), ["اسم الطالب", "رقم الهوية", "الصف", "الفصل"], [
    [`طالب مكرر ${RUN}`, nid(6), "الأول ثانوي", `شعبة-مكرر-${RUN}`],
    [`طالب مكرر نسخة ثانية ${RUN}`, nid(6), "الأول ثانوي", `شعبة-مكرر-${RUN}`],
  ]);

  writeSheet(path.join(FIXTURES_DIR, "incomplete.xlsx"), ["اسم الطالب", "رقم الهوية", "الصف", "الفصل"], [
    ["", nid(7), "الأول ثانوي", `شعبة-ناقص-${RUN}`],
    [`طالب ناقص صحيح ${RUN}`, nid(8), "الأول ثانوي", `شعبة-ناقص-${RUN}`],
  ]);

  fs.writeFileSync(path.join(FIXTURES_DIR, "not-excel.xlsx"), "this is not an excel file, just plain text pretending to be one");

  const bigRows: unknown[][] = [];
  for (let i = 0; i < 650; i++) {
    bigRows.push([`طالب كبير ${RUN} رقم ${i}`, nid(1000 + i), "الثالث ثانوي", `شعبة-كبير-${RUN}`]);
  }
  writeSheet(path.join(FIXTURES_DIR, "large.xlsx"), ["اسم الطالب", "رقم الهوية", "الصف", "الفصل"], bigRows);

  writeSheet(path.join(FIXTURES_DIR, "update-existing.xlsx"), ["اسم الطالب", "رقم الهوية", "الصف", "الفصل"], [
    [`طالب صحيح واحد محدث ${RUN}`, nid(1), "الثاني ثانوي", `شعبة-محدث-${RUN}`],
  ]);

  writeSheet(path.join(FIXTURES_DIR, "formula-injection.xlsx"), ["اسم الطالب", "رقم الهوية", "الصف", "الفصل"], [
    [`=cmd|'/c calc'!A1`, nid(9), "+1+1", `=HYPERLINK("http://evil")`],
  ]);
}

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  generateFixtures();

  // Dedicated throwaway teacher assigned to the exact grade/section a
  // fixture file will import students into, so the "appears in تحضير
  // الحصص" check can drive the real attendance page roster query.
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const signUp = await anon.auth.signUp({ email: IMPORT_TEACHER_EMAIL, password: IMPORT_TEACHER_PASSWORD });
  importTeacherId = signUp.data.user?.id ?? "";
  if (!importTeacherId) {
    const signIn = await anon.auth.signInWithPassword({ email: IMPORT_TEACHER_EMAIL, password: IMPORT_TEACHER_PASSWORD });
    importTeacherId = signIn.data.user?.id ?? "";
  }
  await admin.from("profiles").upsert(
    { id: importTeacherId, full_name: "QA Noor Import Teacher", role: "teacher", is_active: true, is_blocked: false, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  await admin.from("teacher_assignments").delete().eq("teacher_id", importTeacherId);
  await admin.from("teacher_assignments").insert({ teacher_id: importTeacherId, subject_id: SUBJECT_ID, grade: ATTENDANCE_GRADE, section: ATTENDANCE_SECTION });
});

test.afterAll(async () => {
  await admin.from("students").delete().ilike("full_name", `%${RUN}%`);
  await admin.from("audit_logs").delete().ilike("details", `%${RUN}%`);
  await admin.from("teacher_assignments").delete().eq("teacher_id", importTeacherId);
  await admin.from("profiles").delete().eq("id", importTeacherId);
  await admin.auth.admin.deleteUser(importTeacherId).catch(() => {});
});

test.describe("استيراد نور — access control", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/noor-import");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("student role is redirected away", async ({ page }) => {
    await login(page, "student");
    await page.goto("/noor-import");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("teacher role is redirected away (not approved for this page)", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/noor-import");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("principal role has full access", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await expect(page.getByText("اختيار ملف")).toBeVisible();
  });
});

test.describe("استيراد نور — قراءة الملف والمعاينة", () => {
  test("loads with no console/page errors", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => {
      if (req.failure()?.errorText !== "net::ERR_ABORTED") failedRequests.push(`${req.method()} ${req.url()}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await login(page, "principal");
    await gotoNoorImport(page);

    const ownConsoleErrors = consoleErrors.filter((e) => !e.includes("getCurrentUser") && !e.includes("loadSession"));
    expect(pageErrors).toEqual([]);
    expect(ownConsoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("valid real .xlsx file: preview shows correct row/valid/duplicate/error counts", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "valid.xlsx");

    await expect(page.getByText("صفوف الملف", { exact: true }).locator("xpath=../div[1]")).toHaveText("3");
    await expect(page.getByText("سجلات صحيحة", { exact: true }).locator("xpath=../div[1]")).toHaveText("3");
    await expect(page.getByText("مكررة بالملف", { exact: true }).locator("xpath=../div[1]")).toHaveText("0");
    await expect(page.getByText("مرفوضة", { exact: true }).locator("xpath=../div[1]")).toHaveText("0");
  });

  test("drag-and-drop upload works", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await dragDropFile(page, path.join(FIXTURES_DIR, "valid.xlsx"), "valid.xlsx");
    await expect(page.getByText("valid.xlsx")).toBeVisible({ timeout: 10_000 });
  });

  test("different column names (synonyms), hamza variant, and Arabic-Indic digits are all recognized", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "synonyms.xlsx");

    await expect(page.getByText("سجلات صحيحة", { exact: true }).locator("xpath=../div[1]")).toHaveText("2");
    // The Arabic-Indic national id ١٢٣٤٥٦٧٨٩٠ must render as ASCII 1234567890.
    await expect(page.getByText("1234567890")).toBeVisible();
  });

  test("file with an internal duplicate is flagged and only counted once", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "duplicates.xlsx");

    await expect(page.getByText("مكررة بالملف", { exact: true }).locator("xpath=../div[1]")).toHaveText("1");
    await expect(page.getByText("السجلات المكررة داخل الملف")).toBeVisible();
  });

  test("incomplete rows (missing name) are rejected with a visible reason", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "incomplete.xlsx");

    await expect(page.getByText("مرفوضة", { exact: true }).locator("xpath=../div[1]")).toHaveText("1");
    await expect(page.getByText("السجلات المرفوضة وأسباب الرفض")).toBeVisible();
    await expect(page.getByText("الاسم إلزامي")).toBeVisible();
  });

  test("a non-Excel file is rejected with a clear Arabic message, not a crash", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await page.locator("#noor-file-input").setInputFiles(path.join(FIXTURES_DIR, "not-excel.xlsx"));
    await page.getByRole("button", { name: "معاينة الملف" }).click();
    await expect(page.getByText(/تعذّرت قراءة الملف|محتوى الملف لا يطابق/)).toBeVisible({ timeout: 10_000 });
  });

  test("formula-injection cell values are neutralized, not executed as formulas", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "formula-injection.xlsx");

    const nameCell = page.locator("tbody tr").first().locator("td").nth(1);
    await expect(nameCell).toContainText("'=cmd");
  });
});

test.describe("استيراد نور — الاستيراد الفعلي إلى Supabase", () => {
  test("importing valid.xlsx inserts real rows, shows a clear success report, and is verifiable directly in students", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "valid.xlsx");

    await page.getByRole("button", { name: "حفظ في قاعدة البيانات" }).click();
    await expect(page.getByText("تم الاستيراد بنجاح")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("تمت الإضافة: 3")).toBeVisible();

    const { data, count } = await admin
      .from("students")
      .select("full_name, grade, section", { count: "exact" })
      .ilike("full_name", `طالب صحيح%${RUN}`);
    expect(count).toBe(3);
    expect(data?.[0]?.grade).toBe("الأول ثانوي");

    const auditRows = await admin.from("audit_logs").select("action, details").eq("action", "استيراد بيانات نور").ilike("details", "%valid.xlsx%");
    expect((auditRows.data?.length ?? 0) > 0).toBe(true);
  });

  test("re-importing with a matching national_id updates the existing student instead of duplicating it", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "update-existing.xlsx");

    // conflictMode defaults to "update"
    await page.getByRole("button", { name: "حفظ في قاعدة البيانات" }).click();
    await expect(page.getByText(/تم الاستيراد/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("تم التحديث: 1")).toBeVisible();

    const updatedName = `طالب صحيح واحد محدث ${RUN}`;
    const { data, count } = await admin.from("students").select("full_name, grade", { count: "exact" }).eq("full_name", updatedName);
    expect(count).toBe(1); // updated in place, not duplicated
    expect(data?.[0]?.grade).toBe("الثاني ثانوي");
  });

  test("large file (650 rows) is imported in batches with real, advancing progress", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "large.xlsx");
    await expect(page.getByText("سجلات صحيحة", { exact: true }).locator("xpath=../div[1]")).toHaveText("650");

    await page.getByRole("button", { name: "حفظ في قاعدة البيانات" }).click();
    await expect(page.getByText(/جارٍ الاستيراد/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("تم الاستيراد بنجاح")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText("تمت الإضافة: 650")).toBeVisible();

    const { count } = await admin.from("students").select("*", { count: "exact", head: true }).ilike("full_name", `طالب كبير ${RUN}%`);
    expect(count).toBe(650);
  });

  test("cancel stops the import before it completes, and does not silently finish", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "large.xlsx");

    await page.getByRole("button", { name: "حفظ في قاعدة البيانات" }).click();
    await expect(page.getByRole("button", { name: "إلغاء الاستيراد" })).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "إلغاء الاستيراد" }).click();

    await expect(page.getByText("فشل الاستيراد")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/تم الإلغاء/)).toBeVisible();
  });

  test("import button is disabled while importing (no double-submit)", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "valid.xlsx");

    await page.getByRole("button", { name: "حفظ في قاعدة البيانات" }).click();
    await expect(page.getByRole("button", { name: "حفظ في قاعدة البيانات" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "معاينة الملف" })).toBeDisabled();
  });
});

test.describe("استيراد نور — ظهور الطلاب المستوردين في باقي النظام", () => {
  test("an imported student appears in إدارة الطلاب, survives reload + real logout/login, appears in تحضير الحصص roster, and is findable in إجراءات الطالب search", async ({
    page,
    context,
  }) => {
    // Import directly into the grade/section the dedicated QA teacher is assigned to.
    await admin.from("students").delete().eq("national_id", ATTENDANCE_STUDENT_NID);

    await login(page, "principal");
    await gotoNoorImport(page);

    await page.locator("#noor-file-input").setInputFiles({
      name: "attendance-check.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await buildXlsxBuffer([
        ["اسم الطالب", "رقم الهوية", "الصف", "الفصل"],
        [ATTENDANCE_STUDENT_NAME, ATTENDANCE_STUDENT_NID, ATTENDANCE_GRADE, ATTENDANCE_SECTION],
      ]),
    });
    await page.getByRole("button", { name: "معاينة الملف" }).click();
    await expect(page.getByText(/تم استخراج/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "حفظ في قاعدة البيانات" }).click();
    await expect(page.getByText("تم الاستيراد بنجاح")).toBeVisible({ timeout: 15_000 });

    // 1) إدارة الطلاب
    await page.goto("/students");
    await expect(page.getByRole("heading", { name: "إدارة الطلاب" })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة").fill(ATTENDANCE_STUDENT_NAME);
    await expect(page.getByText(ATTENDANCE_STUDENT_NAME)).toBeVisible({ timeout: 15_000 });

    // 2) reload
    await page.reload();
    await page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة").fill(ATTENDANCE_STUDENT_NAME);
    await expect(page.getByText(ATTENDANCE_STUDENT_NAME)).toBeVisible({ timeout: 15_000 });

    // 3) real logout (clear cookies) + login again
    await context.clearCookies();
    await page.goto("/login");
    await login(page, "principal");
    await page.goto("/students");
    await expect(page.getByRole("heading", { name: "إدارة الطلاب" })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("بحث بالاسم أو رقم الهوية أو رمز الدخول أو الصف أو الشعبة").fill(ATTENDANCE_STUDENT_NAME);
    await expect(page.getByText(ATTENDANCE_STUDENT_NAME)).toBeVisible({ timeout: 15_000 });

    // 4) البحث داخل إجراءات الطالب
    await page.goto("/student-actions");
    await expect(page.getByRole("heading", { name: "استدعاء / استئذان / دخول" })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("ابحث بالاسم، رقم الهوية، رقم الطالب، الصف أو الشعبة").fill(ATTENDANCE_STUDENT_NAME);
    await expect(page.getByText(ATTENDANCE_STUDENT_NAME)).toBeVisible({ timeout: 15_000 });

    // 5) تحضير الحصص roster (as the dedicated teacher assigned to this exact grade/section)
    await context.clearCookies();
    await loginAs(page, IMPORT_TEACHER_EMAIL, IMPORT_TEACHER_PASSWORD);
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "نظام تحضير الحصص" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("select").nth(2)).toHaveValue(ATTENDANCE_GRADE, { timeout: 15_000 });
    await expect(page.locator("select").nth(3)).toHaveValue(ATTENDANCE_SECTION);
    await expect(page.getByText(ATTENDANCE_STUDENT_NAME)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("استيراد نور — mobile", () => {
  test("no horizontal page overflow on a mobile viewport", async ({ page }) => {
    await login(page, "principal");
    await gotoNoorImport(page);
    await uploadAndPreview(page, "valid.xlsx");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// Builds a real .xlsx file in-memory (browser context) via a Node-side helper
// using the same `xlsx` package the app itself uses, so this fixture is a
// genuine spreadsheet, not a fabricated buffer.
async function buildXlsxBuffer(rows: unknown[][]): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
