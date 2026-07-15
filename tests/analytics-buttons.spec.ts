import { test, expect, type Page } from "@playwright/test";
import { QA_PASSWORD, QA_USERS } from "./setup/qa-user";

async function login(page: Page) {
  const { email } = QA_USERS.principal;
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  // Let /dashboard's own loadSession() effect finish before navigating away -- otherwise
  // Chromium aborts that in-flight fetch and logs a "Failed to fetch" console error that
  // has nothing to do with the /analytics buttons under test here.
  await page.waitForLoadState("networkidle");
}

test.describe("Analytics page (/analytics) — previously non-functional buttons", () => {
  test("تحديث التحليل actually re-fetches from Supabase (real network request, no console errors)", async ({ page }) => {
    await login(page);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "مركز تحليل الحضور والانضباط" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Only start watching for errors once the page itself has fully settled -- this
    // isolates errors actually caused by clicking the button from unrelated noise
    // during the login -> /dashboard -> /analytics navigation chain.
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const requests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/rest/v1/students") || url.includes("/rest/v1/attendance_records")) requests.push(url);
    });

    const refreshButton = page.getByRole("button", { name: "تحديث التحليل" });
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton).toBeEnabled();

    await refreshButton.click();
    // A real reload disables the button (shows a spinner) while in flight.
    await page.waitForTimeout(300);
    await page.waitForTimeout(2000);

    expect(requests.length, "clicking تحديث التحليل did not trigger any Supabase REST requests").toBeGreaterThan(0);
    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
  });

  test("Excel button downloads a real .xlsx file", async ({ page }) => {
    await login(page);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "مركز تحليل الحضور والانضباط" })).toBeVisible();
    await page.waitForTimeout(1000);

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: "Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

    const path = await download.path();
    expect(path).not.toBeNull();
  });

  test("PDF button downloads a real .pdf file (no silent failure, no console error)", async ({ page }) => {
    await login(page);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "مركز تحليل الحضور والانضباط" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    const path = await download.path();
    expect(path).not.toBeNull();

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
  });
});
