"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarRange, Check, GraduationCap, Loader2, School } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  type AcademicYear,
  type EducationAdministration,
  type SchoolStage,
  getAcademicYears,
  getEducationAdministrations,
  getSchoolStages,
  isSetupComplete,
  saveSchoolSettings,
} from "@/lib/schoolSettings";

const SETUP_ROLES = ["principal", "admin", "vice_principal"];
const TOTAL_STEPS = 5;

type Phase = "checking" | "unauthorized" | "code" | "wizard" | "saving";

export default function SetupWizardPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("checking");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [educationAdministrations, setEducationAdministrations] = useState<EducationAdministration[]>([]);
  const [stages, setStages] = useState<SchoolStage[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  const [step, setStep] = useState(1);
  const [educationAdministrationId, setEducationAdministrationId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [stageId, setStageId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [stepError, setStepError] = useState("");
  const [saveError, setSaveError] = useState("");

  const [setupCode, setSetupCode] = useState("");
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const complete = await isSetupComplete();
      if (complete) {
        router.replace("/dashboard");
        return;
      }

      if (!SETUP_ROLES.includes(user.role)) {
        if (!cancelled) setPhase("unauthorized");
        return;
      }

      try {
        const [administrations, stageList, years] = await Promise.all([
          getEducationAdministrations(),
          getSchoolStages(),
          getAcademicYears(),
        ]);

        if (cancelled) return;

        setEducationAdministrations(administrations);
        setStages(stageList);
        setAcademicYears(years);
        setPhase("code");
      } catch (error: any) {
        if (!cancelled) {
          setLoadError(error?.message || "تعذر تحميل بيانات الإعداد.");
          setPhase("code");
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleVerifyCode() {
    setCodeError("");

    const expectedCode = process.env.NEXT_PUBLIC_SETUP_CODE;

    if (!expectedCode) {
      setCodeError("لم يتم تكوين رمز الإعداد الأولي على الخادم. يرجى التواصل مع مسؤول النظام.");
      return;
    }

    if (setupCode.trim() !== expectedCode) {
      setCodeError("رمز الإعداد غير صحيح.");
      return;
    }

    setPhase("wizard");
  }

  const selectedAdministration = useMemo(
    () => educationAdministrations.find((item) => item.id === educationAdministrationId) ?? null,
    [educationAdministrations, educationAdministrationId]
  );
  const selectedStage = useMemo(() => stages.find((item) => item.id === stageId) ?? null, [stages, stageId]);
  const selectedYear = useMemo(() => academicYears.find((item) => item.id === academicYearId) ?? null, [academicYears, academicYearId]);

  function goNext() {
    setStepError("");

    if (step === 1 && !educationAdministrationId) {
      setStepError("يرجى اختيار الإدارة التعليمية.");
      return;
    }
    if (step === 2 && !schoolName.trim()) {
      setStepError("يرجى إدخال اسم المدرسة.");
      return;
    }
    if (step === 3 && !stageId) {
      setStepError("يرجى اختيار المرحلة الدراسية.");
      return;
    }
    if (step === 4 && !academicYearId) {
      setStepError("يرجى اختيار العام الدراسي.");
      return;
    }

    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  function goBack() {
    setStepError("");
    setStep((current) => Math.max(current - 1, 1));
  }

  async function handleSave() {
    setSaveError("");
    setPhase("saving");

    try {
      const { error } = await saveSchoolSettings({
        educationAdministrationId,
        schoolName: schoolName.trim(),
        stageId,
        academicYearId,
      });

      if (error) throw error;

      router.replace("/dashboard");
    } catch (error: any) {
      setSaveError(error?.message || "حدث خطأ أثناء حفظ بيانات المدرسة.");
      setPhase("wizard");
    }
  }

  if (phase === "checking") {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
          <Loader2 className="animate-spin" size={18} />
          جارٍ التحقق من إعداد النظام...
        </div>
      </main>
    );
  }

  if (phase === "unauthorized") {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <School size={28} />
          </div>
          <h1 className="text-lg font-black text-slate-900">تعذر الوصول</h1>
          <p className="mt-2 text-sm font-bold text-slate-500">
            ليس لديك صلاحية لإعداد بيانات المدرسة. يرجى التواصل مع مدير المدرسة أو مسؤول النظام.
          </p>
        </div>
      </main>
    );
  }

  if (phase === "code") {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <School size={28} />
          </div>
          <h1 className="text-center text-lg font-black text-slate-900">رمز الإعداد الأولي</h1>
          <p className="mt-2 text-center text-sm font-bold text-slate-500">
            أدخل رمز الإعداد الأولي للمتابعة إلى إعداد بيانات المدرسة.
          </p>

          {loadError ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{loadError}</div> : null}

          <div className="mt-5">
            <label className="mb-2 block text-sm font-black text-slate-700">رمز الإعداد</label>
            <input
              type="password"
              value={setupCode}
              onChange={(event) => setSetupCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleVerifyCode();
              }}
              placeholder="أدخل رمز الإعداد"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            {codeError ? <p className="mt-2 text-sm font-bold text-red-600">{codeError}</p> : null}

            <button
              type="button"
              onClick={handleVerifyCode}
              className="mt-4 w-full rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800"
            >
              متابعة
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <School size={28} />
          </div>
          <h1 className="text-xl font-black text-slate-900">إعداد النظام لأول مرة</h1>
          <p className="mt-1 text-sm font-bold text-slate-500">أكمل بيانات المدرسة للمتابعة إلى لوحة التحكم.</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((dot) => (
            <span
              key={dot}
              className={`h-2 flex-1 rounded-full ${dot <= step ? "bg-blue-700" : "bg-slate-200"}`}
            />
          ))}
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
          {loadError ? <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{loadError}</div> : null}

          {step === 1 ? (
            <StepShell icon={<Building2 size={20} />} title="الإدارة التعليمية" subtitle="اختر الإدارة التعليمية التابعة لها المدرسة.">
              <select
                value={educationAdministrationId}
                onChange={(event) => setEducationAdministrationId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">اختر الإدارة التعليمية</option>
                {educationAdministrations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </StepShell>
          ) : null}

          {step === 2 ? (
            <StepShell icon={<School size={20} />} title="اسم المدرسة" subtitle="أدخل الاسم الرسمي للمدرسة.">
              <input
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
                placeholder="مثال: ثانوية الأمير عبدالمجيد بن عبدالعزيز"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </StepShell>
          ) : null}

          {step === 3 ? (
            <StepShell icon={<GraduationCap size={20} />} title="المرحلة الدراسية" subtitle="اختر مرحلة واحدة فقط.">
              <div className="grid grid-cols-1 gap-2">
                {stages.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStageId(item.id)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-black transition ${
                      stageId === item.id
                        ? "border-blue-700 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {item.name}
                    {stageId === item.id ? <Check size={18} /> : null}
                  </button>
                ))}
              </div>
            </StepShell>
          ) : null}

          {step === 4 ? (
            <StepShell icon={<CalendarRange size={20} />} title="العام الدراسي" subtitle="يمكن تغييره لاحقًا من صفحة الإعدادات.">
              <select
                value={academicYearId}
                onChange={(event) => setAcademicYearId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">اختر العام الدراسي</option>
                {academicYears.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </StepShell>
          ) : null}

          {step === 5 ? (
            <StepShell icon={<Check size={20} />} title="مراجعة البيانات" subtitle="تأكد من صحة البيانات قبل الحفظ.">
              <div className="space-y-3">
                <ReviewRow label="الإدارة التعليمية" value={selectedAdministration?.name ?? "-"} />
                <ReviewRow label="اسم المدرسة" value={schoolName || "-"} />
                <ReviewRow label="المرحلة الدراسية" value={selectedStage?.name ?? "-"} />
                <ReviewRow label="العام الدراسي" value={selectedYear?.label ?? "-"} />
              </div>
              {saveError ? <p className="mt-3 text-sm font-bold text-red-600">{saveError}</p> : null}
            </StepShell>
          ) : null}

          {stepError ? <p className="mt-3 text-sm font-bold text-red-600">{stepError}</p> : null}

          <div className="mt-6 flex gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                disabled={phase === "saving"}
                className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-60"
              >
                السابق
              </button>
            ) : null}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800"
              >
                التالي
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={phase === "saving"}
                className="flex-1 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {phase === "saving" ? "جارٍ الحفظ..." : "حفظ والانتقال إلى لوحة التحكم"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function StepShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">{icon}</div>
        <div>
          <h2 className="text-base font-black text-slate-900">{title}</h2>
          <p className="text-xs font-bold text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span className="text-sm font-black text-slate-900">{value}</span>
    </div>
  );
}
