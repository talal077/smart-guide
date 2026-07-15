import { test, expect, type Page } from "@playwright/test";
import { QA_PASSWORD, QA_USERS, type QaRole } from "./setup/qa-user";
import { REPORTS_SCOPE_MARKER, REPORTS_SCOPE_STUDENT_NAME } from "./setup/reports-scope-fixture";

async function login(page: Page, role: QaRole) {
  const { email } = QA_USERS[role];
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function gotoReports(page: Page) {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "التقارير والإحصائيات" })).toBeVisible();
  await page.waitForTimeout(1200);
}

async function readStatCard(page: Page, title: string): Promise<number> {
  const label = page.getByText(title, { exact: true }).first();
  await expect(label).toBeVisible();
  const value = await label.locator("xpath=../h2").first().textContent();
  return Number((value ?? "").replace(/[^0-9]/g, "")) || 0;
}

// These tests exercise the role-based scoping added in migrations 021/022
// (supabase/migrations/021_reports_teacher_scoping.sql and
// 022_reports_students_table_search.sql). If those migrations have not yet
// been applied to the target Supabase project, the "teacher" case will show
// the same unscoped totals as principal/admin/vice_principal and these
// assertions will fail -- that is expected until the migrations are run
// manually (this Playwright test suite has no DDL/migration access, only
// table-level fixture seeding via the service-role key in global-setup.ts).
test.describe("Reports & statistics — teacher-role data scoping (migrations 021/022)", () => {
  test("teacher sees only their own scoped attendance; principal sees all of it", async ({ page }) => {
    await login(page, "teacher");
    await gotoReports(page);

    await page.locator("select").nth(0).selectOption(REPORTS_SCOPE_MARKER);
    await page.locator("select").nth(1).selectOption(REPORTS_SCOPE_MARKER);
    await page.getByRole("button", { name: "تطبيق" }).click();

    // expect.poll, not a fixed waitForTimeout: the stat card briefly still
    // shows the previous (or default 0) value while the Supabase round trip
    // for the newly-applied filters is in flight.
    await expect
      .poll(() => readStatCard(page, "الغياب بدون عذر"), {
        message: "teacher should only see their own 2 absent rows, not the 3rd row owned by another teacher_id",
        timeout: 10_000,
      })
      .toBe(2);

    await page.context().clearCookies();
    await login(page, "principal");
    await gotoReports(page);

    await page.locator("select").nth(0).selectOption(REPORTS_SCOPE_MARKER);
    await page.locator("select").nth(1).selectOption(REPORTS_SCOPE_MARKER);
    await page.getByRole("button", { name: "تطبيق" }).click();

    await expect
      .poll(() => readStatCard(page, "الغياب بدون عذر"), {
        message: "principal is unscoped and should see all 3 absent rows across both teacher_ids",
        timeout: 10_000,
      })
      .toBe(3);
  });

  test("teacher role does not see the 'المعلم' filter dropdown (always implicitly scoped to self)", async ({ page }) => {
    await login(page, "teacher");
    await gotoReports(page);
    await expect(page.getByText("المعلم", { exact: true })).toHaveCount(0);
  });

  test("non-teacher roles still see the 'المعلم' filter dropdown", async ({ page }) => {
    await login(page, "principal");
    await gotoReports(page);
    await expect(page.getByText("المعلم", { exact: true })).toBeVisible();
  });
});

test.describe("Reports & statistics — student-name search", () => {
  test("searching by name filters the students tables to the matching student", async ({ page }) => {
    await login(page, "principal");
    await gotoReports(page);

    await page.getByPlaceholder("اكتب اسم الطالب...").fill(REPORTS_SCOPE_MARKER);
    await page.waitForTimeout(700);

    // .last(), not .first(): ReportsPage's own outermost element is itself a
    // <section>, which also contains this heading's text as a descendant, so
    // .first() (document order = outermost first) resolves to the whole page
    // rather than the intended nested StudentsTableSection card.
    const absentSection = page.locator("section", { hasText: "أكثر الطلاب غياباً" }).last();
    // .filter({ visible: true }): the row renders twice in the DOM (a desktop
    // <td> and a mobile <p>, toggled by a CSS breakpoint, not conditional
    // rendering) — only one is actually visible for a given project/viewport.
    await expect(absentSection.getByText(REPORTS_SCOPE_STUDENT_NAME).filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  });

  test("searching for a name with no matches shows the empty state, not an error", async ({ page }) => {
    await login(page, "principal");
    await gotoReports(page);

    await page.getByPlaceholder("اكتب اسم الطالب...").fill("ZZZ_NO_SUCH_STUDENT_ZZZ");
    await page.waitForTimeout(700);

    await expect(page.getByText("حدث خطأ غير متوقع", { exact: false })).toHaveCount(0);
    const absentSection = page.locator("section", { hasText: "أكثر الطلاب غياباً" }).last();
    await expect(absentSection.getByText("لا توجد بيانات كافية لهذه الفترة.")).toBeVisible();
  });
});

test.describe("Reports & statistics — quick date presets", () => {
  test("daily/weekly/monthly preset buttons apply immediately without errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await login(page, "principal");
    await gotoReports(page);

    for (const label of ["يومي (اليوم)", "أسبوعي (آخر 7 أيام)", "شهري (آخر 30 يوم)"]) {
      await page.getByRole("button", { name: label }).click();
      await page.waitForTimeout(900);
      await expect(page.getByText("حدث خطأ غير متوقع", { exact: false })).toHaveCount(0);
    }

    expect(pageErrors).toEqual([]);
  });
});

test.describe("Analytics page (/analytics) — access control", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  for (const role of ["principal", "admin", "vice_principal"] as QaRole[]) {
    test(`${role} can open /analytics`, async ({ page }) => {
      await login(page, role);
      await page.goto("/analytics");
      await expect(page.getByText("التحليلات والإحصائيات", { exact: false })).toBeVisible({ timeout: 15_000 });
    });
  }

  for (const role of ["teacher", "student"] as QaRole[]) {
    test(`${role} is redirected away from /analytics`, async ({ page }) => {
      await login(page, role);
      await page.goto("/analytics");
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    });
  }
});
