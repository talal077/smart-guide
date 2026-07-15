"use client";

import { useState } from "react";
import {
  Bell,
  CalendarDays,
  Edit3,
  KeyRound,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";

type Role = "teacher" | "vice_principal" | "admin" | "student";

const roleLabels: Record<Role, string> = {
  teacher: "معلم",
  vice_principal: "وكيل",
  admin: "إداري",
  student: "طالب",
};

export default function ProfilePage() {
  const [name, setName] = useState("وكيل المدرسة");
  const [role] = useState<Role>("vice_principal");
  const [phone, setPhone] = useState("05xxxxxxxx");
  const [email, setEmail] = useState("school@example.com");
  const [notifications, setNotifications] = useState(true);

  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">الملف الشخصي</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            بيانات الحساب
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            إدارة بيانات المستخدم، معلومات التواصل، والتنبيهات.
          </p>
        </header>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 xl:col-span-1">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-[32px] bg-blue-50 text-blue-700">
                <UserRound size={48} />
              </div>

              <h2 className="mt-4 text-xl font-black text-slate-900">
                {name}
              </h2>

              <span className="mt-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                {roleLabels[role]}
              </span>

              <p className="mt-3 text-sm text-slate-500">
                ثانوية الأمير عبدالمجيد بن عبدالعزيز
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <Info icon={<ShieldCheck size={18} />} label="الصلاحية" value="إدارة الغياب والتقارير" />
              <Info icon={<CalendarDays size={18} />} label="آخر دخول" value="2026-06-25 08:30" />
              <Info icon={<Bell size={18} />} label="الإشعارات" value={notifications ? "مفعلة" : "متوقفة"} />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 xl:col-span-2">
            <div className="mb-5 flex items-center gap-2">
              <Edit3 size={20} className="text-blue-700" />
              <h2 className="font-bold text-slate-900">تعديل البيانات</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="الاسم"
                value={name}
                onChange={setName}
                icon={<UserRound size={18} />}
              />

              <Field
                label="رقم الجوال"
                value={phone}
                onChange={setPhone}
                icon={<Phone size={18} />}
              />

              <Field
                label="البريد الإلكتروني"
                value={email}
                onChange={setEmail}
                icon={<Mail size={18} />}
              />

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  الدور
                </label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
                  {roleLabels[role]}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                onClick={() => setNotifications(!notifications)}
                className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-right"
              >
                <div className="flex items-center gap-3">
                  <Bell size={20} className="text-blue-700" />
                  <div>
                    <p className="font-bold text-slate-900">الإشعارات</p>
                    <p className="mt-1 text-xs text-slate-500">
                      تنبيهات عدم الرفع وإجراءات الطلاب
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    notifications
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {notifications ? "مفعلة" : "متوقفة"}
                </span>
              </button>

              <button className="flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">
                <KeyRound size={18} />
                تغيير كلمة المرور
              </button>
            </div>

            <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">
              <Save size={18} />
              حفظ التعديلات
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <h2 className="font-bold text-slate-900">نشاط الحساب</h2>

          <div className="mt-4 space-y-3">
            <Activity title="تسجيل دخول" time="اليوم 08:30" detail="تم تسجيل الدخول من متصفح Chrome." />
            <Activity title="اعتماد عذر" time="اليوم 09:10" detail="تم قبول عذر الطالب خالد أحمد الحربي." />
            <Activity title="إرسال تنبيه" time="اليوم 09:25" detail="تم إرسال تنبيه لشعبة لم ترفع التحضير." />
          </div>
        </section>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <div className="relative">
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
      <div className="text-blue-700">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <h3 className="mt-1 font-bold text-slate-900">{value}</h3>
      </div>
    </div>
  );
}

function Activity({
  title,
  time,
  detail,
}: {
  title: string;
  time: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-400">{time}</span>
      </div>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}