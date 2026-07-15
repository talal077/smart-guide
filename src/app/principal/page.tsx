"use client";

import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Megaphone,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";

const kpis = [
  { title: "إجمالي الطلاب", value: 482, note: "جميع الصفوف", icon: Users },
  { title: "الحاضرون", value: 438, note: "91% حضور", icon: UserCheck },
  { title: "الغائبون", value: 31, note: "12 بعذر / 19 بدون عذر", icon: UserMinus },
  { title: "المتأخرون", value: 13, note: "حالات تأخر اليوم", icon: Clock3 },
  { title: "الأعذار", value: 6, note: "بانتظار الاعتماد", icon: FileText },
  { title: "عدم الرفع", value: 3, note: "شعب متأخرة", icon: AlertTriangle },
];

const liveSummary = [
  { title: "حاضر", value: 438, className: "bg-green-100 text-green-800" },
  { title: "بعذر", value: 12, className: "bg-blue-100 text-blue-800" },
  { title: "بدون عذر", value: 19, className: "bg-red-100 text-red-800" },
  { title: "متأخر", value: 13, className: "bg-amber-100 text-amber-800" },
];

const lateClasses = [
  {
    className: "الأول الثانوي / أ",
    period: "الحصة الثانية",
    teacher: "أ. عبدالله الحربي",
    status: "لم يتم الرفع",
  },
  {
    className: "الثاني الثانوي / ب",
    period: "الحصة الثالثة",
    teacher: "أ. محمد السلمي",
    status: "رفع متأخر",
  },
  {
    className: "الثالث الثانوي / ج",
    period: "الحصة الرابعة",
    teacher: "أ. فهد العوفي",
    status: "لم يتم الرفع",
  },
];

const riskStudents = [
  { name: "خالد أحمد الحربي", className: "أول / أ", absences: 7, risk: "مرتفع" },
  { name: "سعد محمد الجهني", className: "ثاني / ب", absences: 5, risk: "متوسط" },
  { name: "تركي ناصر المطيري", className: "ثالث / ج", absences: 4, risk: "منخفض" },
];

const stageRows = [
  { stage: "الأول الثانوي", total: 160, present: 149, absent: 11 },
  { stage: "الثاني الثانوي", total: 158, present: 142, absent: 16 },
  { stage: "الثالث الثانوي", total: 164, present: 147, absent: 17 },
];

const recentActions = [
  {
    title: "رفع تحضير",
    detail: "أ. عبدالله الحربي رفع تحضير الأول الثانوي / أ",
    time: "08:15",
  },
  {
    title: "قبول عذر",
    detail: "تم قبول عذر الطالب خالد أحمد الحربي",
    time: "09:10",
  },
  {
    title: "تنبيه عدم رفع",
    detail: "إرسال تنبيه لشعبة الثاني الثانوي / ب",
    time: "09:25",
  },
];

const news = [
  "تذكير برفع التحضير خلال أول عشر دقائق من الحصة.",
  "تفعيل الحصر المباشر اليومي لجميع الشعب.",
  "مراجعة الأعذار المعلقة قبل نهاية الدوام.",
];

export default function PrincipalPage() {
  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-l from-blue-800 to-blue-600 p-4 text-white shadow-sm md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-blue-100">لوحة مدير المدرسة</p>
              <h1 className="mt-1 text-2xl font-black text-white md:text-3xl">
                المتابعة القيادية للحضور والانضباط
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">
                متابعة فورية للحضور، الغياب، الأعذار، الشعب المتأخرة، ومؤشرات الخطورة.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blue-700">
                حصر الغياب الآن
              </button>
              <button className="rounded-2xl bg-blue-950/40 px-4 py-3 text-sm font-bold text-white">
                تقرير اليوم
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <Icon size={22} />
                </div>
                <p className="text-sm text-slate-500">{item.title}</p>
                <h2 className="mt-2 text-4xl font-black text-slate-900">{item.value}</h2>
                <p className="mt-1 text-xs text-slate-400">{item.note}</p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card title="المؤشر العام" icon={<BarChart3 size={20} />}>
            <div className="rounded-3xl bg-blue-700 p-5 text-white">
              <p className="text-sm text-blue-100">مؤشر الانضباط المدرسي</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-5xl font-black">86%</h2>
                  <p className="mt-2 text-sm text-blue-100">
                    مستوى جيد مع وجود تنبيهات تحتاج متابعة.
                  </p>
                </div>
                <TrendingUp size={42} className="text-blue-100" />
              </div>
              <div className="mt-5 h-4 overflow-hidden rounded-full bg-white/25">
                <div className="h-full w-[86%] rounded-full bg-white" />
              </div>
            </div>
          </Card>

          <Card title="الحصر المباشر اليومي" icon={<Megaphone size={20} />}>
            <div className="grid grid-cols-2 gap-3">
              {liveSummary.map((item) => (
                <div key={item.title} className={`rounded-2xl p-4 text-center ${item.className}`}>
                  <p className="text-sm font-black">{item.title}</p>
                  <h3 className="mt-2 text-4xl font-black">{item.value}</h3>
                </div>
              ))}
            </div>
          </Card>

          <Card title="القراءة التنفيذية" icon={<ShieldAlert size={20} />}>
            <div className="space-y-3">
              <Insight
                title="الوضع العام مستقر"
                detail="نسبة الحضور جيدة، مع وجود ثلاث شعب متأخرة في رفع التحضير."
              />
              <Insight
                title="الأولوية"
                detail="معالجة الغياب بدون عذر واعتماد الأعذار المعلقة قبل نهاية اليوم."
              />
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card title="الشعب المتأخرة" icon={<AlertTriangle size={20} />}>
            <div className="space-y-3">
              {lateClasses.map((item) => (
                <div key={item.className} className="rounded-2xl bg-red-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-slate-900">{item.className}</h3>
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {item.period} — {item.teacher}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="مؤشر الخطورة" icon={<ShieldAlert size={20} />}>
            <div className="space-y-3">
              {riskStudents.map((student) => (
                <div
                  key={student.name}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"
                >
                  <div>
                    <p className="font-bold text-slate-900">{student.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {student.className} — {student.absences} أيام غياب
                    </p>
                  </div>
                  <RiskBadge risk={student.risk} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="آخر العمليات" icon={<BellRing size={20} />}>
            <div className="space-y-3">
              {recentActions.map((item) => (
                <div
                  key={`${item.title}-${item.time}`}
                  className="rounded-2xl bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-slate-900">{item.title}</h3>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock3 size={14} />
                      {item.time}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="ملخص الحضور حسب المرحلة" icon={<Users size={20} />}>
            <div className="space-y-3">
              {stageRows.map((row) => (
                <StageRow key={row.stage} {...row} />
              ))}
            </div>
          </Card>

          <Card title="الأخبار والتنبيهات" icon={<Megaphone size={20} />}>
            <div className="space-y-3">
              {news.map((item) => (
                <div key={item} className="rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-800">
                  {item}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <QuickAction title="تحضير الحصص" icon={<CalendarCheck size={22} />} />
          <QuickAction title="التقارير" icon={<BarChart3 size={22} />} />
          <QuickAction title="الأعذار" icon={<CheckCircle2 size={22} />} />
          <QuickAction title="سجل الغياب" icon={<UserMinus size={22} />} />
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

function StageRow({
  stage,
  total,
  present,
  absent,
}: {
  stage: string;
  total: number;
  present: number;
  absent: number;
}) {
  const rate = Math.round((present / total) * 100);

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900">{stage}</h3>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
          {rate}%
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <MiniBox title="الإجمالي" value={total} />
        <MiniBox title="حاضر" value={present} />
        <MiniBox title="غائب" value={absent} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-700" style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

function MiniBox({ title, value }: { title: string; value: number }) {
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

function RiskBadge({ risk }: { risk: string }) {
  const className =
    risk === "مرتفع"
      ? "bg-red-100 text-red-700"
      : risk === "متوسط"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-green-100 text-green-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}>
      {risk}
    </span>
  );
}

function QuickAction({
  title,
  icon,
}: {
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button className="rounded-3xl bg-white p-4 text-right shadow-sm border border-slate-100 transition hover:bg-blue-50">
      <div className="mb-3 text-blue-700">{icon}</div>
      <h3 className="font-bold text-slate-900">{title}</h3>
    </button>
  );
}
