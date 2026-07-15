"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileDown,
  FileText,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type ExcuseStatus = "pending" | "approved" | "rejected";

type Excuse = {
  id: number;
  studentName: string;
  nationalId: string;
  grade: string;
  section: string;
  absenceDate: string;
  submittedAt: string;
  reason: string;
  attachment: string;
  status: ExcuseStatus;
};

const initialExcuses: Excuse[] = [
  {
    id: 1,
    studentName: "خالد أحمد الحربي",
    nationalId: "1098745632",
    grade: "الأول الثانوي",
    section: "أ",
    absenceDate: "2026-06-25",
    submittedAt: "2026-06-25 10:30",
    reason: "موعد طبي",
    attachment: "medical-report.pdf",
    status: "pending",
  },
  {
    id: 2,
    studentName: "سعد محمد الجهني",
    nationalId: "1087654321",
    grade: "الثاني الثانوي",
    section: "ب",
    absenceDate: "2026-06-24",
    submittedAt: "2026-06-24 12:15",
    reason: "ظرف عائلي",
    attachment: "parent-note.pdf",
    status: "approved",
  },
  {
    id: 3,
    studentName: "ريان سامي البلوي",
    nationalId: "1076543210",
    grade: "الثالث الثانوي",
    section: "ج",
    absenceDate: "2026-06-23",
    submittedAt: "2026-06-23 09:20",
    reason: "عذر غير مكتمل",
    attachment: "empty.pdf",
    status: "rejected",
  },
];

const statusLabels: Record<ExcuseStatus, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};

const statusClasses: Record<ExcuseStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function ExcusesPage() {
  const [excuses, setExcuses] = useState<Excuse[]>(initialExcuses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ExcuseStatus>("all");

  const filteredExcuses = useMemo(() => {
    return excuses.filter((excuse) => {
      const matchesSearch =
        excuse.studentName.includes(search) ||
        excuse.nationalId.includes(search) ||
        excuse.grade.includes(search) ||
        excuse.section.includes(search) ||
        excuse.reason.includes(search);

      const matchesStatus =
        statusFilter === "all" || excuse.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [excuses, search, statusFilter]);

  function updateStatus(id: number, status: ExcuseStatus) {
    setExcuses((prev) =>
      prev.map((excuse) =>
        excuse.id === id ? { ...excuse, status } : excuse
      )
    );
  }

  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">الأعذار</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            مراجعة أعذار الغياب
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            قبول أو رفض أعذار الطلاب وتحويل الغياب إلى بعذر حسب الصلاحية.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat title="كل الأعذار" value={excuses.length} />
          <Stat
            title="قيد المراجعة"
            value={excuses.filter((e) => e.status === "pending").length}
          />
          <Stat
            title="مقبولة"
            value={excuses.filter((e) => e.status === "approved").length}
          />
          <Stat
            title="مرفوضة"
            value={excuses.filter((e) => e.status === "rejected").length}
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
                placeholder="ابحث باسم الطالب، الهوية، الصف، السبب"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | ExcuseStatus)
              }
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">كل الحالات</option>
              <option value="pending">قيد المراجعة</option>
              <option value="approved">مقبول</option>
              <option value="rejected">مرفوض</option>
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
          {filteredExcuses.map((excuse) => (
            <article
              key={excuse.id}
              className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <FileText size={22} />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        {excuse.studentName}
                      </h2>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses[excuse.status]}`}
                      >
                        {statusLabels[excuse.status]}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {excuse.grade} / شعبة {excuse.section} — الهوية:{" "}
                      {excuse.nationalId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <Clock3 size={16} />
                  {excuse.submittedAt}
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-4">
                <Info label="تاريخ الغياب" value={excuse.absenceDate} />
                <Info label="سبب العذر" value={excuse.reason} />
                <Info label="المرفق" value={excuse.attachment} />
                <Info label="الحالة" value={statusLabels[excuse.status]} />
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <button className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                  <Eye size={18} />
                  عرض المرفق
                </button>

                <button
                  onClick={() => updateStatus(excuse.id, "approved")}
                  disabled={excuse.status === "approved"}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300"
                >
                  <CheckCircle2 size={18} />
                  قبول العذر
                </button>

                <button
                  onClick={() => updateStatus(excuse.id, "rejected")}
                  disabled={excuse.status === "rejected"}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-red-700 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300"
                >
                  <XCircle size={18} />
                  رفض العذر
                </button>
              </div>
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
      <ShieldCheck className="mx-auto mb-2 text-blue-700" size={22} />
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