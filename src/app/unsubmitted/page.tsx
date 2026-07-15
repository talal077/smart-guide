"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileDown,
  Search,
  Send,
} from "lucide-react";

type SubmissionStatus = "not_submitted" | "late" | "submitted";

type ClassSubmission = {
  id: number;
  grade: string;
  section: string;
  period: string;
  subject: string;
  teacher: string;
  date: string;
  expectedTime: string;
  submittedAt: string | null;
  status: SubmissionStatus;
};

const initialSubmissions: ClassSubmission[] = [
  {
    id: 1,
    grade: "الأول الثانوي",
    section: "أ",
    period: "الحصة الثانية",
    subject: "الرياضيات",
    teacher: "أ. عبدالله الحربي",
    date: "2026-06-25",
    expectedTime: "08:15",
    submittedAt: null,
    status: "not_submitted",
  },
  {
    id: 2,
    grade: "الثاني الثانوي",
    section: "ب",
    period: "الحصة الثالثة",
    subject: "الفيزياء",
    teacher: "أ. محمد السلمي",
    date: "2026-06-25",
    expectedTime: "09:10",
    submittedAt: "09:25",
    status: "late",
  },
  {
    id: 3,
    grade: "الثالث الثانوي",
    section: "ج",
    period: "الحصة الأولى",
    subject: "اللغة العربية",
    teacher: "أ. فهد العوفي",
    date: "2026-06-25",
    expectedTime: "07:35",
    submittedAt: "07:30",
    status: "submitted",
  },
];

const statusLabels: Record<SubmissionStatus, string> = {
  not_submitted: "لم يتم الرفع",
  late: "رفع متأخر",
  submitted: "تم الرفع",
};

const statusClasses: Record<SubmissionStatus, string> = {
  not_submitted: "bg-red-100 text-red-700",
  late: "bg-yellow-100 text-yellow-700",
  submitted: "bg-green-100 text-green-700",
};

export default function UnsubmittedPage() {
  const [records, setRecords] = useState<ClassSubmission[]>(initialSubmissions);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SubmissionStatus>(
    "all"
  );

  const filtered = useMemo(() => {
    return records.filter((item) => {
      const matchesSearch =
        item.grade.includes(search) ||
        item.section.includes(search) ||
        item.period.includes(search) ||
        item.subject.includes(search) ||
        item.teacher.includes(search);

      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [records, search, statusFilter]);

  function markSubmitted(id: number) {
    setRecords((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "submitted",
              submittedAt: new Date().toLocaleTimeString("ar-SA", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            }
          : item
      )
    );
  }

  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">عدم الرفع</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            الشعب المتأخرة في رفع التحضير
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            متابعة الشعب التي لم ترفع التحضير أو رفعت بعد الوقت المحدد.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat title="كل الشعب" value={records.length} />
          <Stat
            title="لم يتم الرفع"
            value={records.filter((r) => r.status === "not_submitted").length}
          />
          <Stat
            title="رفع متأخر"
            value={records.filter((r) => r.status === "late").length}
          />
          <Stat
            title="تم الرفع"
            value={records.filter((r) => r.status === "submitted").length}
          />
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالصف، الشعبة، الحصة، المادة، المعلم"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | SubmissionStatus)
              }
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">كل الحالات</option>
              <option value="not_submitted">لم يتم الرفع</option>
              <option value="late">رفع متأخر</option>
              <option value="submitted">تم الرفع</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                <FileDown size={18} />
                Excel
              </button>
              <button className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                <Download size={18} />
                PDF
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                    <AlertTriangle size={22} />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        {item.grade} / شعبة {item.section}
                      </h2>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses[item.status]}`}
                      >
                        {statusLabels[item.status]}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {item.period} — {item.subject} — {item.teacher}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <CalendarDays size={16} />
                  {item.date}
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-4">
                <Info label="وقت الرفع المتوقع" value={item.expectedTime} />
                <Info label="وقت الرفع الفعلي" value={item.submittedAt || "-"} />
                <Info label="الحالة" value={statusLabels[item.status]} />
                <Info label="المعلم" value={item.teacher} />
              </div>

              {item.status !== "submitted" && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  <button className="flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white">
                    <Send size={18} />
                    إرسال تنبيه للمعلم
                  </button>

                  <button
                    onClick={() => markSubmitted(item.id)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3 text-sm font-bold text-white"
                  >
                    <CheckCircle2 size={18} />
                    تم الرفع
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-3xl bg-white p-4 text-center shadow-sm border border-slate-100">
      <Clock3 className="mx-auto mb-2 text-blue-700" size={22} />
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