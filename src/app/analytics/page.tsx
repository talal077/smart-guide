"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Download,
  FileDown,
  Loader2,
  Medal,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { exportAnalyticsToExcel } from "@/lib/analyticsExport";
import { exportElementToPdf } from "@/lib/reportsExport";

type AttendanceRow = { student_id: string; student_name: string; grade: string; section: string; date: string; status: string };
type StudentRow = { id: string; full_name: string; grade: string; section: string };

export default function AnalyticsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [excusesApprovedToday, setExcusesApprovedToday] = useState(0);
  const [teacherCommitmentData, setTeacherCommitmentData] = useState<{ teacher: string; submitted: number; total: number; rate: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Guards against out-of-order responses: if "تحديث التحليل" is clicked again while a
  // previous reload is still in flight, only the latest request's results get applied.
  const requestIdRef = useRef(0);

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

        if (!["principal", "admin", "vice_principal"].includes(profile.role)) {
          router.replace("/dashboard");
          return;
        }

        setAuthorized(true);
        setCheckingAccess(false);
      } catch (err) {
        if (!cancelled) {
          setAccessError(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
          setCheckingAccess(false);
        }
      }
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadAnalytics = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      // Always a fresh Supabase fetch -- never derived from the previous students/
      // attendance state, so "تحديث التحليل" genuinely reloads from the database
      // instead of just recomputing the same stale arrays.
      const [studentsRes, attendanceRes, scheduleRes, submissionsRes] = await Promise.all([
        supabase.from("students").select("id, full_name, grade, section"),
        supabase.from("attendance_records").select("student_id, student_name, grade, section, date, status").order("date", { ascending: false }),
        supabase.from("class_schedule").select("teacher_id, profiles(full_name)"),
        supabase.from("lesson_submissions").select("teacher_id, date, status"),
      ]);

      if (requestIdRef.current !== requestId) return;

      setStudents((studentsRes.data ?? []) as StudentRow[]);
      setAttendance((attendanceRes.data ?? []) as AttendanceRow[]);

      const latestDate = (attendanceRes.data ?? [])[0]?.date;
      const { data: excuseRows } = await supabase.from("excuses").select("status, date").eq("date", latestDate ?? "").eq("status", "approved");
      if (requestIdRef.current !== requestId) return;
      setExcusesApprovedToday(excuseRows?.length ?? 0);

      const scheduleRows = scheduleRes.data ?? [];
      const submissionRows = submissionsRes.data ?? [];

      const scheduledByTeacher = new Map<string, { name: string; total: number }>();
      for (const row of scheduleRows) {
        const teacherId = String(row.teacher_id ?? "");
        if (!teacherId) continue;
        const teacherRel = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const name = String(teacherRel?.full_name ?? "معلم");
        const current = scheduledByTeacher.get(teacherId) ?? { name, total: 0 };
        current.total += 1;
        scheduledByTeacher.set(teacherId, current);
      }

      const submittedByTeacher = new Map<string, number>();
      for (const row of submissionRows) {
        if (row.status !== "submitted") continue;
        const teacherId = String(row.teacher_id ?? "");
        if (!teacherId) continue;
        submittedByTeacher.set(teacherId, (submittedByTeacher.get(teacherId) ?? 0) + 1);
      }

      const commitment = Array.from(scheduledByTeacher.entries())
        .map(([teacherId, info]) => {
          const submitted = submittedByTeacher.get(teacherId) ?? 0;
          const total = info.total;
          return { teacher: info.name, submitted, total, rate: total > 0 ? Math.round((submitted / total) * 100) : 0 };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      if (requestIdRef.current !== requestId) return;
      setTeacherCommitmentData(commitment);
    } catch (err) {
      console.error("[analytics:reload] failed:", err);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadAnalytics();
  }, [authorized, loadAnalytics]);

  const latestDate = attendance[0]?.date ?? "";
  const todayRecords = useMemo(() => attendance.filter((row) => row.date === latestDate), [attendance, latestDate]);

  const overview = useMemo(() => {
    const present = todayRecords.filter((r) => r.status === "present").length;
    const absent = todayRecords.filter((r) => r.status === "absent").length;
    const late = todayRecords.filter((r) => r.status === "late").length;
    const rate = todayRecords.length > 0 ? Math.round((present / todayRecords.length) * 100) : 0;

    return [
      { title: "إجمالي الطلاب", value: students.length, note: "جميع الصفوف", icon: Users },
      { title: "حاضرون اليوم", value: present, note: `${rate}% حضور`, icon: UserCheck },
      { title: "غائبون", value: absent, note: "إجمالي الغياب", icon: UserMinus },
      { title: "بعذر", value: excusesApprovedToday, note: "أعذار معتمدة", icon: ShieldAlert },
      { title: "بدون عذر", value: Math.max(0, absent - excusesApprovedToday), note: "تحتاج متابعة", icon: AlertTriangle },
      { title: "متأخرون", value: late, note: "حالات تأخر", icon: TrendingDown },
    ];
  }, [students, todayRecords, excusesApprovedToday]);

  const weeklyAbsence = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of attendance) {
      if (row.status !== "absent" && row.status !== "excused") continue;
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + 1);
    }

    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-5)
      .map(([date, value]) => ({
        day: new Date(date).toLocaleDateString("ar-SA", { weekday: "long" }),
        value,
      }));
  }, [attendance]);

  const gradeComparison = useMemo(() => {
    const byGrade = new Map<string, { total: number; present: number; absent: number }>();
    for (const row of todayRecords) {
      const current = byGrade.get(row.grade) ?? { total: 0, present: 0, absent: 0 };
      current.total += 1;
      if (row.status === "present") current.present += 1;
      if (row.status === "absent" || row.status === "excused") current.absent += 1;
      byGrade.set(row.grade, current);
    }

    return Array.from(byGrade.entries()).map(([grade, info]) => ({
      grade,
      total: info.total,
      present: info.present,
      absent: info.absent,
      rate: info.total > 0 ? Math.round((info.present / info.total) * 100) : 0,
    }));
  }, [todayRecords]);

  const highestAbsenceGrade = useMemo(() => {
    if (!gradeComparison.length) return "";
    return [...gradeComparison].sort((a, b) => b.absent - a.absent)[0]?.grade ?? "";
  }, [gradeComparison]);

  const { topAbsentStudents, committedStudents, riskLevels } = useMemo(() => {
    const byStudent = new Map<string, { name: string; className: string; absent: number; total: number }>();

    for (const row of attendance) {
      const current = byStudent.get(row.student_id) ?? { name: row.student_name, className: `${row.grade} / ${row.section}`, absent: 0, total: 0 };
      current.total += 1;
      if (row.status === "absent" || row.status === "excused") current.absent += 1;
      byStudent.set(row.student_id, current);
    }

    const list = Array.from(byStudent.values());

    const topAbsent = [...list]
      .sort((a, b) => b.absent - a.absent)
      .slice(0, 3)
      .map((item) => ({
        name: item.name,
        className: item.className,
        count: item.absent,
        risk: item.absent >= 4 ? "مرتفع" : item.absent >= 2 ? "متوسط" : "منخفض",
      }));

    const committed = [...list]
      .filter((item) => item.total > 0)
      .sort((a, b) => (b.total - b.absent) / b.total - (a.total - a.absent) / a.total)
      .slice(0, 3)
      .map((item) => ({
        name: item.name,
        className: item.className,
        rate: `${Math.round(((item.total - item.absent) / item.total) * 100)}%`,
      }));

    const buckets = { منخفض: 0, متوسط: 0, مرتفع: 0, حرج: 0 };
    for (const item of list) {
      if (item.absent >= 6) buckets["حرج"] += 1;
      else if (item.absent >= 4) buckets["مرتفع"] += 1;
      else if (item.absent >= 2) buckets["متوسط"] += 1;
      else buckets["منخفض"] += 1;
    }

    const risk = [
      { title: "منخفض", value: buckets["منخفض"], className: "bg-green-100 text-green-700" },
      { title: "متوسط", value: buckets["متوسط"], className: "bg-yellow-100 text-yellow-700" },
      { title: "مرتفع", value: buckets["مرتفع"], className: "bg-red-100 text-red-700" },
      { title: "حرج", value: buckets["حرج"], className: "bg-slate-900 text-white" },
    ];

    return { topAbsentStudents: topAbsent, committedStudents: committed, riskLevels: risk };
  }, [attendance]);

  const teacherCommitment = teacherCommitmentData;

  function handleExportExcel() {
    setExportError(null);
    setExportingExcel(true);
    try {
      exportAnalyticsToExcel({ overview, weeklyAbsence, gradeComparison, riskLevels, teacherCommitment, topAbsentStudents, committedStudents });
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تصدير ملف Excel.";
      console.error("[analytics:export:excel] failed:", err);
      setExportError(message);
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleExportPdf() {
    setExportError(null);
    setExportingPdf(true);
    try {
      if (!printAreaRef.current) throw new Error("منطقة التقرير غير جاهزة بعد.");
      await exportElementToPdf(printAreaRef.current, "تحليلات-الحضور");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إنشاء ملف PDF.";
      console.error("[analytics:export:pdf] failed:", err);
      setExportError(message);
    } finally {
      setExportingPdf(false);
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
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">التحليلات والإحصائيات</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            مركز تحليل الحضور والانضباط
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            قراءة تحليلية لمؤشرات الحضور والغياب، مقارنة الصفوف، التزام المعلمين، ومؤشر الخطورة.
          </p>
          {loading ? <p className="mt-2 text-xs text-slate-400">جارٍ تحميل البيانات...</p> : null}
        </header>

        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="grid gap-3 md:grid-cols-4">
            <select className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500">
              <option>اليوم</option>
              <option>هذا الأسبوع</option>
              <option>هذا الشهر</option>
              <option>هذا الفصل</option>
            </select>

            <button
              onClick={() => void loadAnalytics()}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <CalendarDays size={18} />}
              تحديث التحليل
            </button>

            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              {exportingExcel ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
              Excel
            </button>

            <button
              onClick={() => void handleExportPdf()}
              disabled={exportingPdf}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              {exportingPdf ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              PDF
            </button>
          </div>

          {exportError ? <p className="mt-3 text-xs font-bold text-red-600">{exportError}</p> : null}
        </section>

        <div id="analytics-print-area" ref={printAreaRef} className="space-y-5">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {overview.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">{item.title}</p>
                    <h2 className="mt-2 text-3xl font-black text-slate-900">
                      {item.value}
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">{item.note}</p>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <Icon size={22} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card title="الغياب الأسبوعي" icon={<BarChart3 size={20} />}>
            <div className="space-y-4">
              {weeklyAbsence.map((item) => {
                const percent = Math.min(100, Math.round((item.value / 40) * 100));

                return (
                  <div key={item.day} className="rounded-2xl bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900">{item.day}</h3>
                      <span className="text-sm font-bold text-blue-700">
                        {item.value} غياب
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-blue-700"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="مؤشر الخطورة" icon={<ShieldAlert size={20} />}>
            <div className="grid grid-cols-2 gap-3">
              {riskLevels.map((item) => (
                <div key={item.title} className="rounded-2xl bg-slate-50 p-4 text-center">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.className}`}>
                    {item.title}
                  </span>
                  <h3 className="mt-3 text-3xl font-black text-slate-900">{item.value}</h3>
                  <p className="mt-1 text-xs text-slate-500">طالب</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="القراءة التحليلية" icon={<TrendingUp size={20} />}>
            <div className="space-y-3">
              <Insight
                title="نسبة الحضور"
                detail={`نسبة الحضور في آخر يوم مرصود ${overview[1]?.note ?? "-"}.`}
              />
              <Insight
                title="تنبيه مهم"
                detail={
                  highestAbsenceGrade
                    ? `${highestAbsenceGrade} لديه أعلى معدل غياب حاليًا ويحتاج متابعة من الوكيل.`
                    : "لا توجد بيانات كافية لتحديد الصف الأعلى غيابًا بعد."
                }
              />
              <Insight
                title="توصية"
                detail={`يوجد ${riskLevels.find((r) => r.title === "مرتفع")?.value ?? 0} طالبًا بخطورة مرتفعة و${
                  riskLevels.find((r) => r.title === "حرج")?.value ?? 0
                } بخطورة حرجة، يُنصح بمراجعتهم أولًا.`}
              />
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="مقارنة الصفوف" icon={<Users size={20} />}>
            <div className="space-y-3">
              {gradeComparison.map((item) => (
                <div key={item.grade} className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">{item.grade}</h3>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                      {item.rate}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <Mini title="الإجمالي" value={item.total} />
                    <Mini title="حاضر" value={item.present} />
                    <Mini title="غائب" value={item.absent} />
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-700"
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="التزام المعلمين برفع التحضير" icon={<Medal size={20} />}>
            <div className="space-y-3">
              {teacherCommitment.map((item) => (
                <div key={item.teacher} className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">{item.teacher}</h3>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                      {item.rate}%
                    </span>
                  </div>

                  <p className="text-sm text-slate-500">
                    رفع {item.submitted} من أصل {item.total} حصة
                  </p>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-green-600"
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="أكثر الطلاب غيابًا" icon={<UserMinus size={20} />}>
            <div className="space-y-3">
              {topAbsentStudents.map((student) => (
                <div
                  key={student.name}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"
                >
                  <div>
                    <p className="font-bold text-slate-900">{student.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{student.className}</p>
                  </div>
                  <div className="text-left">
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                      {student.count} أيام
                    </span>
                    <p className="mt-2 text-xs text-slate-500">{student.risk}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="أكثر الطلاب التزامًا" icon={<UserCheck size={20} />}>
            <div className="space-y-3">
              {committedStudents.map((student) => (
                <div
                  key={student.name}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"
                >
                  <div>
                    <p className="font-bold text-slate-900">{student.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{student.className}</p>
                  </div>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                    {student.rate}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
        </div>

        <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="font-bold text-blue-900">ملاحظة تشغيلية</h2>
          <p className="mt-2 text-sm text-blue-800">
            تُحتسب هذه المؤشرات مباشرة من سجلات التحضير، الطلاب، الشعب، الأعذار، وسجل عدم الرفع في Supabase.
          </p>
        </section>
      </div>
    </section>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          {icon}
        </div>
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Mini({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <p className="text-xs text-slate-500">{title}</p>
      <h4 className="mt-1 text-lg font-black text-slate-900">{value}</h4>
    </div>
  );
}

function Insight({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}
