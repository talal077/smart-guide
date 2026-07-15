"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  CalendarCheck,
  ClipboardList,
  Database,
  FileSpreadsheet,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Megaphone,
  School,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { type SchoolSettings, getSchoolSettings } from "@/lib/schoolSettings";
import { type AppRole, getCurrentUser } from "@/lib/auth";
import NotificationBell from "@/components/NotificationBell";

const MANAGER_ROLES: AppRole[] = ["principal", "admin", "vice_principal"];

const mainItems = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/principal", label: "لوحة المدير", icon: ShieldCheck },
  { href: "/vice-principal", label: "لوحة الوكيل", icon: UserCog },
  { href: "/teacher", label: "لوحة المعلم", icon: GraduationCap },
  { href: "/student", label: "لوحة الطالب", icon: Users },
];

const attendanceItems = [
  { href: "/attendance", label: "تحضير الحصص", icon: CalendarCheck },
  { href: "/absence-records", label: "سجل الغياب", icon: ClipboardList },
  { href: "/student-actions", label: "إجراءات الطالب", icon: UserCog },
  { href: "/notifications", label: "الإشعارات", icon: Bell },
  { href: "/unsubmitted", label: "عدم الرفع", icon: Activity },
  { href: "/excuses", label: "الأعذار", icon: ClipboardList },
];

const managementItems = [
  { href: "/school", label: "إدارة المدرسة", icon: School },
  { href: "/students", label: "الطلاب", icon: Users },
  { href: "/teachers", label: "المعلمون", icon: GraduationCap },
  { href: "/subjects", label: "المواد", icon: BookOpen },
  { href: "/classes", label: "الشعب", icon: School },
  { href: "/basic-data", label: "إدارة البيانات الأساسية", icon: Boxes },
  { href: "/teacher-assignments", label: "إسناد المعلمين", icon: UserCog },
  { href: "/schedule", label: "الجدول الدراسي", icon: CalendarCheck },
  { href: "/noor-import", label: "استيراد نور", icon: FileSpreadsheet },
  { href: "/news", label: "الأخبار", icon: Megaphone },
];

const systemItems = [
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/analytics", label: "الإحصائيات", icon: BarChart3 },
  { href: "/audit-log", label: "سجل العمليات", icon: Activity },
  { href: "/login-log", label: "سجل الدخول", icon: Database },
  { href: "/users", label: "المستخدمون", icon: Users },
  { href: "/profile", label: "الملف الشخصي", icon: UserCog },
  { href: "/demo-data", label: "البيانات التجريبية", icon: Database },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

const bottomItems = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/attendance", label: "التحضير", icon: CalendarCheck },
  { href: "/students", label: "الطلاب", icon: Users },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/setup") return;

    let cancelled = false;
    getSchoolSettings()
      .then((settings) => {
        if (!cancelled) setSchool(settings);
      })
      .catch(() => {
        if (!cancelled) setSchool(null);
      });

    getCurrentUser()
      .then((user) => {
        if (!cancelled) setRole(user?.role ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const visibleAttendanceItems = attendanceItems.filter(
    (item) => item.href !== "/student-actions" || (role !== null && MANAGER_ROLES.includes(role))
  );
  const visibleSystemItems = systemItems.filter(
    (item) => item.href !== "/audit-log" || (role !== null && MANAGER_ROLES.includes(role))
  );

  if (pathname === "/login" || pathname === "/setup") {
    return <>{children}</>;
  }

  const educationLabel = school ? `إدارة تعليم ${school.educationAdministrationName}` : "إدارة تعليم ...";
  const schoolName = school?.schoolName ?? "...";
  const academicYearLabel = school ? `العام الدراسي ${school.academicYearLabel}` : "العام الدراسي ...";

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed right-0 top-0 z-30 hidden h-screen w-72 border-l border-slate-200 bg-white p-4 lg:block">
        <div className="rounded-3xl bg-gradient-to-l from-blue-800 to-blue-600 p-5 text-white">
          <p className="text-xs text-blue-100">وزارة التعليم</p>
          <p className="text-sm text-blue-100">{educationLabel}</p>
          <h1 className="mt-1 text-lg font-bold">{schoolName}</h1>
          <p className="mt-2 text-xs text-blue-100">{academicYearLabel}</p>
        </div>

        <div className="mt-4 h-[calc(100vh-180px)] space-y-5 overflow-y-auto pr-1">
          <NavGroup title="لوحات التحكم" items={mainItems} pathname={pathname} />
          <NavGroup title="الحضور والانضباط" items={visibleAttendanceItems} pathname={pathname} />
          <NavGroup title="الإدارة المدرسية" items={managementItems} pathname={pathname} />
          <NavGroup title="النظام" items={visibleSystemItems} pathname={pathname} />
        </div>

        <Link
          href="/login"
          className="absolute bottom-4 right-4 left-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600"
        >
          <LogOut size={18} />
          تسجيل الخروج
        </Link>
      </aside>

      <div className="lg:pr-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-400">وزارة التعليم — {educationLabel}</p>
              <h2 className="text-sm font-bold text-slate-900">{schoolName}</h2>
              <p className="text-xs text-slate-500">{academicYearLabel}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 sm:inline">
                وكيل / إداري
              </span>

              <NotificationBell active={pathname === "/notifications" || pathname.startsWith("/notifications/")} />

              <button className="rounded-xl bg-slate-100 p-2 lg:hidden">
                <Menu size={22} />
              </button>
            </div>
          </div>
        </header>

        <main className="pb-24 lg:pb-6">{children}</main>

        <nav className="fixed bottom-0 right-0 left-0 z-30 border-t border-slate-200 bg-white px-2 py-2 lg:hidden">
          <div className="grid grid-cols-5 gap-1">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-bold ${
                    active ? "bg-blue-700 text-white" : "text-slate-500"
                  }`}
                >
                  <Icon size={19} />
                  <span className="mt-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavGroup({
  title,
  items,
  pathname,
}: {
  title: string;
  items: { href: string; label: string; icon: React.ComponentType<{ size?: number }> }[];
  pathname: string;
}) {
  return (
    <nav>
      <p className="mb-2 px-2 text-xs font-bold text-slate-400">{title}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                active
                  ? "bg-blue-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={19} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
