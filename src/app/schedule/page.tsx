"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Clock3,
  Edit3,
  FileDown,
  Plus,
  Search,
  Trash2,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu";

type ScheduleItem = {
  id: string;
  day: DayKey;
  period: string;
  time: string;
  grade: string;
  section: string;
  subject: string;
  teacher: string;
  room: string;
};

const days: { key: DayKey; label: string }[] = [
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الاثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
];

const DAY_NAME_TO_KEY: Record<string, DayKey> = {
  "الأحد": "sun",
  "الاثنين": "mon",
  "الثلاثاء": "tue",
  "الأربعاء": "wed",
  "الخميس": "thu",
};

const PERIOD_NAMES = [
  "الحصة الأولى",
  "الحصة الثانية",
  "الحصة الثالثة",
  "الحصة الرابعة",
  "الحصة الخامسة",
  "الحصة السادسة",
  "الحصة السابعة",
];

const PERIOD_TIMES = ["07:30 - 08:15", "08:20 - 09:05", "09:20 - 10:05", "10:10 - 10:55", "11:10 - 11:55", "12:00 - 12:45", "12:50 - 13:35"];

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<"all" | DayKey>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadSchedule() {
      setLoading(true);
      const { data, error } = await supabase
        .from("class_schedule")
        .select("id, day_of_week, period, grade, section, subjects(name), profiles(full_name)")
        .order("day_of_week", { ascending: true })
        .order("period", { ascending: true });

      if (cancelled) return;

      if (error || !data) {
        setSchedule([]);
        setLoading(false);
        return;
      }

      const items: ScheduleItem[] = data.map((row) => {
        const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
        const teacher = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const period = Number(row.period);

        return {
          id: String(row.id),
          day: DAY_NAME_TO_KEY[String(row.day_of_week)] ?? "sun",
          period: PERIOD_NAMES[period - 1] ?? `الحصة ${period}`,
          time: PERIOD_TIMES[period - 1] ?? "-",
          grade: String(row.grade ?? ""),
          section: String(row.section ?? ""),
          subject: String(subject?.name ?? "-"),
          teacher: String(teacher?.full_name ?? "-"),
          room: "-",
        };
      });

      setSchedule(items);
      setLoading(false);
    }

    void loadSchedule();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSchedule = useMemo(() => {
    return schedule.filter((item) => {
      const matchesSearch =
        item.period.includes(search) ||
        item.grade.includes(search) ||
        item.section.includes(search) ||
        item.subject.includes(search) ||
        item.teacher.includes(search) ||
        item.room.includes(search);

      const matchesDay = dayFilter === "all" || item.day === dayFilter;

      return matchesSearch && matchesDay;
    });
  }, [schedule, search, dayFilter]);

  function deleteItem(id: string) {
    setSchedule((prev) => prev.filter((item) => item.id !== id));
  }

  const totalClasses = schedule.length;
  const teachersCount = new Set(schedule.map((item) => item.teacher)).size;
  const subjectsCount = new Set(schedule.map((item) => item.subject)).size;
  const sectionsCount = new Set(
    schedule.map((item) => `${item.grade}-${item.section}`)
  ).size;

  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">الجدول الدراسي</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            إدارة جدول الحصص
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            ربط اليوم والحصة بالمعلم والمادة والصف والشعبة، ليتم فتح التحضير تلقائيًا حسب الجدول.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat title="إجمالي الحصص" value={totalClasses} icon={<CalendarDays size={22} />} />
          <Stat title="المعلمون" value={teachersCount} icon={<UserCheck size={22} />} />
          <Stat title="المواد" value={subjectsCount} icon={<BookOpen size={22} />} />
          <Stat title="الشعب" value={sectionsCount} icon={<CalendarDays size={22} />} />
          <Stat title="أيام الأسبوع" value={5} icon={<Clock3 size={22} />} />
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Search
                size={18}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالحصة، المادة، المعلم، الصف، القاعة"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value as "all" | DayKey)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">كل الأيام</option>
              {days.map((day) => (
                <option key={day.key} value={day.key}>
                  {day.label}
                </option>
              ))}
            </select>

            <button className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
              <FileDown size={18} />
              Excel
            </button>

            <button className="flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">
              <Plus size={18} />
              إضافة حصة
            </button>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-5">
          {days.map((day) => {
            const dayItems = filteredSchedule.filter(
              (item) => item.day === day.key
            );

            return (
              <section
                key={day.key}
                className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900">{day.label}</h2>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {dayItems.length} حصص
                  </span>
                </div>

                <div className="space-y-3">
                  {dayItems.length === 0 && (
                    <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-400">
                      {loading ? "جارٍ التحميل..." : "لا توجد حصص"}
                    </div>
                  )}

                  {dayItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="font-bold text-slate-900">
                          {item.period}
                        </h3>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500">
                          {item.time}
                        </span>
                      </div>

                      <p className="text-sm font-bold text-blue-700">
                        {item.subject}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.grade} / {item.section}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.teacher}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        القاعة: {item.room}
                      </p>

                      <div className="mt-3 flex gap-2">
                        <button className="rounded-xl bg-blue-50 p-2 text-blue-700">
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="rounded-xl bg-red-50 p-2 text-red-700"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </section>

        <section className="rounded-3xl bg-blue-50 p-4 border border-blue-100">
          <h2 className="font-bold text-blue-900">ملاحظة تشغيلية</h2>
          <p className="mt-2 text-sm text-blue-800">
            عند ربط قاعدة البيانات، سيتم استخدام هذا الجدول لفتح صفحة التحضير تلقائيًا حسب اليوم والحصة والمعلم والشعبة.
          </p>
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
  value: number;
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