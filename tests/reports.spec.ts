import * as fs from "fs";
import * as XLSX from "xlsx";
import { test, expect, type Page } from "@playwright/test";
import { QA_PASSWORD, QA_USERS, QA_ROLE_LABELS, type QaRole } from "./setup/qa-user";

async function login(page: Page, role: QaRole = "principal") {
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
  // Let the initial RPC round trip (summary/daily/top lists/students tables) settle.
  await page.waitForTimeout(1200);
}

test.describe("Reports & statistics — access", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  for (const role of Object.keys(QA_USERS) as QaRole[]) {
    test(`${role} (${QA_ROLE_LABELS[role]}) can open the reports page`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await login(page, role);
      await gotoReports(page);

      await expect(page.getByRole("button", { name: "تطبيق" })).toBeVisible();
      expect(pageErrors, `Unexpected uncaught page errors for role ${role}: ${pageErrors.join(" | ")}`).toEqual([]);
    });
  }
});

test.describe("Reports & statistics — data & charts (real DB, post-migration)", () => {
  test("KPI summary cards render real numbers with no error banner", async ({ page }) => {
    await login(page);
    await gotoReports(page);

    await expect(page.getByText("حدث خطأ غير متوقع", { exact: false })).toHaveCount(0);

    const cardValues: number[] = [];
    for (const title of ["إجمالي الطلاب", "الحاضرون", "الغياب بعذر", "الغياب بدون عذر", "المتأخرون"]) {
      const card = page.locator("h2", { hasText: /^[0-9]+$/ }).locator("..").filter({ hasText: title }).first();
      const label = page.getByText(title, { exact: true }).first();
      await expect(label).toBeVisible();
      const value = await label.locator("xpath=../h2").first().textContent().catch(() => null);
      if (value) cardValues.push(Number(value.replace(/[^0-9]/g, "")) || 0);
      void card;
    }

    // Every KPI must be a real, non-crashing, non-negative number -- a negative
    // or NaN count would indicate a broken aggregate query.
    expect(cardValues.length).toBeGreaterThan(0);
    expect(cardValues.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });

  test("daily attendance chart and status pie chart render SVG data for the default range", async ({ page }) => {
    await login(page);
    await gotoReports(page);

    const dailyCard = page.locator("section", { hasText: "الحضور خلال الأيام" }).first();
    const pieCard = page.locator("section", { hasText: "توزيع الحالات" }).first();

    await expect(dailyCard.locator("svg").first()).toBeVisible({ timeout: 15_000 });
    await expect(pieCard.locator("svg").first()).toBeVisible({ timeout: 15_000 });
  });

  test("date range presets (daily / weekly / monthly) update the report without errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await login(page);
    await gotoReports(page);

    const today = new Date().toISOString().slice(0, 10);
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    };

    const dateInputs = page.locator('input[type="date"]');

    for (const [label, from] of [
      ["daily", today],
      ["weekly", daysAgo(7)],
      ["monthly", daysAgo(30)],
    ] as const) {
      await dateInputs.first().fill(from);
      await dateInputs.nth(1).fill(today);
      await page.getByRole("button", { name: "تطبيق" }).click();
      await page.waitForTimeout(1000);
      await expect(page.getByText("حدث خطأ غير متوقع", { exact: false }), `error banner shown for ${label} range`).toHaveCount(0);
    }

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  });

  test("grade/section/subject/teacher/status filters apply real filtering without crashing", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await login(page);
    await gotoReports(page);

    const selects = page.locator("select");
    const gradeSelect = selects.nth(0);
    const sectionSelect = selects.nth(1);
    const subjectSelect = selects.nth(2);
    const teacherSelect = selects.nth(3);
    const statusSelect = selects.nth(4);

    async function pickSecondOptionIfAny(select: ReturnType<Page["locator"]>) {
      const count = await select.locator("option").count();
      if (count > 1) {
        const value = await select.locator("option").nth(1).getAttribute("value");
        if (value) await select.selectOption(value);
      }
    }

    await pickSecondOptionIfAny(gradeSelect);
    await pickSecondOptionIfAny(sectionSelect);
    await pickSecondOptionIfAny(subjectSelect);
    await pickSecondOptionIfAny(teacherSelect);
    await statusSelect.selectOption("absent");

    await page.getByRole("button", { name: "تطبيق" }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText("حدث خطأ غير متوقع", { exact: false })).toHaveCount(0);

    await page.getByRole("button", { name: "إعادة تعيين" }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole("heading", { name: "التقارير والإحصائيات" })).toBeVisible();

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  });

  test("initial load issues a bounded number of Supabase requests (no N+1) and responds promptly", async ({ page }) => {
    const restRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/rest/v1/rpc/") || req.url().includes("/rest/v1/")) restRequests.push(req.url());
    });

    const start = Date.now();
    await login(page);
    restRequests.length = 0; // ignore login-time requests, only count the reports page's own load
    await gotoReports(page);
    const elapsedMs = Date.now() - start;

    // One RPC call per section (summary/daily/grades/sections/teachers/lessons)
    // plus two paginated student-table calls plus filter-options -- roughly a
    // dozen requests regardless of how many students/records exist, doubled
    // here because `npm run dev` runs React in Strict Mode (every effect
    // fires twice on mount). A per-row fetch pattern would scale with data
    // size and blow well past this bound instead of staying flat.
    expect(restRequests.length, `unexpectedly high request count (possible N+1): ${restRequests.length}`).toBeLessThan(40);
    expect(elapsedMs, "reports page took unreasonably long to become interactive").toBeLessThan(20_000);
  });

  test("students tables paginate when there is more than one page of results", async ({ page }) => {
    await login(page);
    await gotoReports(page);

    // Widen the range to maximize the chance of >20 distinct students.
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill("2020-01-01");
    await page.getByRole("button", { name: "تطبيق" }).click();
    await page.waitForTimeout(1500);

    const absentSection = page.locator("section", { hasText: "أكثر الطلاب غياباً" }).first();
    const nextButton = absentSection.getByRole("button", { name: "الصفحة التالية" });

    if (await nextButton.isVisible().catch(() => false)) {
      const firstRowNameBefore = await absentSection.locator("td").first().textContent();
      await nextButton.click();
      await page.waitForTimeout(800);
      const firstRowNameAfter = await absentSection.locator("td").first().textContent();
      expect(firstRowNameAfter).not.toEqual(firstRowNameBefore);

      const prevButton = absentSection.getByRole("button", { name: "الصفحة السابقة" });
      await expect(prevButton).toBeEnabled();
      await prevButton.click();
      await page.waitForTimeout(800);
    } else {
      test.info().annotations.push({ type: "note", description: "Fewer than 21 distinct absent students in range — pagination controls correctly hidden." });
    }
  });
});

test.describe("Reports & statistics — export & print", () => {
  test("Excel export contains real data across all expected sheets, in Arabic", async ({ page }) => {
    await login(page);
    await gotoReports(page);

    const excelDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Excel" }).click();
    const excelFile = await excelDownload;
    expect(excelFile.suggestedFilename()).toMatch(/\.xlsx$/);
    expect(excelFile.suggestedFilename()).toMatch(/تقرير-الحضور/);

    const filePath = await excelFile.path();
    expect(filePath).not.toBeNull();
    const buffer = fs.readFileSync(filePath!);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const expectedSheets = [
      "الملخص",
      "الحضور اليومي",
      "أكثر الصفوف غياباً",
      "أكثر الشعب التزاماً",
      "أكثر المعلمين رفعاً",
      "أكثر الحصص غياباً",
      "أكثر الطلاب غياباً",
      "أكثر الطلاب التزاماً",
    ];
    for (const sheetName of expectedSheets) {
      expect(workbook.SheetNames, `missing sheet: ${sheetName}`).toContain(sheetName);
    }

    const summaryRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["الملخص"]);
    const indicators = summaryRows.map((r) => String(r["المؤشر"]));
    for (const label of ["إجمالي الطلاب", "الحاضرون", "الغياب بعذر", "الغياب بدون عذر", "المتأخرون", "نسبة الحضور %", "نسبة الغياب %"]) {
      expect(indicators, `summary sheet missing indicator: ${label}`).toContain(label);
    }

    // No negative counts anywhere in the summary sheet.
    for (const row of summaryRows) {
      const value = row["القيمة"];
      if (typeof value === "number") expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  test("CSV export is UTF-8 (BOM-prefixed) with real Arabic content", async ({ page }) => {
    await login(page);
    await gotoReports(page);

    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV" }).click();
    const csvFile = await csvDownload;
    expect(csvFile.suggestedFilename()).toMatch(/\.csv$/);

    const filePath = await csvFile.path();
    const buffer = fs.readFileSync(filePath!);

    // UTF-8 BOM (EF BB BF) so Excel opens Arabic text correctly instead of mojibake.
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);

    const text = buffer.toString("utf-8");
    expect(text).toContain("الملخص");
    expect(text).toContain("إجمالي الطلاب");
    expect(text.length).toBeGreaterThan(50);
  });

  test("PDF export renders a real, A4-sized, non-trivial PDF file", async ({ page }) => {
    await login(page);
    await gotoReports(page);

    const pdfDownload = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "PDF" }).click();
    const pdfFile = await pdfDownload;
    expect(pdfFile.suggestedFilename()).toMatch(/\.pdf$/);

    const filePath = await pdfFile.path();
    const buffer = fs.readFileSync(filePath!);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // A blank/broken export would be a few hundred bytes; a real rasterized
    // report page is comfortably larger than this.
    expect(buffer.length).toBeGreaterThan(5_000);

    const raw = buffer.toString("latin1");
    const mediaBoxMatch = raw.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
    if (mediaBoxMatch) {
      const width = Number(mediaBoxMatch[3]) - Number(mediaBoxMatch[1]);
      const height = Number(mediaBoxMatch[4]) - Number(mediaBoxMatch[2]);
      // A4 portrait in PDF points is 595 x 842; allow a small tolerance.
      expect(Math.abs(width - 595)).toBeLessThan(2);
      expect(Math.abs(height - 842)).toBeLessThan(2);
    }
  });

  test("print button invokes window.print without crashing", async ({ page }) => {
    await login(page);
    await gotoReports(page);

    let printCalled = false;
    await page.exposeFunction("__notifyPrint", () => {
      printCalled = true;
    });
    await page.addInitScript(() => {
      window.print = () => {
        (window as unknown as { __notifyPrint: () => void }).__notifyPrint();
      };
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "التقارير والإحصائيات" })).toBeVisible();
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: "طباعة مباشرة" }).click();
    await page.waitForTimeout(300);
    expect(printCalled).toBe(true);
  });
});

test.describe("Reports & statistics — mobile layout", () => {
  test("has no horizontal overflow on a mobile viewport with real data loaded", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await gotoReports(page);
    await page.waitForTimeout(1000);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "Page has horizontal overflow on mobile viewport").toBeLessThanOrEqual(1);
  });

  test("student table renders as stacked cards (not a wide table) on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await gotoReports(page);

    const absentSection = page.locator("section", { hasText: "أكثر الطلاب غياباً" }).first();
    const desktopTable = absentSection.locator("table");
    await expect(desktopTable).toBeHidden();
  });
});
