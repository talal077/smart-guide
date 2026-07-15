"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Edit3,
  Eye,
  Megaphone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

type NewsStatus = "published" | "draft";

type NewsItem = {
  id: number;
  title: string;
  category: string;
  audience: string;
  date: string;
  status: NewsStatus;
  summary: string;
};

const initialNews: NewsItem[] = [
  {
    id: 1,
    title: "تنبيه بشأن رفع التحضير اليومي",
    category: "تنبيه إداري",
    audience: "المعلمون",
    date: "2026-06-25",
    status: "published",
    summary: "يرجى رفع التحضير مباشرة بعد بداية كل حصة وفق الجدول الدراسي.",
  },
  {
    id: 2,
    title: "اعتماد الحصر المباشر اليومي",
    category: "تحديث نظام",
    audience: "الوكلاء والإداريون",
    date: "2026-06-24",
    status: "published",
    summary: "تم تفعيل بطاقة الحصر المباشر اليومي لمتابعة الحضور والغياب فورًا.",
  },
  {
    id: 3,
    title: "تذكير بتحديث بيانات الطلاب",
    category: "إدارة الطلاب",
    audience: "الإداريون",
    date: "2026-06-23",
    status: "draft",
    summary: "تحديث بيانات الطلاب المستوردة من نظام نور قبل اعتماد التقارير.",
  },
];

const statusLabels: Record<NewsStatus, string> = {
  published: "منشور",
  draft: "مسودة",
};

const statusClasses: Record<NewsStatus, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
};

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>(initialNews);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | NewsStatus>("all");

  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      const matchesSearch =
        item.title.includes(search) ||
        item.category.includes(search) ||
        item.audience.includes(search) ||
        item.summary.includes(search);

      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [news, search, statusFilter]);

  function deleteNews(id: number) {
    setNews((prev) => prev.filter((item) => item.id !== id));
  }

  function toggleStatus(id: number) {
    setNews((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: item.status === "published" ? "draft" : "published",
            }
          : item
      )
    );
  }

  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">الأخبار والتنبيهات</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            مركز أخبار المدرسة
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            نشر التنبيهات والتحديثات الإدارية لمستخدمي النظام حسب الفئة المستهدفة.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat title="كل الأخبار" value={news.length} />
          <Stat title="منشورة" value={news.filter((n) => n.status === "published").length} />
          <Stat title="مسودات" value={news.filter((n) => n.status === "draft").length} />
          <Stat title="الفئات" value={new Set(news.map((n) => n.category)).size} />
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search
                size={18}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث بالعنوان، التصنيف، الفئة، المحتوى"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | NewsStatus)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">كل الحالات</option>
              <option value="published">منشور</option>
              <option value="draft">مسودة</option>
            </select>

            <button className="flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">
              <Plus size={18} />
              إضافة خبر
            </button>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {filteredNews.map((item) => (
            <article
              key={item.id}
              className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <Megaphone size={22} />
                </div>

                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses[item.status]}`}>
                  {statusLabels[item.status]}
                </span>
              </div>

              <p className="text-xs font-bold text-blue-700">{item.category}</p>
              <h2 className="mt-2 text-lg font-black text-slate-900">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {item.summary}
              </p>

              <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm">
                <Info label="الفئة المستهدفة" value={item.audience} />
                <Info label="تاريخ النشر" value={item.date} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-xl bg-slate-100 p-2 text-slate-600">
                  <Eye size={17} />
                </button>
                <button className="rounded-xl bg-blue-50 p-2 text-blue-700">
                  <Edit3 size={17} />
                </button>
                <button
                  onClick={() => toggleStatus(item.id)}
                  className="rounded-xl bg-green-50 p-2 text-green-700"
                >
                  <Bell size={17} />
                </button>
                <button
                  onClick={() => deleteNews(item.id)}
                  className="rounded-xl bg-red-50 p-2 text-red-700"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </section>

        {filteredNews.length === 0 && (
          <section className="rounded-3xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <p className="font-bold text-slate-500">لا توجد أخبار مطابقة للبحث.</p>
          </section>
        )}
      </div>
    </section>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-center shadow-sm border border-slate-100">
      <Megaphone className="mx-auto mb-2 text-blue-700" size={22} />
      <p className="text-sm text-slate-500">{title}</p>
      <h3 className="mt-1 text-2xl font-bold text-slate-900">{value}</h3>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-slate-400">{label}: </span>
      <b className="text-slate-800">{value}</b>
    </p>
  );
}
