"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  Search,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";

type LoginStatus = "success" | "failed";

type LoginLog = {
  id: number;
  userName: string;
  role: string;
  device: string;
  ip: string;
  date: string;
  time: string;
  status: LoginStatus;
  note: string;
};

const initialLogs: LoginLog[] = [
  {
    id: 1,
    userName: "وكيل المدرسة",
    role: "وكيل",
    device: "Chrome / Windows",
    ip: "192.168.1.25",
    date: "2026-06-25",
    time: "08:30",
    status: "success",
    note: "تسجيل دخول ناجح",
  },
  {
    id: 2,
    userName: "أ. عبدالله الحربي",
    role: "معلم",
    device: "Safari / iPhone",
    ip: "192.168.1.31",
    date: "2026-06-25",
    time: "08:10",
    status: "success",
    note: "تسجيل دخول ناجح",
  },
  {
    id: 3,
    userName: "school.admin",
    role: "إداري",
    device: "Chrome / Android",
    ip: "192.168.1.44",
    date: "2026-06-25",
    time: "07:55",
    status: "failed",
    note: "كلمة مرور غير صحيحة",
  },
];

const statusLabels: Record<LoginStatus, string> = {
  success: "ناجح",
  failed: "فشل",
};

const statusClasses: Record<LoginStatus, string> = {
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function LoginLogPage() {
  const [logs] = useState<LoginLog[]>(initialLogs);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LoginStatus>("all");

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        log.userName.includes(search) ||
        log.role.includes(search) ||
        log.device.includes(search) ||
        log.ip.includes(search) ||
        log.note.includes(search);

      const matchesStatus =
        statusFilter === "all" || log.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [logs, search, statusFilter]);

  return (
    <section className="px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-sm font-bold text-blue-700">سجل الدخول</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            عمليات تسجيل الدخول
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            متابعة محاولات الدخول الناجحة والفاشلة حسب المستخدم والجهاز والوقت.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat title="إجمالي المحاولات" value={logs.length} icon={<ShieldCheck size={22} />} />
          <Stat title="ناجحة" value={logs.filter((l) => l.status === "success").length} icon={<CheckCircle2 size={22} />} />
          <Stat title="فاشلة" value={logs.filter((l) => l.status === "failed").length} icon={<XCircle size={22} />} />
          <Stat title="أجهزة مختلفة" value={new Set(logs.map((l) => l.device)).size} icon={<Smartphone size={22} />} />
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
                placeholder="ابحث بالمستخدم، الدور، الجهاز، IP، الملاحظة"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | LoginStatus)
              }
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">كل الحالات</option>
              <option value="success">ناجح</option>
              <option value="failed">فشل</option>
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

        <section className="hidden overflow-hidden rounded-3xl bg-white shadow-sm border border-slate-100 lg:block">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4">#</th>
                <th className="p-4">المستخدم</th>
                <th className="p-4">الدور</th>
                <th className="p-4">الجهاز</th>
                <th className="p-4">IP</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">الوقت</th>
                <th className="p-4">الحالة</th>
                <th className="p-4">الملاحظة</th>
              </tr>
            </thead>

            <tbody>
              {filteredLogs.map((log, index) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="p-4 font-bold">{index + 1}</td>
                  <td className="p-4 font-bold text-slate-900">{log.userName}</td>
                  <td className="p-4">{log.role}</td>
                  <td className="p-4">{log.device}</td>
                  <td className="p-4">{log.ip}</td>
                  <td className="p-4">{log.date}</td>
                  <td className="p-4">{log.time}</td>
                  <td className="p-4">
                    <Status status={log.status} />
                  </td>
                  <td className="p-4">{log.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-3 lg:hidden">
          {filteredLogs.map((log) => (
            <article
              key={log.id}
              className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">{log.userName}</h2>
                  <p className="mt-1 text-sm text-slate-500">{log.role}</p>
                </div>
                <Status status={log.status} />
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                <Info label="الجهاز" value={log.device} />
                <Info label="IP" value={log.ip} />
                <Info label="الوقت" value={`${log.date} — ${log.time}`} />
                <Info label="الملاحظة" value={log.note} />
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-3xl bg-yellow-50 p-4 border border-yellow-100">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="mt-1 text-yellow-700" />
            <div>
              <h2 className="font-bold text-yellow-900">تنبيه أمني</h2>
              <p className="mt-2 text-sm text-yellow-800">
                عند تكرار محاولات الدخول الفاشلة، يفضّل تفعيل القفل المؤقت للحساب وربط السجل بتنبيهات الإدارة.
              </p>
            </div>
          </div>
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

function Status({ status }: { status: LoginStatus }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses[status]}`}
    >
      {statusLabels[status]}
    </span>
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