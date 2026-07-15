"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Send,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";

const kpis = [
  { title: "شعبي اليوم", value: 4, note: "حصص مجدولة", icon: CalendarCheck },
  { title: "تم الرفع", value: 3, note: "حصص مكتملة", icon: CheckCircle2 },
  { title: "بانتظار الرفع", value: 1, note: "حصة متبقية", icon: AlertTriangle },
  { title: "حاضرون", value: 116, note: "في حصصي اليوم", icon: UserCheck },
  { title: "غائبون", value: 9, note: "في حصصي اليوم", icon: UserMinus },
];

const todayClasses = [
  {
    period: "الحصة الأولى",
    time: "07:30 - 08:15",
    className: "الأول الثانوي / أ",
    subject: "الرياضيات",
    status: "تم الرفع",
  },
  {
    period: "الحصة الثانية",
    time: "08:20 - 09:05",
    className: "الأول الثانوي / ب",
    subject: "الرياضيات",
    status: "تم الرفع",
  },
  {
    period: "الحصة الثالثة",
    time: "09:20 - 10:05",
    className: "الثاني الثانوي / أ",
    subject: "الرياضيات",
    status: "بانتظار الرفع",
  },
];

const teacherNotifications = [
  {
    type: "استدعاء",
    student: "خالد أحمد الحربي",
    className: "الأول الثانوي / أ",
    time: "08:35",
  },
  {
    type: "استئذان",
    student: "سعد محمد الجهني",
    className: "الثاني الثانوي / ب",
    time: "09:10",
  },
  {
    type: "دخول",
    student: "باسل فهد الحربي",
    className: "الثالث الثانوي / ج",
    time: "09:25",
  },
];

const topAbsent = [
  { name: "خالد أحمد الحربي", className: "أول / أ", count: 4 },
  { name: "سعد محمد الجهني", className: "ثاني / ب", count: 3 },
  { name: "تركي ناصر المطيري", className: "ثالث / ج", count: 2 },
];

export default function TeacherPage() {
  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-l from-blue-800 to-blue-600 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-blue-100">لوحة المعلم</p>
              <h1 className="mt-1 text-2xl font-black">
                متابعة حصصي وتحضير الطلاب
              </h1>
              <p className="mt-2 text-sm text-blue-100">
                عرض حصص اليوم، حالة رفع التحضير، إشعارات الطلاب، وملخص الغياب.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blue-700">
                بدء التحضير
              </button>
              <button className="rounded-2xl bg-blue-950/40 px-4 py-3 text-sm font-bold text-white">
                سجل حصصي
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
          <Card title="حصصي اليوم" icon={<CalendarCheck size={20} />}>
            <div className="space-y-3">
              {todayClasses.map((item) => (
                <div
                  key={`${item.period}-${item.className}`}
                  className="rounded-2xl bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">{item.period}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        item.status === "تم الرفع"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    {item.time} — {item.className}
                  </p>
                  <p className="mt-1 text-sm font-bold text-blue-700">
                    {item.subject}
                  </p>

                  <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-bold text-white">
                    <CalendarCheck size={16} />
                    فتح التحضير
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="إشعارات الطلاب" icon={<Send size={20} />}>
            <div className="space-y-3">
              {teacherNotifications.map((item) => (
                <div
                  key={`${item.type}-${item.student}`}
                  className="rounded-2xl bg-blue-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">
                      {item.type} — {item.student}
                    </h3>
                    <span className="text-xs text-slate-400">{item.time}</span>
                  </div>

                  <p className="mt-2 text-sm text-slate-500">{item.className}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="rounded-xl bg-green-700 px-3 py-2 text-xs font-bold text-white">
                      تم التنفيذ
                    </button>
                    <button className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white">
                      تأجيل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="أكثر طلابي غيابًا" icon={<UserMinus size={20} />}>
            <div className="space-y-3">
              {topAbsent.map((student) => (
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
                    {student.count} أيام
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="ملخص حصصي اليوم" icon={<BarChart3 size={20} />}>
            <div className="space-y-3">
              <SummaryRow title="نسبة رفع التحضير" value={75} />
              <SummaryRow title="نسبة الحضور في حصصي" value={93} />
              <SummaryRow title="نسبة الغياب في حصصي" value={7} />
            </div>
          </Card>

          <Card title="آخر عملياتي" icon={<Clock3 size={20} />}>
            <div className="space-y-3">
              <Activity title="رفع تحضير" detail="تم رفع تحضير الأول الثانوي / أ" />
              <Activity title="تعديل ملاحظة" detail="تم تحديث ملاحظة الطالب سعد محمد الجهني" />
              <Activity title="تنفيذ إشعار" detail="تم تنفيذ طلب دخول الطالب باسل فهد الحربي" />
            </div>
          </Card>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <QuickAction title="تحضير الحصص" icon={<CalendarCheck size={22} />} />
          <QuickAction title="سجل الغياب" icon={<FileText size={22} />} />
          <QuickAction title="قائمة طلابي" icon={<Users size={22} />} />
          <QuickAction title="إشعاراتي" icon={<Send size={22} />} />
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

function SummaryRow({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold text-slate-900">{title}</h3>
        <span className="text-sm font-bold text-blue-700">{value}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-700"
          style={{ width: `${value}%` }}
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