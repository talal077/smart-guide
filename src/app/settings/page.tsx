"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  DatabaseBackup,
  FileImage,
  KeyRound,
  Layout,
  Loader2,
  School,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { type AppUser, getCurrentUser } from "@/lib/auth";
import {
  ACADEMIC_TERMS,
  type AcademicTerm,
  type AcademicYear,
  type EducationAdministration,
  type ReportHeader,
  type SchoolStage,
  getAcademicYears,
  getEducationAdministrations,
  getReportHeader,
  getSchoolSettings,
  getSchoolStages,
  saveSchoolSettings,
  uploadSchoolLogo,
} from "@/lib/schoolSettings";
import {
  type AttendanceSettings,
  getAttendanceSettings,
  saveAttendanceSettings,
  validateAttendanceSettings,
} from "@/lib/attendanceSettings";
import {
  MAX_POLLING_SECONDS,
  MIN_POLLING_SECONDS,
  type NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
} from "@/lib/notificationSettings";
import {
  MAX_ROWS_PER_PAGE,
  MIN_ROWS_PER_PAGE,
  type SystemSettings,
  getSystemSettings,
  saveSystemSettings,
} from "@/lib/systemSettings";
import { type MyAssignment, changeMyPassword, getMyAssignments, updateMyFullName, validatePasswordStrength } from "@/lib/userProfile";
import { writeAuditLog } from "@/lib/auditLog";

const MANAGER_ROLES = ["principal", "admin", "vice_principal"];
const SCHOOL_EDIT_ROLES = ["principal", "admin"];
const ROLE_LABELS: Record<string, string> = {
  principal: "مدير",
  admin: "إداري",
  vice_principal: "وكيل",
  teacher: "معلم",
  student: "طالب",
};

type TabId = "school" | "user" | "header" | "attendance" | "notifications" | "system" | "backup";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

function Message({ kind, text }: { kind: "success" | "error"; text: string }) {
  return (
    <div className={`rounded-2xl p-3 text-sm font-bold ${kind === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {text}
    </div>
  );
}

function SaveButton({ saving, onClick, disabled }: { saving: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
    >
      {saving ? <Loader2 size={16} className="animate-spin" /> : null}
      {saving ? "جارٍ الحفظ..." : "حفظ"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400";

export default function SettingsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [tab, setTab] = useState<TabId>("user");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAccess() {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        if (user.role === "student") {
          router.replace("/dashboard");
          return;
        }
        setCurrentUser(user);
        setTab(MANAGER_ROLES.includes(user.role) ? "school" : "user");
      } catch (err) {
        if (!cancelled) setAccessError(getErrorMessage(err));
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    }
    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function changeTab(next: TabId) {
    if (dirty && !window.confirm("لديك تغييرات غير محفوظة في هذا القسم، هل تريد المغادرة دون حفظ؟")) return;
    setDirty(false);
    setTab(next);
  }

  if (checkingAccess) {
    return (
      <div className="space-y-4 p-4" dir="rtl">
        <div className="h-24 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="p-4" dir="rtl">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-bold text-red-700">تعذر التحقق من صلاحيات الوصول لهذه الصفحة.</p>
          <p className="mt-2 text-sm text-red-600">{accessError}</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const isManager = MANAGER_ROLES.includes(currentUser.role);

  const tabs: { id: TabId; label: string; icon: typeof School }[] = [
    ...(isManager ? [{ id: "school" as TabId, label: "بيانات المدرسة", icon: School }] : []),
    { id: "user" as TabId, label: "بيانات المستخدم", icon: UserRound },
    ...(isManager ? [{ id: "header" as TabId, label: "الترويسة", icon: Layout }] : []),
    ...(isManager ? [{ id: "attendance" as TabId, label: "إعدادات الحضور", icon: Building2 }] : []),
    ...(isManager ? [{ id: "notifications" as TabId, label: "الإشعارات", icon: Bell }] : []),
    ...(isManager ? [{ id: "system" as TabId, label: "النظام", icon: SettingsIcon }] : []),
    ...(SCHOOL_EDIT_ROLES.includes(currentUser.role) ? [{ id: "backup" as TabId, label: "النسخ الاحتياطي", icon: DatabaseBackup }] : []),
  ];

  return (
    <div className="space-y-4 p-4 pb-10" dir="rtl">
      <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <p className="flex items-center gap-2 text-sm font-bold text-blue-700">
          <SettingsIcon size={16} /> الإعدادات
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">مركز إعدادات النظام</h1>
        <p className="mt-2 text-sm text-slate-500">
          مسجَّل الدخول باسم <b>{currentUser.full_name}</b> ({ROLE_LABELS[currentUser.role] ?? currentUser.role})
        </p>
      </header>

      <div className="scrollbar-none flex gap-2 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm border border-slate-100">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => changeTab(item.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold whitespace-nowrap ${
                active ? "bg-blue-700 text-white" : "bg-slate-50 text-slate-600"
              }`}
            >
              <Icon size={15} /> {item.label}
            </button>
          );
        })}
      </div>

      {dirty ? (
        <div className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">
          لديك تغييرات غير محفوظة في هذا القسم — لن تُحفظ إلا بالضغط على زر الحفظ.
        </div>
      ) : null}

      {tab === "school" && isManager ? (
        <SchoolSection currentUser={currentUser} canEdit={SCHOOL_EDIT_ROLES.includes(currentUser.role)} onDirtyChange={setDirty} />
      ) : null}
      {tab === "user" ? <UserSection currentUser={currentUser} onDirtyChange={setDirty} /> : null}
      {tab === "header" && isManager ? <HeaderSection /> : null}
      {tab === "attendance" && isManager ? <AttendanceSection currentUser={currentUser} onDirtyChange={setDirty} /> : null}
      {tab === "notifications" && isManager ? <NotificationsSection currentUser={currentUser} onDirtyChange={setDirty} /> : null}
      {tab === "system" && isManager ? <SystemSection currentUser={currentUser} onDirtyChange={setDirty} /> : null}
      {tab === "backup" && SCHOOL_EDIT_ROLES.includes(currentUser.role) ? (
        <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <h2 className="text-lg font-black text-slate-900">النسخ الاحتياطي والاستعادة</h2>
          <p className="mt-2 text-sm text-slate-500">
            هذا القسم منقول إلى صفحة مستقلة توضّح الوضع الحقيقي لإدارة النسخ الاحتياطية.
          </p>
          <Link href="/backup" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            <DatabaseBackup size={16} /> فتح صفحة النسخ الاحتياطي
          </Link>
        </section>
      ) : null}
    </div>
  );
}

// ==================================================================================
// أ) بيانات المدرسة
// ==================================================================================

function SchoolSection({
  currentUser,
  canEdit,
  onDirtyChange,
}: {
  currentUser: AppUser;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [administrations, setAdministrations] = useState<EducationAdministration[]>([]);
  const [stages, setStages] = useState<SchoolStage[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);

  const [educationAdministrationId, setEducationAdministrationId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [stageId, setStageId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [academicTerm, setAcademicTerm] = useState<AcademicTerm | "">("");
  const [isActive, setIsActive] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const original = useRef<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [admins, stageList, yearList, settings] = await Promise.all([
        getEducationAdministrations(),
        getSchoolStages(),
        getAcademicYears(),
        getSchoolSettings(),
      ]);
      setAdministrations(admins);
      setStages(stageList);
      setYears(yearList);
      if (settings) {
        setEducationAdministrationId(settings.educationAdministrationId);
        setSchoolName(settings.schoolName);
        setStageId(settings.stageId);
        setAcademicYearId(settings.academicYearId);
        setAcademicTerm(settings.academicTerm ?? "");
        setIsActive(settings.isActive);
        setLogoUrl(settings.logoUrl);
        original.current = JSON.stringify({
          educationAdministrationId: settings.educationAdministrationId,
          schoolName: settings.schoolName,
          stageId: settings.stageId,
          academicYearId: settings.academicYearId,
          academicTerm: settings.academicTerm ?? "",
          isActive: settings.isActive,
        });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const current = JSON.stringify({ educationAdministrationId, schoolName, stageId, academicYearId, academicTerm, isActive });
    onDirtyChange(canEdit && original.current !== "" && current !== original.current);
  }, [educationAdministrationId, schoolName, stageId, academicYearId, academicTerm, isActive, canEdit, onDirtyChange]);

  function handleStageChange(nextStageId: string) {
    if (nextStageId === stageId) return;
    if (window.confirm("تغيير المرحلة الدراسية قد يؤثر على الصفوف والإسنادات الحالية، هل أنت متأكد؟")) setStageId(nextStageId);
  }

  function handleYearChange(nextYearId: string) {
    if (nextYearId === academicYearId) return;
    if (window.confirm("سيصبح هذا العام الدراسي هو العام الافتراضي لجميع العمليات الجديدة. متابعة؟")) setAcademicYearId(nextYearId);
  }

  function handleActiveToggle(next: boolean) {
    if (next === isActive) return;
    if (!next && !window.confirm("سيؤدي إيقاف المدرسة إلى تعليق حالتها في النظام. هل أنت متأكد؟")) return;
    setIsActive(next);
  }

  async function handleLogoUpload(file: File) {
    setUploadingLogo(true);
    setMessage(null);
    try {
      const url = await uploadSchoolLogo(file);
      const { error: saveErr } = await saveSchoolSettings({
        educationAdministrationId,
        schoolName: schoolName.trim(),
        stageId,
        academicYearId,
        logoUrl: url,
      });
      if (saveErr) throw saveErr;
      setLogoUrl(url);
      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "رفع شعار المدرسة",
        details: "تم تحديث شعار المدرسة.",
      });
      setMessage({ kind: "success", text: "تم رفع الشعار وحفظه بنجاح." });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (saving) return;
    setMessage(null);
    if (!educationAdministrationId || !schoolName.trim() || !stageId || !academicYearId) {
      setMessage({ kind: "error", text: "يرجى تعبئة جميع بيانات المدرسة الإلزامية." });
      return;
    }

    setSaving(true);
    try {
      const before = JSON.parse(original.current || "{}");
      const { error: saveErr, extendedFieldsSkipped } = await saveSchoolSettings({
        educationAdministrationId,
        schoolName: schoolName.trim(),
        stageId,
        academicYearId,
        academicTerm: academicTerm || null,
        isActive,
      });
      if (saveErr) throw saveErr;

      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "تعديل بيانات المدرسة",
        details: `${schoolName.trim()} — ${academicTerm || "-"}`,
        oldValues: before,
        newValues: { educationAdministrationId, schoolName: schoolName.trim(), stageId, academicYearId, academicTerm, isActive },
      });

      setMessage(
        extendedFieldsSkipped
          ? {
              kind: "success",
              text: "تم حفظ اسم المدرسة والإدارة والمرحلة والعام الدراسي. الفصل الدراسي وحالة النشاط لم يُحفظا لأن قاعدة البيانات تحتاج تحديثًا (Migration) لم يُطبَّق بعد.",
            }
          : { kind: "success", text: "تم حفظ بيانات المدرسة." }
      );
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-900">بيانات المدرسة</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {isActive ? "نشطة" : "موقوفة"}
        </span>
      </div>
      <p className="mt-1 text-xs font-bold text-slate-500">
        {canEdit ? "يمكنك تعديل بيانات المدرسة من هنا." : "لا تملك صلاحية تعديل بيانات المدرسة — عرض فقط."}
      </p>

      {error ? <div className="mt-3"><Message kind="error" text={error} /></div> : null}

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="شعار المدرسة" className="h-full w-full object-contain" />
              ) : (
                <FileImage size={28} className="text-slate-300" />
              )}
            </div>
            {canEdit ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleLogoUpload(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"
                >
                  {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <FileImage size={13} />}
                  {logoUrl ? "استبدال الشعار" : "رفع شعار المدرسة"}
                </button>
                <p className="mt-1 text-[11px] text-slate-400">PNG / JPEG / WEBP فقط، حتى 2 ميجابايت.</p>
              </div>
            ) : null}
          </div>

          <Field label="الإدارة التعليمية *">
            <select value={educationAdministrationId} onChange={(e) => setEducationAdministrationId(e.target.value)} disabled={!canEdit} className={inputClass}>
              <option value="">اختر الإدارة التعليمية</option>
              {administrations.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </Field>

          <Field label="اسم المدرسة *">
            <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} disabled={!canEdit} className={inputClass} />
          </Field>

          <Field label="المرحلة الدراسية *">
            <select value={stageId} onChange={(e) => handleStageChange(e.target.value)} disabled={!canEdit} className={inputClass}>
              <option value="">اختر المرحلة الدراسية</option>
              {stages.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="العام الدراسي *">
              <select value={academicYearId} onChange={(e) => handleYearChange(e.target.value)} disabled={!canEdit} className={inputClass}>
                <option value="">اختر العام الدراسي</option>
                {years.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </Field>

            <Field label="الفصل الدراسي">
              <select value={academicTerm} onChange={(e) => setAcademicTerm(e.target.value as AcademicTerm)} disabled={!canEdit} className={inputClass}>
                <option value="">غير محدد</option>
                {ACADEMIC_TERMS.map((term) => (
                  <option key={term} value={term}>{term}</option>
                ))}
              </select>
            </Field>
          </div>

          {canEdit ? (
            <button
              type="button"
              onClick={() => handleActiveToggle(!isActive)}
              className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-right w-full"
            >
              <div>
                <p className="font-bold text-slate-900">حالة المدرسة</p>
                <p className="mt-1 text-xs text-slate-500">إيقاف المدرسة يُعلّق حالتها في النظام.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {isActive ? "نشطة" : "موقوفة"}
              </span>
            </button>
          ) : null}

          {message ? <Message kind={message.kind} text={message.text} /> : null}

          {canEdit ? (
            <div className="flex gap-3 pt-2">
              <SaveButton saving={saving} onClick={() => void handleSave()} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ==================================================================================
// ب) بيانات المستخدم
// ==================================================================================

function UserSection({ currentUser, onDirtyChange }: { currentUser: AppUser; onDirtyChange: (dirty: boolean) => void }) {
  const [fullName, setFullName] = useState(currentUser.full_name);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(currentUser.role === "teacher");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (currentUser.role !== "teacher") return;
    let cancelled = false;
    getMyAssignments(currentUser.id)
      .then((rows) => {
        if (!cancelled) setAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    onDirtyChange(fullName.trim() !== currentUser.full_name.trim());
  }, [fullName, currentUser.full_name, onDirtyChange]);

  const passwordStrengthHint = useMemo(() => (newPassword ? validatePasswordStrength(newPassword) : null), [newPassword]);

  async function handleSaveName() {
    if (savingName) return;
    setNameMessage(null);
    if (!fullName.trim()) {
      setNameMessage({ kind: "error", text: "الاسم مطلوب." });
      return;
    }
    setSavingName(true);
    try {
      await updateMyFullName(currentUser.id, fullName);
      await writeAuditLog({
        actorId: currentUser.id,
        actorName: fullName.trim(),
        actorRole: currentUser.role,
        action: "تعديل البيانات الشخصية",
        details: "تحديث الاسم الظاهر.",
        oldValues: { full_name: currentUser.full_name },
        newValues: { full_name: fullName.trim() },
      });
      setNameMessage({ kind: "success", text: "تم حفظ الاسم بنجاح." });
    } catch (err) {
      setNameMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword() {
    if (changingPassword) return;
    setPasswordMessage(null);
    setChangingPassword(true);
    try {
      await changeMyPassword(newPassword, confirmPassword);
      // Never log the password value itself — only that the event happened.
      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "تغيير كلمة المرور",
        details: "تم تغيير كلمة المرور من صفحة الإعدادات.",
      });
      setPasswordMessage({ kind: "success", text: "تم تغيير كلمة المرور بنجاح." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <h2 className="text-lg font-black text-slate-900">بيانات المستخدم</h2>

        <div className="mt-4 space-y-4">
          <Field label="الاسم">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الدور">
              <p className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm font-bold text-slate-700">
                {ROLE_LABELS[currentUser.role] ?? currentUser.role}
              </p>
            </Field>
            <Field label="البريد الإلكتروني">
              <p className="truncate rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm font-bold text-slate-700">
                {currentUser.email ?? "—"}
              </p>
            </Field>
          </div>

          {currentUser.role === "teacher" ? (
            <Field label="المادة والشعب المسندة">
              {loadingAssignments ? (
                <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              ) : assignments.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">لا توجد إسنادات حاليًا.</p>
              ) : (
                <div className="space-y-1.5">
                  {assignments.map((a, i) => (
                    <p key={i} className="rounded-xl bg-slate-50 p-2.5 text-xs font-bold text-slate-700">
                      {a.subjectName} — {a.grade} / {a.section}
                    </p>
                  ))}
                </div>
              )}
            </Field>
          ) : null}

          {nameMessage ? <Message kind={nameMessage.kind} text={nameMessage.text} /> : null}

          <SaveButton saving={savingName} onClick={() => void handleSaveName()} disabled={fullName.trim() === currentUser.full_name.trim()} />
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
          <KeyRound size={18} /> تغيير كلمة المرور
        </h2>
        <p className="mt-1 text-xs text-slate-500">كلمة المرور الحالية غير معروضة لأسباب أمنية.</p>

        <div className="mt-4 space-y-4">
          <Field label="كلمة المرور الجديدة">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
            {passwordStrengthHint ? <p className="mt-1 text-xs font-bold text-amber-600">{passwordStrengthHint}</p> : null}
          </Field>
          <Field label="إعادة كتابة كلمة المرور">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>

          {passwordMessage ? <Message kind={passwordMessage.kind} text={passwordMessage.text} /> : null}

          <SaveButton
            saving={changingPassword}
            onClick={() => void handleChangePassword()}
            disabled={!newPassword || !confirmPassword}
          />
        </div>
      </section>
    </div>
  );
}

// ==================================================================================
// ج) الترويسة والتصدير
// ==================================================================================

function HeaderSection() {
  const [header, setHeader] = useState<ReportHeader | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getReportHeader()
      .then((h) => {
        if (!cancelled) setHeader(h);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
      <h2 className="text-lg font-black text-slate-900">الترويسة الرسمية</h2>
      <p className="mt-1 text-xs font-bold text-slate-500">
        هذه هي الترويسة الموحدة المبنية من بيانات المدرسة، وهي المصدر المركزي الوحيد المفترض استخدامه في كل تصدير رسمي.
      </p>

      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : !header ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">أكمل بيانات المدرسة أولًا لعرض الترويسة.</p>
      ) : (
        <div dir="rtl" className="mt-4 rounded-2xl border border-slate-200 p-5 text-center">
          <div className="flex items-center justify-center gap-3">
            {header.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={header.logoUrl} alt="شعار المدرسة" className="h-12 w-12 object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <School size={22} />
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500">{header.ministryName}</p>
              <p className="text-xs text-slate-500">{header.educationAdministrationName || "—"}</p>
            </div>
          </div>
          <h3 className="mt-3 text-lg font-black text-slate-900">{header.schoolName}</h3>
          <p className="mt-1 text-sm font-bold text-slate-600">
            {header.academicYearLabel} {header.academicTerm ? `— ${header.academicTerm}` : ""}
          </p>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
        ملاحظة: هذه الصفحة تُنشئ المصدر المركزي للترويسة فقط. ربطها الفعلي داخل ملفات PDF وExcel لصفحات التقارير
        والتحليلات وتحضير الحصص يتطلب تعديل تلك الصفحات تحديدًا، وهو خارج نطاق مراجعة &quot;الإعدادات&quot; الحالية.
      </div>
    </section>
  );
}

// ==================================================================================
// د) إعدادات الحضور
// ==================================================================================

const ATTENDANCE_STATUS_FIELDS: { key: keyof Pick<AttendanceSettings, "presentColor" | "absentColor" | "lateColor" | "excusedColor">; label: string }[] = [
  { key: "presentColor", label: "حاضر" },
  { key: "absentColor", label: "غائب" },
  { key: "lateColor", label: "متأخر" },
  { key: "excusedColor", label: "مستأذن" },
];

function AttendanceSection({ currentUser, onDirtyChange }: { currentUser: AppUser; onDirtyChange: (dirty: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<AttendanceSettings | null>(null);
  const original = useRef<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getAttendanceSettings();
      if (!settings) {
        setNotFound(true);
      } else {
        setForm(settings);
        original.current = JSON.stringify(settings);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onDirtyChange(!!form && original.current !== "" && JSON.stringify(form) !== original.current);
  }, [form, onDirtyChange]);

  async function handleSave() {
    if (saving || !form) return;
    setMessage(null);
    const validationError = validateAttendanceSettings(form);
    if (validationError) {
      setMessage({ kind: "error", text: validationError });
      return;
    }
    setSaving(true);
    try {
      const before = JSON.parse(original.current);
      const { error } = await saveAttendanceSettings({ ...form, actorId: currentUser.id });
      if (error) throw error;
      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "تعديل إعدادات الحضور",
        details: "تحديث ألوان الحالات وسياسات التحضير.",
        oldValues: before,
        newValues: form,
      });
      setMessage({ kind: "success", text: "تم حفظ إعدادات الحضور." });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </section>
    );
  }

  if (notFound || !form) {
    return (
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <h2 className="text-lg font-black text-slate-900">إعدادات الحضور</h2>
        <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          هذا القسم يحتاج جدول <code dir="ltr">attendance_settings</code> الذي يُضاف عبر Migration مستقل لم يُطبَّق على
          قاعدة البيانات بعد.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
      <h2 className="text-lg font-black text-slate-900">إعدادات الحضور</h2>
      <p className="mt-1 text-xs text-amber-700">
        هذه الإعدادات تُحفظ في Supabase، لكنها غير مربوطة حاليًا بصفحة تحضير الحصص/سجل الغياب (خارج نطاق هذه المراجعة).
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-bold text-slate-600">ألوان حالات الحضور</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ATTENDANCE_STATUS_FIELDS.map(({ key, label }) => (
              <div key={key} className="rounded-2xl border border-slate-200 p-3 text-center">
                <input
                  type="color"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="h-10 w-full cursor-pointer rounded-lg"
                  aria-label={`لون ${label}`}
                />
                <p className="mt-1 text-xs font-bold text-slate-600">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="المهلة الزمنية لرفع التحضير (دقيقة)">
            <input
              type="number"
              min={1}
              max={240}
              value={form.submissionDeadlineMinutes}
              onChange={(e) => setForm({ ...form, submissionDeadlineMinutes: Number(e.target.value) })}
              className={inputClass}
            />
          </Field>
          <Field label="وقت ظهور تنبيه عدم الرفع (دقيقة بعد المهلة)">
            <input
              type="number"
              min={0}
              max={240}
              value={form.lateAlertDelayMinutes}
              onChange={(e) => setForm({ ...form, lateAlertDelayMinutes: Number(e.target.value) })}
              className={inputClass}
            />
          </Field>
        </div>

        <ToggleRow
          label="السماح بالتعديل بعد الإرسال"
          hint="إن عُطِّل، لا يمكن تعديل التحضير بعد إرساله."
          checked={form.allowEditAfterSubmit}
          onChange={(v) => setForm({ ...form, allowEditAfterSubmit: v })}
        />
        <ToggleRow
          label="النسخ من الحصة السابقة"
          hint="السماح بنسخ حالة الحضور من الحصة السابقة لنفس الشعبة."
          checked={form.copyFromPreviousEnabled}
          onChange={(v) => setForm({ ...form, copyFromPreviousEnabled: v })}
        />
        <ToggleRow
          label="جميع الطلاب حاضرون افتراضيًا"
          hint="عند تفعيله، تبدأ كل حصة بافتراض حضور كل الطلاب."
          checked={form.defaultAllPresent}
          onChange={(v) => setForm({ ...form, defaultAllPresent: v })}
        />

        {message ? <Message kind={message.kind} text={message.text} /> : null}
        <SaveButton saving={saving} onClick={() => void handleSave()} />
      </div>
    </section>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-2xl bg-slate-50 p-4 text-right">
      <div>
        <p className="font-bold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${checked ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
        {checked ? "مفعّل" : "معطّل"}
      </span>
    </button>
  );
}

// ==================================================================================
// هـ) إعدادات الإشعارات
// ==================================================================================

function NotificationsSection({ currentUser, onDirtyChange }: { currentUser: AppUser; onDirtyChange: (dirty: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<NotificationSettings | null>(null);
  const original = useRef<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getNotificationSettings();
      if (!settings) {
        setNotFound(true);
      } else {
        setForm(settings);
        original.current = JSON.stringify(settings);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onDirtyChange(!!form && original.current !== "" && JSON.stringify(form) !== original.current);
  }, [form, onDirtyChange]);

  async function handleSave() {
    if (saving || !form) return;
    setMessage(null);
    if (form.pollingSeconds < MIN_POLLING_SECONDS || form.pollingSeconds > MAX_POLLING_SECONDS) {
      setMessage({ kind: "error", text: `مدة التحديث الدوري يجب أن تكون بين ${MIN_POLLING_SECONDS} و${MAX_POLLING_SECONDS} ثانية.` });
      return;
    }
    setSaving(true);
    try {
      const before = JSON.parse(original.current);
      const { error } = await saveNotificationSettings({ ...form, actorId: currentUser.id });
      if (error) throw error;
      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "تعديل إعدادات الإشعارات",
        details: "تحديث تفعيل التنبيهات ومدة التحديث الدوري.",
        oldValues: before,
        newValues: form,
      });
      setMessage({ kind: "success", text: "تم حفظ إعدادات الإشعارات." });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </section>
    );
  }

  if (notFound || !form) {
    return (
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <h2 className="text-lg font-black text-slate-900">إعدادات الإشعارات</h2>
        <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          هذا القسم يحتاج جدول <code dir="ltr">notification_settings</code> الذي يُضاف عبر Migration مستقل لم يُطبَّق
          على قاعدة البيانات بعد.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
      <h2 className="text-lg font-black text-slate-900">إعدادات الإشعارات</h2>

      <div className="mt-4 space-y-3">
        <ToggleRow
          label="إشعارات عدم رفع التحضير"
          hint="لا يوجد حاليًا مولّد فعلي لهذا التنبيه في النظام؛ هذا المفتاح مُخزَّن للاستخدام المستقبلي."
          checked={form.unsubmittedAlertsEnabled}
          onChange={(v) => setForm({ ...form, unsubmittedAlertsEnabled: v })}
        />
        <ToggleRow
          label="إشعارات إجراءات الطالب"
          hint="عند التعطيل، لن تُنشأ إشعارات استدعاء/استئذان/دخول أو إشعار الإلغاء للمعلم (السجل والتدقيق يستمران فعليًا)."
          checked={form.studentActionAlertsEnabled}
          onChange={(v) => setForm({ ...form, studentActionAlertsEnabled: v })}
        />
        <ToggleRow
          label="التنبيهات الإدارية"
          hint="مُخزَّن للاستخدام المستقبلي — لا توجد حاليًا تنبيهات إدارية عامة في النظام."
          checked={form.adminAlertsEnabled}
          onChange={(v) => setForm({ ...form, adminAlertsEnabled: v })}
        />

        <Field label={`مدة التحديث الدوري (${MIN_POLLING_SECONDS}–${MAX_POLLING_SECONDS} ثانية)`}>
          <input
            type="number"
            min={MIN_POLLING_SECONDS}
            max={MAX_POLLING_SECONDS}
            value={form.pollingSeconds}
            onChange={(e) => setForm({ ...form, pollingSeconds: Number(e.target.value) })}
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Realtime غير مفعّل حاليًا على قاعدة البيانات لجدول الإشعارات؛ هذه القيمة تتحكم في فاصل التحديث الدوري
            (Polling) الفعلي المستخدم في جرس الإشعارات وصفحة الإشعارات.
          </p>
        </Field>

        {message ? <Message kind={message.kind} text={message.text} /> : null}
        <SaveButton saving={saving} onClick={() => void handleSave()} />
      </div>
    </section>
  );
}

// ==================================================================================
// و) إعدادات النظام
// ==================================================================================

function SystemSection({ currentUser, onDirtyChange }: { currentUser: AppUser; onDirtyChange: (dirty: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<SystemSettings | null>(null);
  const original = useRef<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getSystemSettings();
      if (!settings) {
        setNotFound(true);
      } else {
        setForm(settings);
        original.current = JSON.stringify(settings);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onDirtyChange(!!form && original.current !== "" && JSON.stringify(form) !== original.current);
  }, [form, onDirtyChange]);

  async function handleSave() {
    if (saving || !form) return;
    setMessage(null);
    if (form.rowsPerPage < MIN_ROWS_PER_PAGE || form.rowsPerPage > MAX_ROWS_PER_PAGE) {
      setMessage({ kind: "error", text: `عدد الصفوف يجب أن يكون بين ${MIN_ROWS_PER_PAGE} و${MAX_ROWS_PER_PAGE}.` });
      return;
    }
    setSaving(true);
    try {
      const before = JSON.parse(original.current);
      const { error } = await saveSystemSettings({ rowsPerPage: form.rowsPerPage, actorId: currentUser.id });
      if (error) throw error;
      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "تعديل إعدادات النظام",
        details: `عدد الصفوف: ${form.rowsPerPage}`,
        oldValues: before,
        newValues: form,
      });
      setMessage({ kind: "success", text: "تم حفظ إعدادات النظام." });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <h2 className="text-lg font-black text-slate-900">إعدادات ثابتة</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoBadge label="اللغة" value="العربية" />
          <InfoBadge label="الاتجاه" value="RTL" />
          <InfoBadge label="المنطقة الزمنية" value="Asia/Riyadh" />
          <InfoBadge label="تنسيق التاريخ" value="يوم/شهر/سنة" />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">هذه القيم بنيوية في النظام حاليًا وليست قابلة للتعديل من هنا.</p>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <h2 className="text-lg font-black text-slate-900">Pagination</h2>

        {loading ? (
          <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-100" />
        ) : notFound || !form ? (
          <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            هذا القسم يحتاج جدول <code dir="ltr">system_settings</code> الذي يُضاف عبر Migration مستقل لم يُطبَّق على
            قاعدة البيانات بعد.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <Field label={`عدد الصفوف في الصفحة (${MIN_ROWS_PER_PAGE}–${MAX_ROWS_PER_PAGE})`}>
              <input
                type="number"
                min={MIN_ROWS_PER_PAGE}
                max={MAX_ROWS_PER_PAGE}
                value={form.rowsPerPage}
                onChange={(e) => setForm({ ...form, rowsPerPage: Number(e.target.value) })}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-slate-400">مربوط حاليًا بصفحة سجل العمليات فقط.</p>
            </Field>

            {message ? <Message kind={message.kind} text={message.text} /> : null}
            <SaveButton saving={saving} onClick={() => void handleSave()} />
          </div>
        )}
      </section>
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-700" dir="ltr">{value}</p>
    </div>
  );
}
