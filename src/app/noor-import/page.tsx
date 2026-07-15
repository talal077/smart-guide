"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ColumnMapping, ConflictMode, ImportPreview, ExcelStudentRecord } from "@/lib/excel/types";
import { createDefaultMapping } from "@/lib/excel/mapper";

const ALLOWED_ROLES = ["principal", "admin", "vice_principal"];
const BATCH_SIZE = 300;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const STORAGE_KEYS = {
  mapping: "smart-guide-excel-mapping",
  grade: "smart-guide-excel-grade",
  section: "smart-guide-excel-section",
};

type AggregatedReport = {
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  errors: Array<{ record: ExcelStudentRecord; message: string }>;
  outcome: "success" | "partial" | "failed";
  stopped: boolean;
  stopReason: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "حدث خطأ غير متوقع.";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

export default function NoorImportPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rows, setRows] = useState<ExcelStudentRecord[]>([]);
  const [message, setMessage] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(createDefaultMapping());
  const [manualGrade, setManualGrade] = useState("");
  const [manualSection, setManualSection] = useState("");
  const [conflictMode, setConflictMode] = useState<ConflictMode>("update");

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [importReport, setImportReport] = useState<AggregatedReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (authError || !authData.user) {
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

  useEffect(() => {
    if (!preview) return;
    const base = preview.previewRows ?? [];
    const newRows = base.map((r) => {
      const next = { ...r } as ExcelStudentRecord;
      if (!mapping.grade) next.grade = manualGrade || preview.detectedGrade || next.grade || null;
      if (!mapping.section) next.section = manualSection || preview.detectedSection || next.section || null;
      return next;
    });
    setRows(newRows);
  }, [preview, manualGrade, manualSection, mapping]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedMapping = window.localStorage.getItem(STORAGE_KEYS.mapping);
    const savedGrade = window.localStorage.getItem(STORAGE_KEYS.grade);
    const savedSection = window.localStorage.getItem(STORAGE_KEYS.section);

    if (savedMapping) {
      try {
        setMapping(JSON.parse(savedMapping) as ColumnMapping);
      } catch {
        setMapping(createDefaultMapping());
      }
    }
    if (savedGrade) setManualGrade(savedGrade);
    if (savedSection) setManualSection(savedSection);
  }, []);

  function updateMapping(field: keyof ColumnMapping, value: string) {
    setMapping((current) => ({ ...current, [field]: value || null }));
  }

  function persistDefaults(nextMapping: ColumnMapping, nextGrade: string, nextSection: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.mapping, JSON.stringify(nextMapping));
    window.localStorage.setItem(STORAGE_KEYS.grade, nextGrade);
    window.localStorage.setItem(STORAGE_KEYS.section, nextSection);
  }

  function resetFileState() {
    setFile(null);
    setPreview(null);
    setRows([]);
    setImportReport(null);
    setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickFile(nextFile: File | null) {
    if (nextFile && nextFile.size > MAX_FILE_BYTES) {
      setMessage(`حجم الملف كبير جدًا (${formatFileSize(nextFile.size)}). الحد الأقصى 10 ميجابايت.`);
      return;
    }
    setFile(nextFile);
    setMessage("");
    setPreview(null);
    setRows([]);
    setImportReport(null);
  }

  async function handlePreview() {
    if (!file) {
      setMessage("اختر ملف Excel أولًا.");
      return;
    }

    setPreviewing(true);
    setMessage("");
    setImportReport(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("grade", manualGrade);
      fd.append("section", manualSection);

      const res = await fetch(`/api/noor-import?mode=preview`, { method: "POST", body: fd });
      const data = await res.json();

      if (!data?.success) {
        setMessage(data?.message || "فشل استخراج البيانات من الملف.");
        setPreview(null);
        setRows([]);
        return;
      }

      const nextPreview = data.preview as ImportPreview;
      const detected = nextPreview?.detectedMapping;
      const newMapping = detected
        ? { ...mapping, ...(detected.grade ? { grade: detected.grade } : {}), ...(detected.section ? { section: detected.section } : {}) }
        : mapping;

      setMapping(newMapping);
      setPreview(nextPreview);
      setRows(nextPreview.previewRows ?? []);
      persistDefaults(newMapping, manualGrade, manualSection);
      setMessage(
        nextPreview.requiresMapping
          ? "تم تحليل الملف، لكن يحتاج إلى مطابقة الأعمدة قبل الحفظ."
          : `تم استخراج ${nextPreview.totalStudents ?? 0} طالبًا من ${nextPreview.sheetNames?.length ?? 0} ورقة.`
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
      setPreview(null);
      setRows([]);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!rows.length || !preview) {
      setMessage("لا يوجد طلاب للاستيراد. أجرِ المعاينة أولًا.");
      return;
    }

    const allRecords = rows;

    setImporting(true);
    setMessage("");
    setImportReport(null);
    setProgress({ done: 0, total: allRecords.length });

    const controller = new AbortController();
    abortRef.current = controller;

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let rejected = 0;
    const errors: Array<{ record: ExcelStudentRecord; message: string }> = [];
    let stopped = false;
    let stopReason = "";

    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      if (controller.signal.aborted) {
        stopped = true;
        stopReason = "تم الإلغاء بواسطة المستخدم.";
        break;
      }

      const batch = allRecords.slice(i, i + BATCH_SIZE);

      try {
        const res = await fetch(`/api/noor-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ students: batch, conflictMode }),
          signal: controller.signal,
        });
        const data = await res.json();

        if (!data?.success) {
          stopped = true;
          stopReason = data?.message || "فشل حفظ إحدى الدفعات.";
          break;
        }

        inserted += data.result.inserted;
        updated += data.result.updated;
        skipped += data.result.skipped;
        rejected += data.result.rejected;
        errors.push(...(data.result.errors ?? []));
      } catch (error) {
        if (controller.signal.aborted) {
          stopped = true;
          stopReason = "تم الإلغاء بواسطة المستخدم.";
        } else {
          stopped = true;
          stopReason = getErrorMessage(error);
        }
        break;
      }

      setProgress({ done: Math.min(i + BATCH_SIZE, allRecords.length), total: allRecords.length });
    }

    const outcome: AggregatedReport["outcome"] = stopped ? "failed" : rejected > 0 || errors.length > 0 ? "partial" : "success";
    const report: AggregatedReport = { inserted, updated, skipped, rejected, errors, outcome, stopped, stopReason };
    setImportReport(report);

    fetch(`/api/noor-import?mode=complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file?.name, summary: report }),
    }).catch(() => {});

    setImporting(false);
    setProgress(null);
    abortRef.current = null;
  }

  function cancelImport() {
    abortRef.current?.abort();
  }

  const progressPercent = useMemo(() => {
    if (!progress || !progress.total) return 0;
    return Math.round((progress.done / progress.total) * 100);
  }, [progress]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen bg-slate-100 p-6" dir="rtl">
        <p className="text-center text-slate-500">جارٍ التحقق من صلاحيات الوصول...</p>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="min-h-screen bg-slate-100 p-6" dir="rtl">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-6 text-center shadow-xl">
          <p className="font-black text-red-600">تعذر التحقق من صلاحيات الوصول لهذه الصفحة.</p>
          <p className="mt-2 text-sm text-slate-500">{accessError}</p>
          <Link href="/dashboard" className="mt-4 inline-block rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
            العودة إلى لوحة التحكم
          </Link>
        </div>
      </main>
    );
  }

  if (!authorized) return null;

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-6" dir="rtl">
      <section className="mx-auto max-w-7xl overflow-x-hidden rounded-3xl bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-700">استيراد بيانات نور</p>
            <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">استيراد الطلاب من ملف Excel</h1>
            <p className="mt-2 text-sm text-slate-500">يدعم xlsx و xls و csv، ويكتشف الأعمدة تلقائيًا (اسم الطالب، رقم الهوية، الصف، الشعبة، الحالة).</p>
          </div>
          <Link href="/dashboard" className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
            العودة
          </Link>
        </div>

        <div
          className={`mb-5 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const dropped = event.dataTransfer.files?.[0] ?? null;
            pickFile(dropped);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            className="hidden"
            id="noor-file-input"
          />
          <label htmlFor="noor-file-input" className="inline-block cursor-pointer rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white">
            اختيار ملف
          </label>
          <p className="mt-3 text-sm text-slate-500">أو اسحب وأفلت ملف Excel هنا</p>

          {file ? (
            <div className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">
              <span>{file.name}</span>
              <span className="text-slate-400">•</span>
              <span>{formatFileSize(file.size)}</span>
              <button type="button" onClick={resetFileState} className="text-red-600 hover:underline">
                إزالة
              </button>
            </div>
          ) : null}
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
            <span className="mb-2 block">الصف الافتراضي</span>
            <input value={manualGrade} onChange={(event) => setManualGrade(event.target.value)} placeholder="مثال: الأول الثانوي" className="w-full rounded-xl border border-slate-200 p-2" />
          </label>
          <label className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
            <span className="mb-2 block">الشعبة الافتراضية</span>
            <input value={manualSection} onChange={(event) => setManualSection(event.target.value)} placeholder="مثال: أ" className="w-full rounded-xl border border-slate-200 p-2" />
          </label>
        </div>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-sm font-black text-slate-800">عند وجود طالب مسبقًا (نفس رقم الهوية)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 text-sm font-bold text-slate-700">
              <input type="radio" name="conflictMode" checked={conflictMode === "update"} onChange={() => setConflictMode("update")} />
              تحديث بياناته
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 text-sm font-bold text-slate-700">
              <input type="radio" name="conflictMode" checked={conflictMode === "ignore"} onChange={() => setConflictMode("ignore")} />
              تجاهل السجل
            </label>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || importing || !file}
            className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {previewing ? "جارٍ المعاينة..." : "معاينة الملف"}
          </button>
          {importing ? (
            <button type="button" onClick={cancelImport} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white">
              إلغاء الاستيراد
            </button>
          ) : (
            <button
              type="button"
              onClick={handleImport}
              disabled={previewing || importing || rows.length === 0}
              className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              حفظ في قاعدة البيانات
            </button>
          )}
        </div>

        {importing && progress ? (
          <div className="mb-5">
            <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
              <span>جارٍ الاستيراد... {progress.done} من {progress.total}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-green-600 transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}

        {message && <p className="mb-5 rounded-2xl bg-yellow-50 p-4 text-sm font-black text-yellow-800">{message}</p>}

        {preview && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat title="صفوف الملف" value={preview.totalRows} />
              <Stat title="سجلات صحيحة" value={preview.totalStudents} />
              <Stat title="مكررة بالملف" value={preview.duplicateCount} />
              <Stat title="مرفوضة" value={preview.errorCount} />
              <Stat title="موجودة مسبقًا" value={preview.existingCount} />
              <Stat title="عدد الشعب" value={preview.uniqueSections} />
            </div>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="mb-3 text-lg font-black text-slate-900">مطابقة الأعمدة</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
                  <span className="mb-2 block">اسم الطالب</span>
                  <select value={mapping.name ?? ""} onChange={(event) => updateMapping("name", event.target.value)} className="w-full rounded-xl border border-slate-200 p-2">
                    <option value="">-- لا تستخدم --</option>
                    {preview.availableHeaders.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </label>

                <label className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
                  <span className="mb-2 block">رقم الهوية / السجل المدني</span>
                  <select value={mapping.nationalId ?? ""} onChange={(event) => updateMapping("nationalId", event.target.value)} className="w-full rounded-xl border border-slate-200 p-2">
                    <option value="">-- لا تستخدم --</option>
                    {preview.availableHeaders.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </label>

                <label className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
                  <span className="mb-2 block">الصف</span>
                  {mapping.grade ? (
                    <input value={mapping.grade} disabled className="w-full rounded-xl border border-slate-200 bg-slate-100 p-2" />
                  ) : (
                    <select value={manualGrade} onChange={(event) => setManualGrade(event.target.value)} className="w-full rounded-xl border border-slate-200 p-2">
                      <option value="">-- اختر الصف --</option>
                      <option>الأول الثانوي</option>
                      <option>الثاني الثانوي</option>
                      <option>الثالث الثانوي</option>
                    </select>
                  )}
                </label>

                <label className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
                  <span className="mb-2 block">الشعبة</span>
                  {mapping.section ? (
                    <input value={mapping.section} disabled className="w-full rounded-xl border border-slate-200 bg-slate-100 p-2" />
                  ) : (
                    <select value={manualSection} onChange={(event) => setManualSection(event.target.value)} className="w-full rounded-xl border border-slate-200 p-2">
                      <option value="">-- اختر الشعبة --</option>
                      <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option>
                      <option>أ</option><option>ب</option><option>ج</option><option>د</option>
                    </select>
                  )}
                </label>
              </div>

              {(preview.gradeCandidates.length > 0 || preview.sectionCandidates.length > 0) && (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
                  {preview.gradeCandidates.length > 0 && <p>اقتراحات الصف: {preview.gradeCandidates.join(" • ")}</p>}
                  {preview.sectionCandidates.length > 0 && <p>اقتراحات الشعبة: {preview.sectionCandidates.join(" • ")}</p>}
                </div>
              )}
            </div>

            {preview.issues.length > 0 && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <h3 className="mb-2 font-black">السجلات المرفوضة وأسباب الرفض ({preview.issues.length})</h3>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {preview.issues.slice(0, 50).map((issue, index) => (
                    <li key={index}>صف {issue.rowNumber}: {issue.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.duplicateRecords.length > 0 && (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <h3 className="mb-2 font-black">السجلات المكررة داخل الملف ({preview.duplicateRecords.length})</h3>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {preview.duplicateRecords.slice(0, 50).map((record, index) => (
                    <li key={index}>{record.full_name} — {record.grade || "-"} / {record.section || "-"}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-5 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[760px] border-collapse text-center text-sm">
                <thead className="bg-blue-50 text-blue-900">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">اسم الطالب</th>
                    <th className="p-3">الصف</th>
                    <th className="p-3">الشعبة</th>
                    <th className="p-3">رقم الهوية</th>
                    <th className="p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((student, index) => (
                    <tr key={`${student.full_name}-${student.national_id}-${index}`} className="border-t">
                      <td className="p-3 font-bold">{index + 1}</td>
                      <td className="p-3 font-black">{student.full_name}</td>
                      <td className="p-3">{student.grade || "-"}</td>
                      <td className="p-3">{student.section || "-"}</td>
                      <td className="p-3">{student.national_id || "-"}</td>
                      <td className="p-3">{student.status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 ? (
                <p className="p-3 text-center text-xs text-slate-500">تُعرض أول 20 من أصل {rows.length} سجلًا صحيحًا — سيتم استيراد الجميع عند الحفظ.</p>
              ) : null}
            </div>
          </>
        )}

        {importReport && (
          <div
            className={`rounded-2xl border p-4 text-sm ${
              importReport.outcome === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : importReport.outcome === "partial"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <h3 className="mb-2 font-black">
              {importReport.outcome === "success" ? "تم الاستيراد بنجاح" : importReport.outcome === "partial" ? "تم الاستيراد جزئيًا" : "فشل الاستيراد"}
            </h3>
            <p>تمت الإضافة: {importReport.inserted}</p>
            <p>تم التحديث: {importReport.updated}</p>
            <p>تم التجاوز: {importReport.skipped}</p>
            <p>مرفوض: {importReport.rejected}</p>
            {importReport.stopped ? <p className="mt-2 font-black">توقف الاستيراد: {importReport.stopReason}</p> : null}
            {importReport.errors.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer font-bold">تفاصيل الأخطاء ({importReport.errors.length})</summary>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {importReport.errors.slice(0, 50).map((e, index) => (
                    <li key={index}>{e.record.full_name}: {e.message}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <div className="text-2xl font-black text-blue-700">{value}</div>
      <div className="mt-1 text-xs font-bold text-slate-500">{title}</div>
    </div>
  );
}
