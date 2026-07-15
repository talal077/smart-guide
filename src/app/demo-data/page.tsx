"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { DemoCounts } from "@/lib/demoData";

const ALLOWED_ROLES = ["admin", "vice_principal", "principal"];

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

const COUNT_LABELS: { key: keyof DemoCounts; label: string }[] = [
  { key: "teachers", label: "المعلمون" },
  { key: "students", label: "الطلاب" },
  { key: "grades", label: "الصفوف" },
  { key: "sections", label: "الشعب" },
  { key: "subjects", label: "المواد" },
  { key: "assignments", label: "الإسنادات" },
  { key: "scheduleSlots", label: "حصص الجدول الدراسي" },
  { key: "lessonSubmissions", label: "سجلات التحضير" },
  { key: "attendanceRecords", label: "سجلات الحضور" },
  { key: "excuses", label: "الأعذار" },
  { key: "notifications", label: "التنبيهات" },
];

export default function DemoDataPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<DemoCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (cancelled) return;

        if (!authData.user) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, is_active, is_blocked")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (cancelled) return;

        if (!profile || profile.is_blocked || profile.is_active === false) {
          router.replace("/login");
          return;
        }

        if (!ALLOWED_ROLES.includes(String(profile.role))) {
          router.replace("/dashboard");
          return;
        }

        setAuthorized(true);
        setCheckingAccess(false);
      } catch (err) {
        if (!cancelled) {
          setAccessError(getErrorMessage(err));
          setCheckingAccess(false);
        }
      }
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function callEndpoint(endpoint: string) {
    const response = await fetch(endpoint, { method: "POST", credentials: "include" });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "حدث خطأ غير متوقع.");
    }
    return result;
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setMessage(null);

    try {
      const result = await callEndpoint("/api/demo/generate");
      setCounts(result.counts);
      setMessage(result.alreadyExisted ? "البيانات التجريبية موجودة بالفعل، لم يتم إنشاء بيانات مكررة." : "تم إنشاء البيانات التجريبية بنجاح.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("سيتم حذف جميع البيانات التجريبية الحالية وإعادة إنشائها بالكامل. المستخدمون الحقيقيون وإعدادات المدرسة لن يتأثروا. هل تريد المتابعة؟")) {
      return;
    }

    setResetting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await callEndpoint("/api/demo/reset");
      setCounts(result.counts);
      setMessage("تمت إعادة إنشاء البيانات التجريبية بنجاح.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResetting(false);
    }
  }

  if (checkingAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <p className="text-sm text-slate-500">جارٍ التحقق من الصلاحيات...</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6" dir="rtl">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">تعذر التحقق من صلاحيات الوصول لهذه الصفحة.</p>
          <p className="mt-2">{accessError}</p>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">البيانات التجريبية</h1>
          <p className="text-sm text-slate-500">
            إنشاء بيانات تجريبية واقعية (معلمون، طلاب، مواد، شعب، إسنادات، جدول دراسي، تحضير، تنبيهات) لاختبار النظام قبل الإنتاج.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-blue-700 hover:underline">
          العودة
        </Link>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating || resetting}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {generating ? "جارٍ الإنشاء..." : "إنشاء البيانات التجريبية"}
        </button>

        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={generating || resetting}
          className="rounded-lg border border-red-300 px-5 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
        >
          {resetting ? "جارٍ إعادة الإنشاء..." : "إعادة إنشاء البيانات التجريبية"}
        </button>
      </div>

      {counts ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr>
                <th className="px-3 py-2">العنصر</th>
                <th className="px-3 py-2">العدد</th>
              </tr>
            </thead>
            <tbody>
              {COUNT_LABELS.map(({ key, label }) => (
                <tr key={key} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-sm text-slate-900">{label}</td>
                  <td className="px-3 py-2 text-sm font-bold text-slate-700">{counts[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
