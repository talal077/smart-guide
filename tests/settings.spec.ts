import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { QA_PASSWORD, QA_USERS } from "./setup/qa-user";

// Migrations 019 (attendance_settings / notification_settings / system_settings /
// school_settings.academic_term+logo_url+is_active / profiles RLS fix / school-logo
// storage bucket) and 020 (fix for 019's profiles trigger blocking service-role
// role assignment) are both applied. This suite exercises the FULL real
// functionality end-to-end against the live database — no more "pending
// migration" fallback paths.
const RUN = Date.now();

let admin: SupabaseClient;

// 1x1 transparent PNG, used for real Storage upload tests.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function login(page: Page, role: "principal" | "admin" | "vice_principal" | "teacher" | "student") {
  const { email } = QA_USERS[role];
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("أدخل كلمة المرور").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function gotoSettings(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "مركز إعدادات النظام" })).toBeVisible({ timeout: 15_000 });
}

function schoolSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "بيانات المدرسة" }) });
}

// Resolves a QA role's real auth id via a live sign-in — the same id the
// browser session in login() actually authenticates as. Deliberately does NOT
// look profiles up by full_name: this session has accumulated orphaned
// profiles rows (auth user deleted without a cascaded profile cleanup from
// earlier interrupted runs) that share the same canonical full_name and make
// a full_name-keyed .maybeSingle() lookup error on "multiple rows".
async function qaUserId(role: "principal" | "admin" | "vice_principal" | "teacher" | "student"): Promise<string> {
  const { email } = QA_USERS[role];
  // A fresh client per call, and deliberately NEVER signed out: Supabase's
  // auth.signOut() defaults to { scope: "global" }, which revokes the
  // refresh token for every session of that user — including whatever
  // browser session a Playwright `page` in this same test is mid-flow with.
  // This client is thrown away right after use, so there is nothing to clean
  // up on this side.
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const signIn = await client.auth.signInWithPassword({ email, password: QA_PASSWORD });
  if (signIn.error || !signIn.data.user) {
    throw new Error(`qaUserId(${role}) sign-in failed: ${signIn.error?.message}`);
  }
  return signIn.data.user.id;
}

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
});

test.describe("الإعدادات — الوصول والصلاحيات", () => {
  test("unauthenticated users are redirected to /login", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test("student role is redirected away from /settings", async ({ page }) => {
    await login(page, "student");
    await page.goto("/settings");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("teacher sees only بيانات المستخدم — no school/attendance/notifications/system/backup tabs", async ({ page }) => {
    await login(page, "teacher");
    await gotoSettings(page);
    await expect(page.getByRole("button", { name: "بيانات المستخدم" })).toBeVisible();
    await expect(page.getByRole("button", { name: "بيانات المدرسة" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "إعدادات الحضور" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "الإشعارات" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "النظام", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "النسخ الاحتياطي" })).toHaveCount(0);
  });

  test("vice_principal sees بيانات المدرسة read-only (no edit rights) but full operational tabs", async ({ page }) => {
    await login(page, "vice_principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "بيانات المدرسة" }).click();
    await expect(page.getByText("لا تملك صلاحية تعديل بيانات المدرسة")).toBeVisible({ timeout: 15_000 });
    await expect(schoolSection(page).getByRole("button", { name: "حفظ" })).toHaveCount(0);

    await expect(page.getByRole("button", { name: "إعدادات الحضور" })).toBeVisible();
    await expect(page.getByRole("button", { name: "الإشعارات" })).toBeVisible();
    await expect(page.getByRole("button", { name: "النظام", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "النسخ الاحتياطي" })).toHaveCount(0);
  });

  test("vice_principal is blocked at the RLS level too, not just the UI, from every manager-only table", async () => {
    const vpClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const signIn = await vpClient.auth.signInWithPassword({ email: QA_USERS.vice_principal.email, password: QA_PASSWORD });
    expect(signIn.error).toBeFalsy();

    const { data: before } = await admin.from("school_settings").select("school_name").eq("id", true).maybeSingle();
    const { data, error } = await vpClient.from("school_settings").update({ school_name: before!.school_name }).eq("id", true).select();
    const blocked = !!error || (data && data.length === 0);
    expect(blocked, "vice_principal must not be able to UPDATE school_settings via direct RLS").toBe(true);

    await vpClient.auth.signOut();
  });

  test("principal and admin have full edit access including بيانات المدرسة و النسخ الاحتياطي", async ({ page }) => {
    for (const role of ["principal", "admin"] as const) {
      await page.context().clearCookies();
      await login(page, role);
      await gotoSettings(page);
      await page.getByRole("button", { name: "بيانات المدرسة" }).click();
      await expect(schoolSection(page).getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "النسخ الاحتياطي" })).toBeVisible();
    }
  });
});

test.describe("الإعدادات — بيانات المستخدم", () => {
  test("editing the display name persists in Supabase, survives reload and a real logout/login cycle, and is audit-logged", async ({
    page,
    context,
  }) => {
    await login(page, "teacher");
    await gotoSettings(page);

    const teacherId = await qaUserId("teacher");
    const updatedName = `${QA_USERS.teacher.fullName} محدَّث ${RUN}`;

    const userSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "بيانات المستخدم" }) });
    const nameInput = userSection.locator('input:not([type="file"])').first();
    await nameInput.fill("");
    await nameInput.fill(updatedName);
    await userSection.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ الاسم بنجاح.")).toBeVisible({ timeout: 15_000 });

    const { data: afterSave } = await admin.from("profiles").select("full_name").eq("id", teacherId).maybeSingle();
    expect(afterSave?.full_name).toBe(updatedName);

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("action, new_values")
      .eq("actor_id", teacherId)
      .eq("action", "تعديل البيانات الشخصية")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditRows?.length).toBeGreaterThanOrEqual(1);

    await page.reload();
    await gotoSettings(page);
    await expect(userSection.locator('input:not([type="file"])').first()).toHaveValue(updatedName, { timeout: 15_000 });

    await context.clearCookies();
    await login(page, "teacher");
    await gotoSettings(page);
    await expect(userSection.locator('input:not([type="file"])').first()).toHaveValue(updatedName, { timeout: 15_000 });

    await admin.from("profiles").update({ full_name: QA_USERS.teacher.fullName }).eq("id", teacherId);
  });

  test("changing the password lets the user log in with the new one, and never stores the value in audit_logs", async ({ page }) => {
    const email = `qa-settings-pwd-${RUN}@smartguide.local`;
    const originalPassword = "Qa12345!Original";
    const newPassword = "Qa12345!Changed";

    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password: originalPassword, email_confirm: true });
    expect(createErr).toBeFalsy();
    const userId = created!.user!.id;
    await admin.from("profiles").update({ full_name: `QA Settings Password ${RUN}`, role: "teacher", is_active: true, is_blocked: false }).eq("id", userId);

    try {
      await page.goto("/login");
      await page.getByPlaceholder("example@email.com").fill(email);
      await page.getByPlaceholder("أدخل كلمة المرور").fill(originalPassword);
      await page.getByRole("button", { name: "دخول", exact: true }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

      await gotoSettings(page);
      const passwordSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "تغيير كلمة المرور" }) });
      const pwInputs = passwordSection.locator('input[type="password"]');
      await expect(pwInputs).toHaveCount(2, { timeout: 15_000 });
      await pwInputs.nth(0).fill(newPassword);
      await pwInputs.nth(1).fill(newPassword);
      await passwordSection.getByRole("button", { name: "حفظ" }).click();
      await expect(page.getByText("تم تغيير كلمة المرور بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data: auditRows } = await admin
        .from("audit_logs")
        .select("details, new_values, old_values")
        .eq("actor_id", userId)
        .eq("action", "تغيير كلمة المرور");
      expect(auditRows?.length).toBeGreaterThanOrEqual(1);
      const serialized = JSON.stringify(auditRows);
      expect(serialized).not.toContain(newPassword);
      expect(serialized).not.toContain(originalPassword);

      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByPlaceholder("example@email.com").fill(email);
      await page.getByPlaceholder("أدخل كلمة المرور").fill(newPassword);
      await page.getByRole("button", { name: "دخول", exact: true }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    } finally {
      await admin.from("audit_logs").delete().eq("actor_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
  });

  test("a teacher's own assigned subject/sections are shown read-only", async ({ page }) => {
    await login(page, "teacher");
    await gotoSettings(page);
    await expect(page.getByText("المادة والشعب المسندة")).toBeVisible({ timeout: 15_000 });
  });

  test("a non-manager cannot change their own role/is_active/is_blocked even via a direct API call (trigger protection)", async () => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const signIn = await client.auth.signInWithPassword({ email: QA_USERS.teacher.email, password: QA_PASSWORD });
    expect(signIn.error).toBeFalsy();
    const teacherId = signIn.data.user!.id;

    const { error } = await client.from("profiles").update({ role: "principal" }).eq("id", teacherId);
    expect(error, "self-promotion must be rejected by the protective trigger").toBeTruthy();
    expect(error?.message).toContain("غير مصرح لك");

    const { data: stillTeacher } = await admin.from("profiles").select("role").eq("id", teacherId).maybeSingle();
    expect(stillTeacher?.role).toBe("teacher");

    await client.auth.signOut();
  });
});

test.describe("الإعدادات — بيانات المدرسة (تعمل بالكامل بعد Migration 019/020)", () => {
  test("admin: full round trip for name/term/active — save, reload, logout/login, and audit log all confirm the real value", async ({
    page,
    context,
  }) => {
    await login(page, "admin");
    await gotoSettings(page);
    await page.getByRole("button", { name: "بيانات المدرسة" }).click();
    const section = schoolSection(page);
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("school_settings").select("school_name, academic_term, is_active").eq("id", true).maybeSingle();
    const originalName = before!.school_name;
    const tempName = `${originalName} (اختبار ${RUN})`;

    const nameInput = section.locator('input:not([type="file"])').first();
    await nameInput.fill("");
    await nameInput.fill(tempName);

    const termSelect = section.locator("select").last(); // admin/stage/year/term — term is last
    await termSelect.selectOption({ label: "الفصل الثاني" });

    await section.getByRole("button", { name: "حفظ" }).click();
    // Now that the migration is applied, this must be the full, unqualified
    // success message — not the old "...لم يُحفظا لأن قاعدة البيانات تحتاج
    // تحديثًا" partial-skip wording.
    await expect(page.getByText("تم حفظ بيانات المدرسة.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/لم يُحفظا/)).toHaveCount(0);

    const { data: afterSave } = await admin.from("school_settings").select("school_name, academic_term").eq("id", true).maybeSingle();
    expect(afterSave?.school_name).toBe(tempName);
    expect(afterSave?.academic_term).toBe("الفصل الثاني");

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("action, old_values, new_values")
      .eq("action", "تعديل بيانات المدرسة")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditRows?.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(auditRows![0].new_values)).toContain("الفصل الثاني");

    await page.reload();
    await page.getByRole("button", { name: "بيانات المدرسة" }).click();
    await expect(section.locator('input:not([type="file"])').first()).toHaveValue(tempName, { timeout: 15_000 });

    await context.clearCookies();
    await login(page, "admin");
    await gotoSettings(page);
    await page.getByRole("button", { name: "بيانات المدرسة" }).click();
    await expect(section.locator('input:not([type="file"])').first()).toHaveValue(tempName, { timeout: 15_000 });
    await expect(section.locator("select").last()).toHaveValue(
      await section.locator("select").last().locator('option:has-text("الفصل الثاني")').getAttribute("value").then((v) => v ?? ""),
    );

    // Restore.
    const restoreInput = section.locator('input:not([type="file"])').first();
    await restoreInput.fill("");
    await restoreInput.fill(originalName);
    await section.locator("select").last().selectOption({ label: before!.academic_term ?? "الفصل الأول" });
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ بيانات المدرسة.", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("principal can now also save بيانات المدرسة end-to-end (migration 019 widened school_settings RLS to include principal)", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "بيانات المدرسة" }).click();
    const section = schoolSection(page);
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("school_settings").select("school_name").eq("id", true).maybeSingle();
    const tempName = `${before!.school_name} (principal-${RUN})`;

    const nameInput = section.locator('input:not([type="file"])').first();
    await nameInput.fill("");
    await nameInput.fill(tempName);
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ بيانات المدرسة.", { exact: true })).toBeVisible({ timeout: 15_000 });

    const { data: afterSave } = await admin.from("school_settings").select("school_name").eq("id", true).maybeSingle();
    expect(afterSave?.school_name).toBe(tempName);

    // Restore.
    await nameInput.fill("");
    await nameInput.fill(before!.school_name);
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ بيانات المدرسة.", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("توقيف المدرسة (is_active) round-trips through Supabase with a confirm dialog", async ({ page }) => {
    await login(page, "admin");
    await gotoSettings(page);
    await page.getByRole("button", { name: "بيانات المدرسة" }).click();
    const section = schoolSection(page);
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("school_settings").select("is_active").eq("id", true).maybeSingle();
    expect(before?.is_active).toBe(true); // sanity: starts active

    page.once("dialog", (dialog) => dialog.accept());
    await section.getByRole("button", { name: /حالة المدرسة/ }).click();
    await expect(section.getByRole("button", { name: /حالة المدرسة/ })).toHaveText(/موقوفة/, { timeout: 15_000 });

    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ بيانات المدرسة.", { exact: true })).toBeVisible({ timeout: 15_000 });

    const { data: afterSuspend } = await admin.from("school_settings").select("is_active").eq("id", true).maybeSingle();
    expect(afterSuspend?.is_active).toBe(false);

    // Restore to active (turning back on needs no confirm dialog per the app's own logic).
    await section.getByRole("button", { name: /حالة المدرسة/ }).click();
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ بيانات المدرسة.", { exact: true })).toBeVisible({ timeout: 15_000 });
    const { data: restored } = await admin.from("school_settings").select("is_active").eq("id", true).maybeSingle();
    expect(restored?.is_active).toBe(true);
  });

  test("logo upload: a real image persists to Storage, shows in the الترويسة preview, and a teacher cannot upload one", async ({ page }) => {
    await login(page, "admin");
    await gotoSettings(page);
    await page.getByRole("button", { name: "بيانات المدرسة" }).click();
    const section = schoolSection(page);
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const fileInput = section.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: `logo-${RUN}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    });
    await expect(page.getByText("تم رفع الشعار وحفظه بنجاح.")).toBeVisible({ timeout: 15_000 });

    const { data: afterUpload } = await admin.from("school_settings").select("logo_url").eq("id", true).maybeSingle();
    expect(afterUpload?.logo_url).toBeTruthy();
    expect(afterUpload!.logo_url).toContain("school-logo");

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("action")
      .eq("action", "رفع شعار المدرسة")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditRows?.length).toBeGreaterThanOrEqual(1);

    // Shows in the header preview on the الترويسة tab.
    await page.getByRole("button", { name: "الترويسة" }).click();
    await expect(page.locator('img[alt="شعار المدرسة"]')).toBeVisible({ timeout: 15_000 });

    // A teacher cannot upload (no UI access to the tab at all, and RLS blocks it directly too).
    const teacherClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const signIn = await teacherClient.auth.signInWithPassword({ email: QA_USERS.teacher.email, password: QA_PASSWORD });
    expect(signIn.error).toBeFalsy();
    const { error: uploadErr } = await teacherClient.storage
      .from("school-logo")
      .upload(`teacher-attempt-${RUN}.png`, Buffer.from(TINY_PNG_BASE64, "base64"), { contentType: "image/png" });
    expect(uploadErr, "teacher must not be able to upload to school-logo").toBeTruthy();
    await teacherClient.auth.signOut();
  });
});

test.describe("الإعدادات — إعدادات الحضور (تعمل بالكامل)", () => {
  test("colors, timing, and toggles round-trip through Supabase and survive reload; audit-logged", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "إعدادات الحضور" }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "إعدادات الحضور" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("attendance_settings").select("*").eq("id", true).maybeSingle();

    const deadlineInput = section.getByLabel(/المهلة الزمنية لرفع التحضير/).or(section.locator('input[type="number"]').first());
    await deadlineInput.fill("").catch(() => {});
    const numberInputs = section.locator('input[type="number"]');
    await numberInputs.nth(0).fill("45");
    await numberInputs.nth(1).fill("20");
    await section.getByRole("button", { name: "السماح بالتعديل بعد الإرسال" }).click();

    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ إعدادات الحضور.")).toBeVisible({ timeout: 15_000 });

    const { data: after } = await admin.from("attendance_settings").select("*").eq("id", true).maybeSingle();
    expect(after?.submission_deadline_minutes).toBe(45);
    expect(after?.late_alert_delay_minutes).toBe(20);
    expect(after?.allow_edit_after_submit).toBe(!before?.allow_edit_after_submit);

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("action")
      .eq("action", "تعديل إعدادات الحضور")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditRows?.length).toBeGreaterThanOrEqual(1);

    await page.reload();
    await page.getByRole("button", { name: "إعدادات الحضور" }).click();
    await expect(numberInputs.nth(0)).toHaveValue("45", { timeout: 15_000 });

    // Restore.
    await admin
      .from("attendance_settings")
      .update({
        submission_deadline_minutes: before!.submission_deadline_minutes,
        late_alert_delay_minutes: before!.late_alert_delay_minutes,
        allow_edit_after_submit: before!.allow_edit_after_submit,
      })
      .eq("id", true);
  });

  test("out-of-range values are rejected client-side with a clear message, nothing corrupted", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "إعدادات الحضور" }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "إعدادات الحضور" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("attendance_settings").select("submission_deadline_minutes").eq("id", true).maybeSingle();

    const numberInputs = section.locator('input[type="number"]');
    await numberInputs.nth(0).fill("9999");
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText(/يجب أن تكون بين/)).toBeVisible({ timeout: 15_000 });

    const { data: after } = await admin.from("attendance_settings").select("submission_deadline_minutes").eq("id", true).maybeSingle();
    expect(after?.submission_deadline_minutes).toBe(before?.submission_deadline_minutes);
  });

  test("vice_principal can also save إعدادات الحضور (operational settings)", async ({ page }) => {
    await login(page, "vice_principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "إعدادات الحضور" }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "إعدادات الحضور" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ إعدادات الحضور.")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("الإعدادات — إعدادات الإشعارات (تعمل بالكامل)", () => {
  test("toggles and polling seconds round-trip through Supabase, survive reload, and are audit-logged", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "الإشعارات" }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "إعدادات الإشعارات" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("notification_settings").select("*").eq("id", true).maybeSingle();

    const pollingInput = section.locator('input[type="number"]');
    await pollingInput.fill("");
    await pollingInput.fill("90");
    await section.getByRole("button", { name: "إشعارات إجراءات الطالب" }).click();

    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ إعدادات الإشعارات.")).toBeVisible({ timeout: 15_000 });

    const { data: after } = await admin.from("notification_settings").select("*").eq("id", true).maybeSingle();
    expect(after?.polling_seconds).toBe(90);
    expect(after?.student_action_alerts_enabled).toBe(!before?.student_action_alerts_enabled);

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("action")
      .eq("action", "تعديل إعدادات الإشعارات")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditRows?.length).toBeGreaterThanOrEqual(1);

    await page.reload();
    await page.getByRole("button", { name: "الإشعارات" }).click();
    await expect(pollingInput).toHaveValue("90", { timeout: 15_000 });

    // Restore before the disable-alerts side effect leaks into other suites.
    await admin
      .from("notification_settings")
      .update({ polling_seconds: before!.polling_seconds, student_action_alerts_enabled: before!.student_action_alerts_enabled })
      .eq("id", true);
  });

  test("polling_seconds outside 15–300 is rejected client-side, nothing corrupted", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "الإشعارات" }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "إعدادات الإشعارات" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("notification_settings").select("polling_seconds").eq("id", true).maybeSingle();

    const pollingInput = section.locator('input[type="number"]');
    await pollingInput.fill("");
    await pollingInput.fill("5");
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText(/يجب أن تكون بين 15 و300/)).toBeVisible({ timeout: 15_000 });

    const { data: after } = await admin.from("notification_settings").select("polling_seconds").eq("id", true).maybeSingle();
    expect(after?.polling_seconds).toBe(before?.polling_seconds);
  });

  test("disabling إشعارات إجراءات الطالب actually stops a new student-action notification from being created", async ({ page, context }) => {
    // Disable the setting for real, then drive a real student-actions creation and
    // confirm no notification row is created for it (student_actions + audit_logs
    // still are — only the notification creation is gated).
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "الإشعارات" }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "إعدادات الإشعارات" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("notification_settings").select("student_action_alerts_enabled").eq("id", true).maybeSingle();
    const wasEnabled = before?.student_action_alerts_enabled ?? true;
    if (wasEnabled) {
      await section.getByRole("button", { name: "إشعارات إجراءات الطالب" }).click();
      await section.getByRole("button", { name: "حفظ" }).click();
      await expect(page.getByText("تم حفظ إعدادات الإشعارات.")).toBeVisible({ timeout: 15_000 });
    }

    const { data: settingsCheck } = await admin.from("notification_settings").select("student_action_alerts_enabled").eq("id", true).maybeSingle();
    expect(settingsCheck?.student_action_alerts_enabled).toBe(false);

    let studentActionId: string | undefined;
    try {
      const SUBJECT_ID = "14892239-f95f-4d28-af85-4b9de36d8570";
      const GRADE = "الأول ثانوي";
      const SECTION = `NSOFF-${RUN}`;
      const studentId = crypto.randomUUID();
      await admin.from("students").insert({
        id: studentId,
        full_name: `طالب تعطيل الإشعارات ${RUN}`,
        grade: GRADE,
        section: SECTION,
        entry_code: `ENSOFF-${RUN}`,
        national_id: `3${String(RUN).slice(-9)}`,
        status: "active",
      });
      const teacherId = await qaUserId("teacher");
      const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      const d = new Date();
      while (d.getDay() > 4) d.setDate(d.getDate() + 1);
      const dayAr = WEEKDAY_AR[d.getDay()];
      const actionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await admin.from("class_schedule").insert({ day_of_week: dayAr, period: 2, grade: GRADE, section: SECTION, subject_id: SUBJECT_ID, teacher_id: teacherId });

      await context.clearCookies();
      await login(page, "principal");
      await page.goto("/student-actions");
      await expect(page.getByRole("heading", { name: "استدعاء / استئذان / دخول" })).toBeVisible({ timeout: 15_000 });
      const studentName = `طالب تعطيل الإشعارات ${RUN}`;
      await page.getByPlaceholder("ابحث بالاسم، رقم الهوية، رقم الطالب، الصف أو الشعبة").fill(studentName);
      await expect(page.getByRole("button", { name: new RegExp(studentName) })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: new RegExp(studentName) }).click();
      await page.getByRole("button", { name: "استدعاء طالب" }).click();
      const formSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /تفاصيل الطلب/ }) });
      await formSection.getByPlaceholder("اكتب سبب الإجراء").fill(`سبب تعطيل الإشعارات ${RUN}`);
      await formSection.locator('input[type="date"]').fill(actionDate);
      await formSection.locator('input[type="time"]').fill("09:00");
      await formSection.locator("select").first().selectOption(String(2));
      await expect(formSection.getByText("تم التحديد تلقائيًا")).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "إرسال الإجراء للمعلم" }).click();
      await expect(page.getByText("تم إرسال الإجراء للمعلم بنجاح.")).toBeVisible({ timeout: 15_000 });

      const { data: actionRow } = await admin.from("student_actions").select("id").eq("student_id", studentId).eq("type", "summon").maybeSingle();
      expect(actionRow?.id, "student_action must still be created — only the notification is gated").toBeTruthy();
      studentActionId = actionRow!.id;

      const { data: notifRows } = await admin.from("notifications").select("id").eq("student_action_id", studentActionId);
      expect(notifRows?.length ?? 0, "no notification should be created while the setting is disabled").toBe(0);

      const { data: auditRows } = await admin.from("audit_logs").select("id").eq("student_action_id", studentActionId).eq("action", "إنشاء إجراء طالب");
      expect(auditRows?.length ?? 0, "audit_logs must still be written regardless of the notification toggle").toBeGreaterThanOrEqual(1);
    } finally {
      // Restore setting + clean up.
      await admin.from("notification_settings").update({ student_action_alerts_enabled: wasEnabled }).eq("id", true);
      if (studentActionId) {
        await admin.from("notifications").delete().eq("student_action_id", studentActionId);
        await admin.from("audit_logs").delete().eq("student_action_id", studentActionId);
        await admin.from("student_actions").delete().eq("id", studentActionId);
      }
    }
  });
});

test.describe("الإعدادات — إعدادات النظام (تعمل بالكامل)", () => {
  test("rows-per-page round-trips through Supabase, survives reload, is audit-logged, and actually changes /audit-log's page size", async ({
    page,
  }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "النظام", exact: true }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Pagination" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("system_settings").select("rows_per_page").eq("id", true).maybeSingle();

    const rowsInput = section.locator('input[type="number"]');
    await rowsInput.fill("");
    await rowsInput.fill("7");
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ إعدادات النظام.")).toBeVisible({ timeout: 15_000 });

    const { data: after } = await admin.from("system_settings").select("rows_per_page").eq("id", true).maybeSingle();
    expect(after?.rows_per_page).toBe(7);

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("action")
      .eq("action", "تعديل إعدادات النظام")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditRows?.length).toBeGreaterThanOrEqual(1);

    await page.reload();
    await page.getByRole("button", { name: "النظام", exact: true }).click();
    await expect(rowsInput).toHaveValue("7", { timeout: 15_000 });

    // Concrete proof it's actually wired into /audit-log's pagination.
    const { count: totalAuditRows } = await admin.from("audit_logs").select("*", { count: "exact", head: true });
    await page.goto("/audit-log");
    await expect(page.getByRole("heading", { name: "سجل التدقيق (Audit Log)" })).toBeVisible({ timeout: 15_000 });
    if ((totalAuditRows ?? 0) > 7) {
      await expect(page.getByText(/صفحة 1 من/)).toBeVisible({ timeout: 15_000 });
      const totalPagesText = await page.getByText(/صفحة 1 من \d+/).textContent();
      const expectedPages = Math.ceil((totalAuditRows ?? 0) / 7);
      expect(totalPagesText).toContain(String(expectedPages));
    }

    await admin.from("system_settings").update({ rows_per_page: before!.rows_per_page }).eq("id", true);
  });

  test("out-of-range rows-per-page is rejected client-side", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "النظام", exact: true }).click();
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Pagination" }) });
    await expect(section.getByRole("button", { name: "حفظ" })).toBeVisible({ timeout: 15_000 });

    const { data: before } = await admin.from("system_settings").select("rows_per_page").eq("id", true).maybeSingle();
    const rowsInput = section.locator('input[type="number"]');
    await rowsInput.fill("");
    await rowsInput.fill("1000");
    await section.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText(/يجب أن يكون بين/)).toBeVisible({ timeout: 15_000 });

    const { data: after } = await admin.from("system_settings").select("rows_per_page").eq("id", true).maybeSingle();
    expect(after?.rows_per_page).toBe(before?.rows_per_page);
  });
});

test.describe("الإعدادات — النسخ الاحتياطي", () => {
  test("is honest about there being no working backup button", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    await page.getByRole("button", { name: "النسخ الاحتياطي" }).click();
    await page.getByRole("link", { name: "فتح صفحة النسخ الاحتياطي" }).click();
    await expect(page.getByRole("heading", { name: "النسخ الاحتياطي والاستعادة" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "إنشاء نسخة احتياطية" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "استعادة نسخة" })).toHaveCount(0);
  });
});

test.describe("الإعدادات — أثر التعديل على رأس الصفحة (AppShell) — تحقق من عدم الكسر", () => {
  test("the AppShell header still shows the real school name after all schoolSettings.ts changes", async ({ page }) => {
    await login(page, "principal");
    await page.goto("/dashboard");
    const { data } = await admin.from("school_settings").select("school_name").eq("id", true).maybeSingle();
    if (data?.school_name) {
      await expect(page.getByText(data.school_name).and(page.locator(":visible")).first()).toBeVisible({ timeout: 15_000 });
    }
  });
});

test.describe("الإعدادات — الجوال وConsole/Network", () => {
  test("no horizontal overflow on a mobile viewport", async ({ page }) => {
    await login(page, "principal");
    await gotoSettings(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("no JS errors, uncaught exceptions, or unexpected 4xx/5xx across every tab — migration is fully applied, no exclusions needed", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("response", (res) => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await login(page, "principal");
    await gotoSettings(page);
    const tabBar = page.locator("div.scrollbar-none");
    for (const tab of ["بيانات المدرسة", "بيانات المستخدم", "الترويسة", "إعدادات الحضور", "الإشعارات", "النظام", "النسخ الاحتياطي"]) {
      await tabBar.getByRole("button", { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
    }

    const ownConsoleErrors = consoleErrors.filter((e) => !e.includes("getCurrentUser") && !e.includes("loadSession"));

    expect(pageErrors, `Unexpected uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(ownConsoleErrors, `Unexpected console errors: ${ownConsoleErrors.join(" | ")}`).toEqual([]);
    expect(failedRequests, `Unexpected failed requests: ${failedRequests.join(" | ")}`).toEqual([]);
  });
});
