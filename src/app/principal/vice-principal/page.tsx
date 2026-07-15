"use client";

import {
  AlertTriangle,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  DoorOpen,
  FileText,
  LogIn,
  Megaphone,
  ShieldAlert,
  UserCheck,
  UserMinus,
} from "lucide-react";

const kpis = [
  { title: "حضور اليوم", value: 438, note: "طالب حاضر", icon: UserCheck },
  { title: "غياب اليوم", value: 31, note: "طالب غائب", icon: UserMinus },
  { title: "بدون عذر", value: 19, note: "تحتاج معالجة", icon: ShieldAlert },
  { title: "أعذار معلقة", value: 6, note: "بانتظار الاعتماد", icon: FileText },
  { title: "عدم الرفع", value: 3, note: "شعب متأخرة", icon: AlertTriangle },
];

const pendingActions = [
  {
    type: "استدعاء",
    student: "خالد أحمد الحربي",
    className: "الأول الثانوي / أ",
    teacher: "أ. عبدالله الحربي",
    time: "08:35",
  },
  {
    type: "استئذان",
    student: "سعد محمد الجهني",
    className: "الثاني الثانوي / ب",
    teacher: "أ. محمد السلمي",
    time: "09:10",
  },
  {
    type: "دخول",
    student: "باسل فهد الحربي",
    className: "الثالث الثانوي / ج",
    teacher: "أ. فهد العوفي",
    time: "09:25",
  },
];

const unsubmitted = [
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
];

const riskStudents = [
  { name: "خالد أحمد الحربي", className: "أول / أ", absences: 7 },
  { name: "سعد محمد الجهني", className: "ثاني / ب", absences: 5 },
  { name: "تركي ناصر المطيري", className: "ثالث / ج", absences: 4 },
];

export default function VicePrincipalPage() {
  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-l from-blue-800 to-blue-600 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-blue-100">لوحة الوكيل</p>
              <h1 className="mt-1 text-2xl font-black">
                متابعة الغياب والإجراءات اليومية
              </h1>
              <p className="mt-2 text-sm text-blue-100">
                إدارة الأعذار، تنبيهات عدم الرفع، إجراءات الطلاب، ومؤشرات الخطورة.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blue-700">
                حصر الغياب الآن
              </button>
              <button className="rounded-2xl bg-blue-950/40 px-4 py-3 text-sm font-bold text-white">
                إجراء طالب
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {kpis.map((item) => {
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
          <Card title="إجراءات الطلاب المعلقة" icon={<BellRing size={20} />}>
            <div className="space-y-3">
              {pendingActions.map((item) => (
                <div
                  key={`${item.type}-${item.student}`}
                  className="rounded-2xl bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">
                      {item.type} — {item.student}
                    </h3>
                    <span className="text-xs text-slate-400">{item.time}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {item.className} — {item.teacher}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="الشعب المتأخرة" icon={<AlertTriangle size={20} />}>
            <div className="space-y-3">
              {unsubmitted.map((item) => (
                <div
                  key={item.className}
                  className="rounded-2xl bg-red-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
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
                      {student.className}
                    </p>
                  </div>
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                    {student.absences} أيام
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <ActionCard
            title="استدعاء طالب"
            description="إرسال إشعار فوري للمعلم"
            icon={<Megaphone size={24} />}
            color="bg-red-50 text-red-700"
          />
          <ActionCard
            title="استئذان طالب"
            description="تسجيل خروج الطالب بعذر"
            icon={<DoorOpen size={24} />}
            color="bg-blue-50 text-blue-700"
          />
          <ActionCard
            title="دخول طالب"
            description="توجيه الطالب للدخول للحصة"
            icon={<LogIn size={24} />}
            color="bg-green-50 text-green-700"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="ملخص الغياب" icon={<CalendarCheck size={20} />}>
            <div className="space-y-3">
              <SummaryRow title="غياب بعذر" value={12} total={31} />
              <SummaryRow title="غياب بدون عذر" value={19} total={31} />
              <SummaryRow title="متأخرون" value={13} total={482} />
            </div>
          </Card>

          <Card title="آخر نشاط" icon={<Clock3 size={20} />}>
            <div className="space-y-3">
              <Activity title="قبول عذر" detail="تم قبول عذر الطالب سعد محمد الجهني" />
              <Activity title="تنبيه معلم" detail="إرسال تنبيه عدم رفع للصف الأول / أ" />
              <Activity title="إجراء طالب" detail="تم إنشاء طلب استدعاء للطالب خالد أحمد الحربي" />
            </div>
          </Card>
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

function ActionCard({
  title,
  description,
  icon,
  color,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <button className="rounded-3xl bg-white p-4 text-right shadow-sm border border-slate-100">
      <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}>
        {icon}
      </div>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </button>
  );
}

function SummaryRow({
  title,
  value,
  total,
}: {
  title: string;
  value: number;
  total: number;
}) {
  const percent = Math.round((value / total) * 100);

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-slate-900">{title}</h3>
        <span className="text-sm font-bold text-blue-700">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-700"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Activity({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} className="text-green-700" />
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}