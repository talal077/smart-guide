"use client";

import { useState } from "react";
import {
  ArchiveRestore,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileSpreadsheet,
  GraduationCap,
  HardDrive,
  RefreshCw,
  Save,
  School,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

type StaffRole = "principal" | "vice_principal" | "admin" | "counselor" | "activity_leader";

const staffRoleLabels: Record<StaffRole, string> = {
  principal: "مدير المدرسة",
  vice_principal: "وكيل المدرسة",
  admin: "إداري",
  counselor: "موجه طلابي",
  activity_leader: "رائد النشاط",
};

const staff = [
  { id: 1, name: "مدير المدرسة", role: "principal" as StaffRole, phone: "05xxxxxxxx" },
  { id: 2, name: "وكيل المدرسة", role: "vice_principal" as StaffRole, phone: "05xxxxxxxx" },
  { id: 3, name: "الإداري", role: "admin" as StaffRole, phone: "05xxxxxxxx" },
  { id: 4, name: "الموجه الطلابي", role: "counselor" as StaffRole, phone: "05xxxxxxxx" },
  { id: 5, name: "رائد النشاط", role: "activity_leader" as StaffRole, phone: "05xxxxxxxx" },
];

const indicators = [
  { title: "نسبة حضور اليوم", value: "91%", note: "438 حاضرًا", icon: UserCheck },
  { title: "غياب اليوم", value: 31, note: "12 بعذر / 19 بدون عذر", icon: Users },
  { title: "الشعب المتأخرة", value: 3, note: "لم ترفع التحضير", icon: Clock3 },
  { title: "الأعذار المعلقة", value: 6, note: "بانتظار الاعتماد", icon: CheckCircle2 },
];

export default function SchoolPage() {
  const [schoolName, setSchoolName] = useState("ثانوية الأمير عبدالمجيد بن عبدالعزيز");
  const [educationOffice, setEducationOffice] = useState("إدارة تعليم المدينة المنورة");
  const [schoolCode, setSchoolCode] = useState("MDN-1447");
  const [principalName, setPrincipalName] = useState("مدير المدرسة");
  const [vicePrincipalName, setVicePrincipalName] = useState("وكيل المدرسة");
  const [startTime, setStartTime] = useState("07:30");
  const [endTime, setEndTime] = useState("13:30");
  const [periodsCount, setPeriodsCount] = useState(7);
  const [periodDuration, setPeriodDuration] = useState(45);
  const [breakTime, setBreakTime] = useState("10:05");

  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-gradient-to-l from-blue-800 to-blue-600 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-blue-100">إدارة المدرسة</p>
              <h1 className="mt-2 text-3xl font-black">مركز بيانات المدرسة</h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-100">
                إدارة بيانات المدرسة، الكادر الإداري، اليوم الدراسي، المؤشرات التشغيلية، والنسخ الاحتياطي.
              </p>
            </div>

            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15">
              <School size={42} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat title="الطلاب" value={482} icon={<Users size={22} />} />
          <Stat title="المعلمون" value={34} icon={<GraduationCap size={22} />} />
          <Stat title="الشعب" value={18} icon={<Building2 size={22} />} />
          <Stat title="المواد" value={12} icon={<FileSpreadsheet size={22} />} />
          <Stat title="الحصص اليومية" value={periodsCount} icon={<CalendarClock size={22} />} />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="معلومات المدرسة" icon={<School size={22} />}>
            <div className="grid gap-4">
              <Field label="اسم المدرسة" value={schoolName} onChange={setSchoolName} />
              <Field label="الإدارة التعليمية" value={educationOffice} onChange={setEducationOffice} />
              <Field label="رمز المدرسة" value={schoolCode} onChange={setSchoolCode} />
              <Field label="مدير المدرسة" value={principalName} onChange={setPrincipalName} />
              <Field label="وكيل المدرسة" value={vicePrincipalName} onChange={setVicePrincipalName} />

              <button className="flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">
                <Save size={18} />
                حفظ بيانات المدرسة
              </button>
            </div>
          </Card>

          <Card title="إعدادات اليوم الدراسي" icon={<CalendarClock size={22} />}>
            <div className="grid gap-4 md:grid-cols-2">
              <TimeField label="بداية اليوم" value={startTime} onChange={setStartTime} />
              <TimeField label="نهاية اليوم" value={endTime} onChange={setEndTime} />

              <NumberField
                label="عدد الحصص"
                value={periodsCount}
                onChange={setPeriodsCount}
              />

              <NumberField
                label="زمن الحصة بالدقائق"
                value={periodDuration}
                onChange={setPeriodDuration}
              />

              <TimeField label="وقت الفسحة" value={breakTime} onChange={setBreakTime} />

              <div className="rounded-2xl bg-blue-50 p-4">
                <p className="text-xs text-blue-700">ملخص اليوم</p>
                <h3 className="mt-1 font-bold text-blue-900">
                  {periodsCount} حصص × {periodDuration} دقيقة
                </h3>
              </div>
            </div>

            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">
              <Save size={18} />
              حفظ إعدادات اليوم الدراسي
            </button>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card title="الكادر الإداري" icon={<ShieldCheck size={22} />}>
            <div className="space-y-3">
              {staff.map((member) => (
                <div key={member.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900">{member.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {staffRoleLabels[member.role]}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                      نشط
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">الجوال: {member.phone}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="المؤشرات المباشرة" icon={<BarChart3 size={22} />} className="xl:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              {indicators.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">{item.title}</p>
                        <h3 className="mt-1 text-3xl font-black text-slate-900">
                          {item.value}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">{item.note}</p>
                      </div>

                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                        <Icon size={22} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-900">مؤشر الانضباط العام</p>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full w-[86%] rounded-full bg-blue-700" />
              </div>
              <p className="mt-2 text-sm text-blue-800">النسبة الحالية: 86%</p>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card title="إجراءات سريعة" icon={<Settings size={22} />}>
            <div className="space-y-3">
              <Action icon={<FileSpreadsheet size={18} />} title="استيراد بيانات نور" />
              <Action icon={<Download size={18} />} title="تصدير قاعدة البيانات" />
              <Action icon={<HardDrive size={18} />} title="إنشاء نسخة احتياطية" />
              <Action icon={<ArchiveRestore size={18} />} title="استعادة نسخة احتياطية" />
              <Action icon={<RefreshCw size={18} />} title="مزامنة البيانات" />
            </div>
          </Card>

          <Card title="حالة النظام" icon={<Database size={22} />}>
            <div className="space-y-3">
              <SystemStatus title="قاعدة البيانات" value="جاهزة للربط" />
              <SystemStatus title="الإشعارات" value="مفعلة واجهيًا" />
              <SystemStatus title="التقارير" value="جاهزة" />
              <SystemStatus title="النسخ الاحتياطي" value="غير مربوط بعد" />
              <SystemStatus title="سجل العمليات" value="مفعل واجهيًا" />
            </div>
          </Card>

          <Card title="ملخص المدرسة" icon={<Building2 size={22} />}>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">اسم المدرسة</p>
              <h3 className="mt-1 font-black text-slate-900">{schoolName}</h3>
            </div>

            <div className="mt-3 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">الإدارة</p>
              <h3 className="mt-1 font-bold text-slate-900">{educationOffice}</h3>
            </div>

            <div className="mt-3 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">اليوم الدراسي</p>
              <h3 className="mt-1 font-bold text-slate-900">
                من {startTime} إلى {endTime}
              </h3>
            </div>
          </Card>
        </section>

        <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="font-bold text-blue-900">ملاحظات تشغيلية</h2>
          <ul className="mt-4 space-y-2 text-sm text-blue-800">
            <li>• هذه الصفحة ستكون المرجع الإداري الأساسي عند ربط Supabase.</li>
            <li>• إعدادات اليوم الدراسي ستؤثر لاحقًا على الجدول والتحضير وتنبيهات عدم الرفع.</li>
            <li>• كل تعديل على بيانات المدرسة يجب تسجيله في سجل العمليات.</li>
            <li>• النسخ الاحتياطي والمزامنة ستحتاج ربطًا فعليًا بقاعدة البيانات والتخزين.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{value}</h3>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl bg-white p-5 shadow-sm border border-slate-100 ${className}`}>
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          {icon}
        </div>
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
      />
    </div>
  );
}

function Action({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-right transition hover:bg-blue-50">
      <div className="text-blue-700">{icon}</div>
      <span className="font-bold text-slate-800">{title}</span>
    </button>
  );
}

function SystemStatus({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
      <p className="font-bold text-slate-800">{title}</p>
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
        {value}
      </span>
    </div>
  );
}
