"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Medal,
  Printer,
  RotateCcw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  type AttendanceStatus,
  type DailyAttendancePoint,
  EMPTY_FILTERS,
  type FilterOptions,
  type ReportFilters,
  type ReportsSummary,
  type StudentReportRow,
  type TopAbsentGrade,
  type TopAbsentLesson,
  type TopCommittedSection,
  type TopTeacherSubmission,
  getDailyAttendance,
  getReportFilterOptions,
  getReportsSummary,
  getStudentsTable,
  getTopAbsentGrades,
  getTopAbsentLessons,
  getTopCommittedSections,
  getTopTeacherSubmissions,
} from "@/lib/reports";
import { exportElementToPdf, exportReportToCsv, exportReportToExcel } from "@/lib/reportsExport";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused: "مستأذن",
};

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "#16a34a",
  absent: "#dc2626",
  late: "#f59e0b",
  excused: "#2563eb",
};

const PAGE_SIZE = 20;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function defaultFilters(): ReportFilters {
  return { ...EMPTY_FILTERS, dateFrom: isoDaysAgo(30), dateTo: isoToday() };
}

function formatDayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
}

function buildFiltersLabel(filters: ReportFilters, options: FilterOptions | null): string {
  const parts: string[] = [];
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`من ${filters.dateFrom ?? "البداية"} إلى ${filters.dateTo ?? "اليوم"}`);
  }
  if (filters.grade) parts.push(`الصف: ${filters.grade}`);
  if (filters.section) parts.push(`الشعبة: ${filters.section}`);
  if (filters.subjectId) {
    const subject = options?.subjects.find((s) => s.id === filters.subjectId);
    parts.push(`المادة: ${subject?.name ?? filters.subjectId}`);
  }
  if (filters.teacherId) {
    const teacher = options?.teachers.find((t) => t.id === filters.teacherId);
    parts.push(`المعلم: ${teacher?.name ?? filters.teacherId}`);
  }
  if (filters.status) parts.push(`الحالة: ${STATUS_LABELS[filters.status]}`);
  return parts.join(" • ");
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "حدث خطأ غير متوقع.";
}

const EMPTY_SUMMARY: ReportsSummary = {
  totalStudents: 0,
  presentCount: 0,
  absentCount: 0,
  lateCount: 0,
  excusedCount: 0,
  totalRecords: 0,
  attendanceRate: 0,
  absenceRate: 0,
};

export default function ReportsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(defaultFilters());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ReportsSummary>(EMPTY_SUMMARY);
  const [daily, setDaily] = useState<DailyAttendancePoint[]>([]);
  const [topAbsentGrades, setTopAbsentGrades] = useState<TopAbsentGrade[]>([]);
  const [topCommittedSections, setTopCommittedSections] = useState<TopCommittedSection[]>([]);
  const [topTeacherSubmissions, setTopTeacherSubmissions] = useState<TopTeacherSubmission[]>([]);
  const [topAbsentLessons, setTopAbsentLessons] = useState<TopAbsentLesson[]>([]);

  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const [absentPage, setAbsentPage] = useState(0);
  const [absentRows, setAbsentRows] = useState<StudentReportRow[]>([]);
  const [absentTotal, setAbsentTotal] = useState(0);
  const [absentLoading, setAbsentLoading] = useState(true);

  const [committedPage, setCommittedPage] = useState(0);
  const [committedRows, setCommittedRows] = useState<StudentReportRow[]>([]);
  const [committedTotal, setCommittedTotal] = useState(0);
  const [committedLoading, setCommittedLoading] = useState(true);

  const [exporting, setExporting] = useState<"excel" | "csv" | "pdf" | "print" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

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

        setRole(profile.role ?? null);
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
    if (!authorized) return;
    let cancelled = false;

    getReportFilterOptions()
      .then((options) => {
        if (!cancelled) setFilterOptions(options);
      })
      .catch(() => {
        if (!cancelled) setFilterOptions({ grades: [], sections: [], subjects: [], teachers: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [summaryRes, dailyRes, gradesRes, sectionsRes, teachersRes, lessonsRes] = await Promise.all([
          getReportsSummary(appliedFilters),
          getDailyAttendance(appliedFilters),
          getTopAbsentGrades(appliedFilters, 8),
          getTopCommittedSections(appliedFilters, 8),
          getTopTeacherSubmissions(appliedFilters, 8),
          getTopAbsentLessons(appliedFilters, 8),
        ]);

        if (cancelled) return;

        setSummary(summaryRes);
        setDaily(dailyRes);
        setTopAbsentGrades(gradesRes);
        setTopCommittedSections(sectionsRes);
        setTopTeacherSubmissions(teachersRes);
        setTopAbsentLessons(lessonsRes);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authorized, appliedFilters]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setStudentSearch(studentSearchInput.trim());
      setAbsentPage(0);
      setCommittedPage(0);
    }, 350);
    return () => clearTimeout(handle);
  }, [studentSearchInput]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    setAbsentLoading(true);
    getStudentsTable(appliedFilters, "absent_desc", PAGE_SIZE, absentPage * PAGE_SIZE, studentSearch || null)
      .then((page) => {
        if (cancelled) return;
        setAbsentRows(page.rows);
        setAbsentTotal(page.totalRows);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setAbsentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorized, appliedFilters, absentPage, studentSearch]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    setCommittedLoading(true);
    getStudentsTable(appliedFilters, "commitment_desc", PAGE_SIZE, committedPage * PAGE_SIZE, studentSearch || null)
      .then((page) => {
        if (cancelled) return;
        setCommittedRows(page.rows);
        setCommittedTotal(page.totalRows);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setCommittedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorized, appliedFilters, committedPage, studentSearch]);

  const dateRangeInvalid = Boolean(draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo);

  const applyFilters = useCallback(() => {
    if (dateRangeInvalid) return;
    setAppliedFilters({ ...draftFilters });
    setAbsentPage(0);
    setCommittedPage(0);
  }, [draftFilters, dateRangeInvalid]);

  const applyDatePreset = useCallback((dateFrom: string, dateTo: string) => {
    setDraftFilters((f) => {
      const next = { ...f, dateFrom, dateTo };
      setAppliedFilters(next);
      return next;
    });
    setAbsentPage(0);
    setCommittedPage(0);
  }, []);

  const resetFilters = useCallback(() => {
    const fresh = defaultFilters();
    setDraftFilters(fresh);
    setAppliedFilters(fresh);
    setAbsentPage(0);
    setCommittedPage(0);
  }, []);

  const filtersLabel = useMemo(() => buildFiltersLabel(appliedFilters, filterOptions), [appliedFilters, filterOptions]);

  const statCards = useMemo(
    () => [
      { title: "إجمالي الطلاب", value: summary.totalStudents, icon: Users, tone: "blue" as const },
      { title: "الحاضرون", value: summary.presentCount, icon: UserCheck, tone: "green" as const },
      { title: "الغائبون (الإجمالي)", value: summary.absentCount + summary.excusedCount, icon: UserMinus, tone: "red" as const },
      { title: "الغياب بعذر", value: summary.excusedCount, icon: ShieldAlert, tone: "blue" as const },
      { title: "الغياب بدون عذر", value: summary.absentCount, icon: UserMinus, tone: "red" as const },
      { title: "المتأخرون", value: summary.lateCount, icon: CalendarClock, tone: "amber" as const },
      { title: "نسبة الحضور %", value: `${summary.attendanceRate}%`, icon: TrendingUp, tone: "green" as const },
      { title: "نسبة الغياب %", value: `${summary.absenceRate}%`, icon: TrendingDown, tone: "red" as const },
    ],
    [summary]
  );

  const statusPieData = useMemo(
    () => [
      { name: STATUS_LABELS.present, value: summary.presentCount, color: STATUS_COLORS.present },
      { name: STATUS_LABELS.absent, value: summary.absentCount, color: STATUS_COLORS.absent },
      { name: STATUS_LABELS.late, value: summary.lateCount, color: STATUS_COLORS.late },
      { name: STATUS_LABELS.excused, value: summary.excusedCount, color: STATUS_COLORS.excused },
    ],
    [summary]
  );
  const hasPieData = statusPieData.some((d) => d.value > 0);

  const sectionLabelOf = (row: TopCommittedSection) => `${row.grade} - ${row.section}`;

  async function runExport(kind: "excel" | "csv" | "pdf" | "print") {
    setExportError(null);
    setExporting(kind);

    try {
      if (kind === "excel" || kind === "csv") {
        const payload = {
          filtersLabel,
          summary,
          daily,
          topAbsentGrades,
          topCommittedSections,
          topTeacherSubmissions,
          topAbsentLessons,
          absentStudents: absentRows,
          committedStudents: committedRows,
        };
        if (kind === "excel") exportReportToExcel(payload);
        else exportReportToCsv(payload);
      } else if (kind === "pdf") {
        if (printAreaRef.current) await exportElementToPdf(printAreaRef.current, "تقرير-الحضور");
      } else if (kind === "print") {
        window.print();
      }
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  if (checkingAccess) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 size={20} className="animate-spin" />
          جارٍ التحقق من الصلاحية...
        </div>
      </section>
    );
  }

  if (accessError || !authorized) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-center text-red-700">
          {accessError ?? "لا تملك صلاحية الوصول لهذه الصفحة."}
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-5">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-print-area, #report-print-area * { visibility: visible; }
          #report-print-area { position: absolute; inset: 0; width: 100%; padding: 12px; }
        }
      `}</style>

      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">النظام / التقارير والإحصائيات</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">التقارير والإحصائيات</h1>
          <p className="mt-2 text-sm text-slate-500">
            مؤشرات الحضور والغياب والتأخر والاستئذان حسب الفترة والصف والشعبة والمادة والمعلم.
          </p>
        </header>

        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400">فترة سريعة:</span>
            <button
              onClick={() => applyDatePreset(isoToday(), isoToday())}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
            >
              يومي (اليوم)
            </button>
            <button
              onClick={() => applyDatePreset(isoDaysAgo(6), isoToday())}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
            >
              أسبوعي (آخر 7 أيام)
            </button>
            <button
              onClick={() => applyDatePreset(isoDaysAgo(29), isoToday())}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
            >
              شهري (آخر 30 يوم)
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="من تاريخ">
              <input
                type="date"
                value={draftFilters.dateFrom ?? ""}
                onChange={(e) => setDraftFilters((f) => ({ ...f, dateFrom: e.target.value || null }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
              />
            </Field>

            <Field label="إلى تاريخ">
              <input
                type="date"
                value={draftFilters.dateTo ?? ""}
                onChange={(e) => setDraftFilters((f) => ({ ...f, dateTo: e.target.value || null }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
              />
            </Field>

            <Field label="الصف">
              <select
                value={draftFilters.grade ?? ""}
                onChange={(e) => setDraftFilters((f) => ({ ...f, grade: e.target.value || null }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">كل الصفوف</option>
                {(filterOptions?.grades ?? []).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </Field>

            <Field label="الشعبة">
              <select
                value={draftFilters.section ?? ""}
                onChange={(e) => setDraftFilters((f) => ({ ...f, section: e.target.value || null }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">كل الشعب</option>
                {(filterOptions?.sections ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="المادة">
              <select
                value={draftFilters.subjectId ?? ""}
                onChange={(e) => setDraftFilters((f) => ({ ...f, subjectId: e.target.value || null }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">كل المواد</option>
                {(filterOptions?.subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>

            {role === "teacher" ? null : (
              <Field label="المعلم">
                <select
                  value={draftFilters.teacherId ?? ""}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, teacherId: e.target.value || null }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">كل المعلمين</option>
                  {(filterOptions?.teachers ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="حالة الطالب">
              <select
                value={draftFilters.status ?? ""}
                onChange={(e) => setDraftFilters((f) => ({ ...f, status: (e.target.value || null) as AttendanceStatus | null }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">كل الحالات</option>
                <option value="present">حاضر</option>
                <option value="absent">غائب</option>
                <option value="late">متأخر</option>
                <option value="excused">مستأذن</option>
              </select>
            </Field>

            <div className="flex items-end gap-2">
              <button
                onClick={applyFilters}
                disabled={dateRangeInvalid}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                تطبيق
              </button>
              <button
                onClick={resetFilters}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700"
              >
                <RotateCcw size={16} />
                إعادة تعيين
              </button>
            </div>
          </div>

          {dateRangeInvalid ? (
            <p className="mt-3 flex items-center gap-2 text-xs font-bold text-red-600">
              <AlertTriangle size={14} />
              تاريخ البداية يجب أن يسبق تاريخ النهاية.
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ml-auto text-xs font-bold text-slate-400">تصدير التقرير:</span>
            <ExportButton label="Excel" icon={FileSpreadsheet} busy={exporting === "excel"} onClick={() => runExport("excel")} tone="green" />
            <ExportButton label="CSV" icon={FileText} busy={exporting === "csv"} onClick={() => runExport("csv")} tone="slate" />
            <ExportButton label="PDF" icon={Download} busy={exporting === "pdf"} onClick={() => runExport("pdf")} tone="red" />
            <ExportButton label="طباعة مباشرة" icon={Printer} busy={exporting === "print"} onClick={() => runExport("print")} tone="blue" />
          </div>
          {exportError ? <p className="mt-3 text-xs font-bold text-red-600">{exportError}</p> : null}
        </section>

        {error ? (
          <section className="rounded-3xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</section>
        ) : null}

        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <Field label="بحث عن طالب بالاسم">
            <input
              type="text"
              value={studentSearchInput}
              onChange={(e) => setStudentSearchInput(e.target.value)}
              placeholder="اكتب اسم الطالب..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
            />
          </Field>
        </section>

        <div id="report-print-area" ref={printAreaRef} className="space-y-5">
          <p className="text-xs text-slate-400">{filtersLabel || "بدون فلاتر إضافية"}{loading ? " — جارٍ التحديث..." : ""}</p>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {statCards.map((card) => (
              <StatCard key={card.title} {...card} />
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="الحضور خلال الأيام" icon={<BarChart3 size={20} />}>
              {daily.length === 0 ? (
                <EmptyChart loading={loading} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" tickFormatter={formatDayLabel} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(v) => formatDayLabel(String(v))}
                      contentStyle={{ direction: "rtl", textAlign: "right", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, direction: "rtl" }} formatter={(v) => STATUS_LABELS[v as AttendanceStatus] ?? v} />
                    <Area type="monotone" dataKey="present" stackId="a" name="present" stroke={STATUS_COLORS.present} fill={STATUS_COLORS.present} fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="absent" stackId="a" name="absent" stroke={STATUS_COLORS.absent} fill={STATUS_COLORS.absent} fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="late" stackId="a" name="late" stroke={STATUS_COLORS.late} fill={STATUS_COLORS.late} fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="excused" stackId="a" name="excused" stroke={STATUS_COLORS.excused} fill={STATUS_COLORS.excused} fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="توزيع الحالات" icon={<ShieldAlert size={20} />}>
              {!hasPieData ? (
                <EmptyChart loading={loading} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={statusPieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                      {statusPieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
                    <Tooltip contentStyle={{ direction: "rtl", textAlign: "right", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="أكثر الصفوف غياباً" icon={<UserMinus size={20} />}>
              {topAbsentGrades.length === 0 ? (
                <EmptyChart loading={loading} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topAbsentGrades} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="grade" width={110} tick={{ fontSize: 12, fill: "#334155" }} />
                    <Tooltip
                      formatter={(value: any) => [value, "عدد الغياب"]}
                      contentStyle={{ direction: "rtl", textAlign: "right", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Bar dataKey="absentCount" name="absentCount" fill={STATUS_COLORS.absent} radius={[0, 6, 6, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="أكثر الشعب التزاماً" icon={<Medal size={20} />}>
              {topCommittedSections.length === 0 ? (
                <EmptyChart loading={loading} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={topCommittedSections.map((s) => ({ label: sectionLabelOf(s), commitmentRate: s.commitmentRate }))}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" />
                    <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 12, fill: "#334155" }} />
                    <Tooltip
                      formatter={(value: any) => [`${value}%`, "نسبة الالتزام"]}
                      contentStyle={{ direction: "rtl", textAlign: "right", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Bar dataKey="commitmentRate" name="commitmentRate" fill={STATUS_COLORS.present} radius={[0, 6, 6, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="أكثر المعلمين رفعاً للتحضير" icon={<TrendingUp size={20} />}>
              {topTeacherSubmissions.length === 0 ? (
                <EmptyChart loading={loading} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topTeacherSubmissions} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="teacherName" width={110} tick={{ fontSize: 12, fill: "#334155" }} />
                    <Tooltip
                      formatter={(value: any) => [value, "حصص مرفوعة"]}
                      contentStyle={{ direction: "rtl", textAlign: "right", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Bar dataKey="submittedCount" name="submittedCount" fill="#1d4ed8" radius={[0, 6, 6, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="أكثر الحصص غياباً" icon={<TrendingDown size={20} />}>
              {topAbsentLessons.length === 0 ? (
                <EmptyChart loading={loading} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topAbsentLessons} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="lesson" width={110} tick={{ fontSize: 12, fill: "#334155" }} />
                    <Tooltip
                      formatter={(value: any) => [value, "عدد الغياب"]}
                      contentStyle={{ direction: "rtl", textAlign: "right", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Bar dataKey="absentCount" name="absentCount" fill={STATUS_COLORS.absent} radius={[0, 6, 6, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </section>

          <StudentsTableSection
            title="أكثر الطلاب غياباً"
            icon={<UserMinus size={20} />}
            rows={absentRows}
            totalRows={absentTotal}
            page={absentPage}
            onPageChange={setAbsentPage}
            loading={absentLoading}
            highlight="absent"
          />

          <StudentsTableSection
            title="أكثر الطلاب التزاماً"
            icon={<UserCheck size={20} />}
            rows={committedRows}
            totalRows={committedTotal}
            page={committedPage}
            onPageChange={setCommittedPage}
            loading={committedLoading}
            highlight="commitment"
          />
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const TONE_CLASSES: Record<"blue" | "green" | "red" | "amber", string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
};

function StatCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ size?: number }>;
  tone: "blue" | "green" | "red" | "amber";
}) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{title}</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">{value}</h2>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${TONE_CLASSES[tone]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">{icon}</div>
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
      {loading ? (
        <span className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          جارٍ التحميل...
        </span>
      ) : (
        "لا توجد بيانات كافية لهذه الفترة."
      )}
    </div>
  );
}

function ExportButton({
  label,
  icon: Icon,
  onClick,
  busy,
  tone,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  onClick: () => void;
  busy: boolean;
  tone: "green" | "slate" | "red" | "blue";
}) {
  const toneClasses: Record<typeof tone, string> = {
    green: "bg-green-600 text-white",
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-600 text-white",
    blue: "bg-blue-700 text-white",
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${toneClasses[tone]}`}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function StudentsTableSection({
  title,
  icon,
  rows,
  totalRows,
  page,
  onPageChange,
  loading,
  highlight,
}: {
  title: string;
  icon: React.ReactNode;
  rows: StudentReportRow[];
  totalRows: number;
  page: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  highlight: "absent" | "commitment";
}) {
  const from = totalRows === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(totalRows, (page + 1) * PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = to < totalRows;

  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">{icon}</div>
          <h2 className="font-bold text-slate-900">{title}</h2>
        </div>
        <span className="text-xs font-bold text-slate-400">{totalRows} طالب</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          جارٍ التحميل...
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">لا توجد بيانات كافية لهذه الفترة.</div>
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-right text-xs font-bold text-slate-400">
                  <th className="px-2 py-2">الاسم</th>
                  <th className="px-2 py-2">الصف</th>
                  <th className="px-2 py-2">الشعبة</th>
                  <th className="px-2 py-2">الغياب</th>
                  <th className="px-2 py-2">التأخر</th>
                  <th className="px-2 py-2">الاستئذان</th>
                  <th className="px-2 py-2">الالتزام</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.studentId} className="border-b border-slate-50">
                    <td className="px-2 py-2.5 font-bold text-slate-900">{row.studentName}</td>
                    <td className="px-2 py-2.5 text-slate-600">{row.grade}</td>
                    <td className="px-2 py-2.5 text-slate-600">{row.section}</td>
                    <td className={`px-2 py-2.5 ${highlight === "absent" ? "font-bold text-red-600" : "text-slate-600"}`}>{row.absentCount}</td>
                    <td className="px-2 py-2.5 text-slate-600">{row.lateCount}</td>
                    <td className="px-2 py-2.5 text-slate-600">{row.excusedCount}</td>
                    <td className={`px-2 py-2.5 ${highlight === "commitment" ? "font-bold text-green-600" : "text-slate-600"}`}>{row.commitmentRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <div key={row.studentId} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-900">{row.studentName}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-500">
                    {row.grade} / {row.section}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                  <MiniStat label="غياب" value={row.absentCount} emphasize={highlight === "absent"} />
                  <MiniStat label="تأخر" value={row.lateCount} />
                  <MiniStat label="استئذان" value={row.excusedCount} />
                  <MiniStat label="التزام" value={`${row.commitmentRate}%`} emphasize={highlight === "commitment"} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {totalRows > PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-400">
            عرض {from}–{to} من {totalRows}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPrev}
              aria-label="الصفحة السابقة"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNext}
              aria-label="الصفحة التالية"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MiniStat({ label, value, emphasize }: { label: string; value: number | string; emphasize?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-2">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${emphasize ? "text-blue-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
